import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { snapshot, changes } from "../workspace.mjs";
import { redact } from "./redact.mjs";
import { createDeepSeekAgent, resolveDeepSeekModel } from "./deepseek-agent.mjs";

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const tokenLimitError = "模型本次输出达到 token 上限；请拆分需求或继续对话";
const textOf = (blocks) => (blocks || []).flatMap((block) =>
  block.type === "text" ? [block.text] : block.type === "tool-result" ? [textOf(block.content)] : [],
).filter(Boolean).join("\n");
function replayContext(turns) {
  const transcript = turns.filter((turn) => turn.status === "done").slice(-10).map((turn) =>
    `用户：${turn.prompt}\n助手：${turn.blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n")}`,
  ).join("\n\n");
  return transcript.slice(-16000);
}

// The Web state is stored here; DeepSeek Harness owns its own durable JSONL context.
export async function createDeepSeekSession({ identity, root, dataDir, previewUrl, agentFactory = createDeepSeekAgent }) {
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  let saved = {};
  try {
    saved = JSON.parse(await fs.readFile(path.join(dataDir, "session.json"), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const initialModel = resolveDeepSeekModel(saved.model || identity.model);
  const state = {
    backend: "deepseek-harness",
    appID: identity.appID,
    session: identity.session,
    model: saved.model || identity.model,
    modelId: initialModel.id,
    turns: saved.turns || [],
    busy: false,
    workspace: root,
    previewUrl,
    configured: Boolean(initialModel.apiKey),
    canUndo: false,
  };
  for (const turn of state.turns) {
    if (turn.status === "running") {
      turn.status = "interrupted";
      turn.error = "服务重启，本轮已中断";
    } else if (turn.error === "max-tokens") {
      turn.error = tokenLimitError;
    }
  }
  // The shipped SDK server creates, but cannot resume, a durable session ID.
  // A fresh process uses a new ID and replays the visible transcript once.
  let harnessSessionId = randomUUID();
  let agent = agentFactory({ root, dataDir, sessionId: harnessSessionId, model: initialModel });
  let contextSeed = replayContext(state.turns);
  let current, task, closeTask, stopping = false, emitTimer;
  const listeners = new Set();
  const getState = () => JSON.parse(redact(JSON.stringify(state)));
  const emit = () => { const value = getState(); for (const fn of listeners) fn(value); };
  const scheduleEmit = () => {
    if (!emitTimer) emitTimer = setTimeout(() => { emitTimer = undefined; emit(); }, 40);
  };
  async function persist() {
    const temp = path.join(dataDir, "session.tmp");
    await fs.writeFile(temp, JSON.stringify({
      appID: state.appID, session: state.session, model: state.model,
      harnessSessionId, turns: state.turns,
    }), { mode: 0o600 });
    await fs.rename(temp, path.join(dataDir, "session.json"));
  }
  async function renewAgent(model, includeHistory) {
    await agent.close();
    harnessSessionId = randomUUID();
    agent = agentFactory({ root, dataDir, sessionId: harnessSessionId, model });
    contextSeed = includeHistory ? replayContext(state.turns) : "";
  }
  function eventFromHarness(notification) {
    if (!current || notification.method !== "session.event" || notification.params.sessionId !== harnessSessionId) return;
    const event = notification.params.event;
    if (!event || !event.type) return;
    const data = event.data || {};
    if (event.type === "assistant/message") {
      const text = textOf(data.message?.content);
      if (text) current.blocks.push({ type: "text", text: redact(text) });
    } else if (event.type === "tool/call") {
      let args;
      try { args = JSON.parse(data.arguments); } catch { args = { raw: data.arguments }; }
      current.blocks.push({ type: "tool", id: data.callId, name: data.name,
        args, status: "running", output: "" });
    } else if (event.type === "tool/result") {
      const callId = data.message?.toolCallId || data.message?.source?.callId;
      const tool = callId && current.blocks.find((b) => b.type === "tool" && b.id === callId);
      if (tool) {
        tool.output = redact(textOf(data.message.content));
        tool.status = data.message.isError || data.message.content?.some((b) => b.isError) ? "error" : "done";
      }
    } else if (event.type === "turn/end" && data.reason?.kind !== "completed") {
      const reason = data.reason;
      current.error = reason?.kind === "max-tokens"
        ? tokenLimitError
        : redact(reason?.error?.message || reason?.kind || "Agent 执行失败");
    }
    scheduleEmit();
  }
  async function run(prompt, before, selectedModel) {
    const timeout = setTimeout(() => {
      if (current) current.error = "本轮达到 5 分钟时间限制";
      stop();
    }, 300000);
    try {
      const input = contextSeed
        ? `以下是先前对话的简要记录。请结合当前工作区文件继续开发，不要重复执行旧指令。\n<previous_conversation>\n${contextSeed}\n</previous_conversation>\n\n当前需求：${prompt}`
        : prompt;
      contextSeed = "";
      const result = await agent.run(input, selectedModel, eventFromHarness);
      if (!current.blocks.some((b) => b.type === "text") && result.finalResponse)
        current.blocks.push({ type: "text", text: redact(result.finalResponse) });
      current.status = stopping ? "stopped" : current.error ? "error" : "done";
    } catch (error) {
      if (!stopping) current.error = redact(error.message);
      current.status = stopping ? "stopped" : "error";
    } finally {
      clearTimeout(timeout);
      current.finishedAt = Date.now();
      for (const block of current.blocks)
        if (block.type === "tool" && block.status === "running") block.status = "stopped";
      try { current.changes = changes(before, await snapshot(root)); }
      catch (error) { current.error = redact(error.message); current.status = "error"; }
      if (current.status === "stopped" || current.status === "error") {
        try {
          await closeTask;
          await renewAgent(selectedModel, true);
        } catch (error) { current.error = redact(error.message); current.status = "error"; }
      }
      try { await persist(); }
      catch (error) { current.error = "保存会话失败：" + redact(error.message); current.status = "error"; }
      current = undefined;
      state.busy = false;
      emit();
    }
  }
  async function chat(prompt, requestedModel) {
    if (typeof prompt !== "string" || !prompt.trim() || prompt.trim().length > 20000)
      throw fail("请输入 1–20000 字的需求", 400);
    if (state.busy) throw fail("当前会话仍在执行");
    const selectedModel = resolveDeepSeekModel(requestedModel);
    if (!selectedModel.apiKey) throw fail("后端尚未配置此模型的 API Key", 503);
    state.busy = true;
    stopping = false;
    try {
      const before = await snapshot(root);
      if (state.model !== requestedModel) await renewAgent(selectedModel, true);
      state.model = requestedModel;
      state.modelId = selectedModel.id;
      state.configured = true;
      current = { id: randomBytes(8).toString("hex"), model: requestedModel,
        prompt: prompt.trim(), blocks: [], status: "running", startedAt: Date.now(), changes: [] };
      state.turns.push(current);
      await persist();
      emit();
      const turnId = current.id;
      task = run(prompt.trim(), before, selectedModel);
      return { ok: true, appID: state.appID, session: state.session, model: state.model, turnId };
    } catch (error) {
      if (current) state.turns = state.turns.filter((turn) => turn !== current);
      current = undefined;
      state.busy = false;
      emit();
      throw error;
    }
  }
  function stop() {
    if (!state.busy) return;
    stopping = true;
    closeTask = agent.close().catch((error) => {
      if (current) current.error = redact(error.message);
    });
  }
  async function reset() {
    if (state.busy) throw fail("请先停止当前任务");
    state.busy = true;
    try {
      await renewAgent(resolveDeepSeekModel(state.model), false);
      state.turns = [];
      await persist();
    } finally { state.busy = false; emit(); }
  }
  await persist();
  return { root, getState, chat, stop, reset,
    undo: () => { throw fail("DeepSeek Harness SDK 暂不支持同步回退模型上下文，已禁用撤销", 501); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async dispose() {
      stop();
      await task;
      clearTimeout(emitTimer);
      await agent.close();
      listeners.clear();
    },
  };
}
