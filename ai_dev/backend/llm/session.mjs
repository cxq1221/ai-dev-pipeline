import { createPiAgent } from "./pi-agent.mjs";
import { resolveModel } from "./models.mjs";
import { redact } from "../redact.mjs";
import { git } from "../shared/files.mjs";

export async function createSession({
  workspacePath,
  dataDir,
  model = "deepseek-flash",
  messages = [],
  modelBaseUrl,
  systemPrompt,
  allowedTools,
  tools,
  callTool,
  skillsRoot,
}) {
  const config = resolveModel(model);
  if (modelBaseUrl) {
    config.model = { ...config.model, baseUrl: modelBaseUrl };
    config.apiKey = "local-test";
  }
  const agent = await createPiAgent({
    root: workspacePath,
    dataDir,
    modelConfig: config,
    messages,
    systemPrompt,
    allowedTools,
    tools,
    callTool,
    skillsRoot,
  });
  let turn = null,
    busy = false,
    task,
    stopping = false;
  const acceptedTurns = new Set();
  let emitTimer;
  const listeners = new Set();
  const state = () =>
    JSON.parse(
      redact(
        JSON.stringify({
          busy,
          turn: turn && { ...turn, status: busy ? "running" : turn.status },
          messages: agent.state.messages,
        }),
      ),
    );
  const emit = () => {
    for (const fn of listeners) fn(state());
  };
  agent.subscribe((event) => {
    if (!busy) return;
    if (event.type === "tool_execution_start" && !allowedTools?.includes(event.toolName)) {
      turn.error = `工具 ${event.toolName} 未获本轮授权`;
      void agent.abort();
    }
    if (event.type === "message_start" && event.message.role === "assistant")
      turn.blocks.push({ type: "text", text: "" });
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      const b = turn.blocks.findLast((b) => b.type === "text");
      if (b) b.text += event.assistantMessageEvent.delta;
    }
    if (event.type === "message_end" && event.message.errorMessage)
      turn.error = event.message.errorMessage;
    if (event.type === "tool_execution_start")
      turn.blocks.push({
        type: "tool",
        id: event.toolCallId,
        name: event.toolName,
        args: event.args,
        status: "running",
        output: "",
      });
    if (["tool_execution_update", "tool_execution_end"].includes(event.type)) {
      const b = turn.blocks.find((b) => b.id === event.toolCallId),
        result = event.result || event.partialResult;
      if (b) {
        b.output =
          result?.content
            ?.filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n") || "";
        if (event.type === "tool_execution_end")
          b.status = event.isError ? "error" : "done";
      }
    }
    if (!emitTimer)
      emitTimer = setTimeout(() => {
        emitTimer = null;
        emit();
      }, 60);
  });
  return {
    state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    chat({ turnId, message, skills = [], resumeTurn }) {
      if (!turnId || typeof turnId !== "string")
        throw Object.assign(new Error("缺少执行轮次 ID"), { status: 400 });
      if (acceptedTurns.has(turnId)) return { turnId };
      if (busy)
        throw Object.assign(new Error("当前会话仍在执行"), { status: 409 });
      if (!message?.trim() || message.length > 20000)
        throw Object.assign(new Error("请输入 1–20000 字"), { status: 400 });
      const skillPrompt = skills.map(s => `用户指定 Skill：${s.name}\n${s.content}`).join("\n\n");
      busy = true;
      stopping = false;
      acceptedTurns.add(turnId);
      turn = {
        id: turnId,
        prompt: (skills.length ? `[Skill: ${skills.map(s => s.name).join(", ")}]\n` : "") + message,
        blocks: [],
        changes: [],
        status: "running",
        startedAt: Date.now(),
      };
      if (resumeTurn) turn = { ...resumeTurn, status: "running" };
      task = (async () => {
        try {
          if (resumeTurn) await agent.continue();
          else await agent.prompt(
            (skillPrompt ? `${skillPrompt}\n\n` : "") + message,
          );
          turn.status = stopping ? "stopped" : turn.error ? "error" : "done";
        } catch (e) {
          turn.status = stopping ? "stopped" : "error";
          turn.error = redact(e.message);
        } finally {
          try {
            turn.sourceRef = {
              commit: await git(workspacePath, "rev-parse", "HEAD"),
              branch: await git(workspacePath, "branch", "--show-current"),
              dirty: Boolean(await git(workspacePath, "status", "--porcelain")),
            };
          } catch {
            /* Direct SDK smoke may use a non-Git scratch directory. */
          }
          busy = false;
          turn.finishedAt = Date.now();
          clearTimeout(emitTimer);
          emitTimer = null;
          emit();
        }
      })();
      return { turnId };
    },
    async stop() {
      stopping = true;
      await agent.abort();
      await task;
      return state();
    },
    async close() {
      if (busy) {
        stopping = true;
        await agent.abort();
        await task;
      }
      agent.dispose();
    },
  };
}
