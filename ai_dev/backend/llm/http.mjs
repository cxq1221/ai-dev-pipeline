import express from "express";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { createSession } from "./session.mjs";
import { openStore } from "./store.mjs";
import { localOnly, listen, closeServer } from "../local-http.mjs";
import { redact } from "../redact.mjs";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const validId = id => typeof id === "string" && /^[a-zA-Z0-9-]{1,100}$/.test(id);
export async function startLlmBackend({ port = 4418, dataRoot = path.resolve(".data/llm"), modelBaseUrl, databaseUrl = process.env.LLM_DATABASE_URL } = {}) {
  const store = await openStore(databaseUrl);
  const app = express(), active = new Map(), operations = new Map();
  async function serial(id, fn) {
    const previous = operations.get(id) || Promise.resolve();
    const task = previous.catch(() => {}).then(fn);
    operations.set(id, task);
    try { return await task; } finally { if (operations.get(id) === task) operations.delete(id); }
  }
  app.use(localOnly({ internal: true }), express.json({ limit: "10mb" }));
  app.get("/health", (_req, res) => res.json({ ok: true, service: "llm" }));
  const view = row => ({ sessionId: row.session_id, state: row.state, current: row.current, requiredActions: row.calls.filter(c => !c.result && row.state !== "idle").map(({ toolCallId, name, args }) => ({ toolCallId, name, args })) });
  async function execution(id) {
    const row = await store.execution(id);
    if (row && row.state !== "idle" && !active.has(id)) {
      row.state = "idle";
      row.current = { ...row.current, status: "interrupted", error: "执行进程已中断；请检查当前代码后继续", finishedAt: Date.now() };
      await store.save(row.request, row.state, row.current, row.calls);
    }
    return row;
  }
  app.get("/sessions/:id", async (req, res) => serial(req.params.id, async () => {
    const row = await execution(req.params.id);
    if (!row) throw fail("会话不存在", 404);
    res.json(view(row));
  }));
  function publish(live, payload, snapshot) {
    live.pending = live.pending.then(async () => {
      live.current = snapshot.turn;
      live.state = snapshot.busy ? (live.stopping ? "stopping" : live.calls.some(c => !c.result) ? "waiting_tool" : "running") : "idle";
      await store.save(live.input, live.state, live.current, live.calls, snapshot.messages);
      for (const listener of live.listeners) listener(payload);
      if (!snapshot.busy) {
        await live.session?.close();
        active.delete(live.input.sessionId);
      }
    });
    return live.pending;
  }
  app.post("/chat", async (req, res) => serial(req.body.sessionId, async () => {
    const input = { ...req.body, runId: randomUUID() };
    if (input.action === "tool_result") {
      const row = await execution(input.sessionId);
      const call = row?.calls.find(c => c.toolCallId === input.toolCallId);
      if (!call) throw fail("工具调用不存在或已属于上一轮", 409);
      if (call.result) {
        if (!isDeepStrictEqual(call.result, input.result)) throw fail("工具结果冲突", 409);
        return res.json({ accepted: true });
      }
      const live = active.get(input.sessionId);
      if (!live || live.stopping || row.state === "idle") throw fail("工具调用已结束", 409);
      if (!Array.isArray(input.result?.content)) throw fail("工具结果必须包含 content");
      const pending = live.calls.find(c => c.toolCallId === input.toolCallId);
      pending.result = input.result;
      await publish(live, { type: "tool_result", toolCallId: input.toolCallId, result: input.result }, live.session.state());
      live.resolvers.get(input.toolCallId)(input.result);
      live.resolvers.delete(input.toolCallId);
      return res.json({ accepted: true });
    }
    if (!validId(input.sessionId)) throw fail("会话 ID 无效");
    if (input.action && input.action !== "send") throw fail("未知 chat 操作");
    const saved = await store.session(input.sessionId);
    input.workspacePath ||= saved?.workspace_path;
    if (!path.isAbsolute(input.workspacePath || "") || typeof input.message !== "string" || !input.message.trim() || input.message.length > 20000) throw fail("工作区或消息无效");
    const builtin = ["read", "write", "edit", "bash", "list_files"];
    const tools = input.tools || [], skills = input.skills || [], allowed = input.allowedTools || [];
    if (!Array.isArray(tools) || !Array.isArray(skills) || !Array.isArray(allowed)) throw fail("能力配置必须是数组");
    const names = tools.map(t => t?.name);
    if (names.some(n => typeof n !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(n) || builtin.includes(n)) || new Set(names).size !== names.length) throw fail("工具名称重复或与内置工具冲突");
    if (tools.some(t => typeof t.description !== "string" || t.parameters?.type !== "object") || skills.some(s => typeof s.name !== "string" || typeof s.content !== "string")) throw fail("Tool 或 Skill 定义无效");
    if (allowed.some(n => !builtin.includes(n) && !names.includes(n))) throw fail("授权了未定义的工具");
    await execution(input.sessionId);
    await active.get(input.sessionId)?.pending;
    const { session: context, current } = await store.accept(input);
    const live = { input, current, state: "running", listeners: new Set(), calls: [], resolvers: new Map(), pending: Promise.resolve() };
    active.set(input.sessionId, live);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    const listener = event => { res.write(`data: ${JSON.stringify(event)}\n\n`); if (event.type === "done") res.end(); };
    live.listeners.add(listener);
    res.on("close", () => live.listeners.delete(listener));
    try {
      live.session = await createSession({ ...input, messages: context.messages, modelBaseUrl, dataDir: path.join(dataRoot, input.sessionId),
        callTool: (modelCallId, name, args, signal) => new Promise((resolve, reject) => {
          const toolCallId = randomUUID();
          const abort = () => reject(new Error("执行已停止"));
          if (signal?.aborted) return abort();
          signal?.addEventListener("abort", abort, { once: true });
          live.calls.push({ toolCallId, modelCallId, name, args });
          live.resolvers.set(toolCallId, result => { signal?.removeEventListener("abort", abort); resolve(result); });
          publish(live, { type: "tool_call", toolCallId, name, args }, live.session.state()).catch(reject);
        }),
      });
      live.session.subscribe(snapshot => { publish(live, { type: snapshot.busy ? "snapshot" : "done", turn: snapshot.turn }, snapshot); });
      live.session.chat({ turnId: input.runId, message: input.message, skills: input.skills });
    } catch (e) {
      const snapshot = { busy: false, turn: { ...current, status: "error", error: redact(e.message), finishedAt: Date.now() } };
      await publish(live, { type: "done", turn: snapshot.turn }, snapshot);
    }
  }));
  app.post("/stop", async (req, res) => serial(req.body.sessionId, async () => {
    const { sessionId } = req.body;
    if (!validId(sessionId)) throw fail("会话 ID 无效");
    await execution(sessionId);
    const live = active.get(sessionId);
    if (live) {
      live.stopping = true;
      await publish(live, { type: "snapshot", turn: live.current }, live.session.state());
      await live.session.stop();
      await live.pending;
    }
    res.json({ stopped: true });
  }));
  app.use((e, _req, res, _next) => res.status(e.status || 500).json({ error: redact(e.message) }));
  const server = await listen(app, port);
  return { url: `http://127.0.0.1:${server.address().port}`, async close() {
    await Promise.all([...active.values()].map(async live => { await live.session?.close(); await live.pending; }));
    await closeServer(server); await store.close();
  } };
}
