import { randomUUID } from "node:crypto";
export function executorClient(url, chats, sql) {
  const watching = new Map(),
    submitting = new Set();
  const knownSpecs = new Map();
  let gatewayUrl;
  let closed = false, queueTimer, queueTask;
  async function dispatchQueued() {
    const queued = await sql`SELECT id, conversation_id, prompt FROM turns WHERE status='queued' ORDER BY started_at LIMIT 10`;
    for (const turn of queued) {
      if (closed) break;
      try {
        await client.chat(turn.conversation_id, turn.prompt, [], false, turn.id);
      } catch (e) {
        if (e.status === 409) continue;
        await chats.save(turn.conversation_id, { busy: false, turn: { id: turn.id, status: "error", blocks: [], error: e.message, finishedAt: Date.now() } });
      }
    }
  }

  async function request(route, body) {
    const r = await fetch(url + route, {
      signal: AbortSignal.timeout(15000),
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json();
    if (!r.ok) throw Object.assign(new Error(data.error), { status: r.status });
    return data;
  }
  function watch(id) {
    if (watching.has(id)) return;
    const controller = new AbortController();
    const task = (async () => {
      while (!closed && !controller.signal.aborted) {
        try {
          const r = await fetch(url + `/sessions/${id}/events`, {
            signal: controller.signal,
          });
          if (!r.ok) break;
          let buffer = "";
          const decoder = new TextDecoder();
          for await (const bytes of r.body) {
            buffer += decoder.decode(bytes, { stream: true });
            let end;
            while ((end = buffer.indexOf("\n\n")) >= 0) {
              const item = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              if (item.startsWith("data: "))
                await chats.save(id, JSON.parse(item.slice(6)));
            }
          }
        } catch (e) {
          if (!controller.signal.aborted)
            console.warn("执行事件连接中断，将重连");
        }
        if (!closed && !controller.signal.aborted) await Bun.sleep(500);
      }
    })();
    watching.set(id, { controller, task });
    task.finally(() => {
      if (watching.get(id)?.controller === controller) watching.delete(id);
    });
  }
  const client = {
    request,
    setGatewayUrl(value) {
      gatewayUrl = value;
      queueTimer = setInterval(() => {
        if (closed || queueTask) return;
        queueTask = dispatchQueued().catch(() => console.warn("自动开发任务调度失败，将重试")).finally(() => { queueTask = null; });
      }, 200);
    },
    async chat(id, message, skillNames = [], startDevelopment = false, queuedTurnId = null) {
      if (!Array.isArray(skillNames) || skillNames.length > 10 || skillNames.some(n => typeof n !== "string"))
        throw Object.assign(new Error("Skill 选择无效"), { status: 400 });
      skillNames = [...new Set(skillNames)];
      if (skillNames.length) {
        const catalog = await request("/skills");
        if (skillNames.some(n => !catalog.skills.some(s => s.name === n)))
          throw Object.assign(new Error("所选 Skill 已移除或配置无效，请刷新 Skill 列表"), { status: 400 });
      }
      if (
        typeof message !== "string" ||
        !message.trim() ||
        message.length > 20000
      )
        throw Object.assign(new Error("请输入 1–20000 字"), { status: 400 });
      if (submitting.has(id))
        throw Object.assign(new Error("当前会话仍在执行"), { status: 409 });
      submitting.add(id);
      try {
        const c = await chats.get(id),
          [r] =
            await sql`SELECT * FROM requirements WHERE id=${c.requirement_id}`;
        const current = await chats.state(id);
        if (current.turns.some(t => (t.status === "running" || t.status === "queued") && t.id !== queuedTurnId))
          throw Object.assign(new Error("当前会话仍在执行"), { status: 409 });
        const requestDevelopment = c.mode === "clarification" && (startDevelopment || message.trim() === "开始开发");
        if (requestDevelopment && !c.isClarification)
          throw Object.assign(new Error("请在需求澄清会话中完成澄清并申请开始开发"), { status: 409 });
        await request(`/sessions/${id}`, {
          requirementId: r.id,
          workspacePath: r.workspace_path,
          model: c.model,
          messages: c.context_messages,
          gatewayUrl,
        });
        watch(id);
        const turnId = queuedTurnId || randomUUID();
        if (queuedTurnId) {
          const claimed = await sql`UPDATE turns SET status='running' WHERE id=${queuedTurnId} AND conversation_id=${id} AND status='queued'`;
          if (!claimed.affectedRows) return { turnId };
        } else {
          await chats.begin(id, (skillNames.length ? `[Skill: ${skillNames.join(", ")}]\n` : "") + message, turnId);
        }
        const spec = {
          original: r.original_description,
          clarified: r.clarified_description,
        };
        const changed = knownSpecs.get(id) !== JSON.stringify(spec);
        try {
          const result = await request(`/sessions/${id}/chat`, {
            turnId,
            message,
            skillNames,
            mode: c.mode,
            requestDevelopment,
            ...(changed ? { requirement: spec } : {}),
          });
          knownSpecs.set(id, JSON.stringify(spec));
          return result;
        } catch (e) {
          await chats.save(id, {
            turn: {
              id: turnId,
              status: "error",
              blocks: [],
              error: e.message,
              finishedAt: Date.now(),
            },
          });
          throw e;
        }
      } finally {
        submitting.delete(id);
      }
    },
    async state(id) {
      await chats.get(id);
      try {
        const live = await request(`/sessions/${id}`);
        await chats.save(id, live);
        watch(id);
      } catch (e) {
        if (e.status === 404) {
          await sql`UPDATE turns SET status=${"interrupted"},error=${"执行实例已退出；请检查当前代码后继续"},finished_at=${Date.now()} WHERE conversation_id=${id} AND status=${"running"}`;
        } else
          throw Object.assign(
            new Error("执行服务暂时不可用，未将运行任务标为中断"),
            { status: 503 },
          );
      }
      return chats.state(id);
    },
    async close() {
      closed = true;
      clearInterval(queueTimer);
      await queueTask;
      for (const w of watching.values()) w.controller.abort();
      await Promise.all([...watching.values()].map((w) => w.task));
    },
  };
  return client;
}
