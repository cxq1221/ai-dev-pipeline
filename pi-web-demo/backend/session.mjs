import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Agent } from "@earendil-works/pi-agent-core";
import { snapshot, changes, restore } from "../workspace.mjs";
import { createTools } from "./tools.mjs";
import { redact } from "./models.mjs";

const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status });

// One instance owns one app/session's context, workspace, undo history and subscribers.
export async function createSession({
  identity,
  root,
  dataDir,
  previewUrl,
  resolveModel,
  agentFactory = (options) => new Agent(options),
}) {
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  let saved = {};
  try {
    saved = JSON.parse(
      await fs.readFile(path.join(dataDir, "session.json"), "utf8"),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  let modelConfig = resolveModel(saved.model || identity.model);
  const state = {
    appID: identity.appID,
    session: identity.session,
    model: modelConfig.model.id,
    modelId: modelConfig.model.id,
    turns: saved.turns || [],
    busy: false,
    workspace: root,
    previewUrl,
    configured: Boolean(modelConfig.apiKey),
  };
  for (const turn of state.turns)
    if (turn.status === "running") {
      turn.status = "interrupted";
      turn.error = "服务重启，本轮已中断";
    }
  let undo = saved.undo || null,
    current = null,
    block = null,
    stopping = false;
  let emitTimer, task;
  const listeners = new Set();
  const getState = () =>
    JSON.parse(
      redact(
        JSON.stringify({ ...state, canUndo: !state.busy && Boolean(undo) }),
      ),
    );
  function emit() {
    const value = getState();
    for (const listener of listeners) listener(value);
  }
  function scheduleEmit() {
    if (!emitTimer)
      emitTimer = setTimeout(() => {
        emitTimer = null;
        emit();
      }, 40);
  }
  const agent = agentFactory({
    initialState: {
      model: modelConfig.model,
      thinkingLevel: "off",
      systemPrompt: `你是编码助手。用中文简洁沟通，直接调用工具完成用户要求。工作目录是 ${root}，只读写此目录，不访问其他目录、密钥或系统配置。先检查已有文件再修改。实现后执行适当验证并如实汇报。默认创建无需构建的 HTML/CSS/JavaScript 网页，入口 index.html，静态预览服务器已经启动，不要启动任何服务器。必须使用真实工具结果，不能编造测试结果。多轮对话继续修改当前项目。不要提交、推送、部署，除非用户明确要求。不要使用后台进程。`,
      tools: createTools(root, redact),
      messages: saved.messages || [],
    },
    streamFn: modelConfig.streamFn,
    getApiKey: () => modelConfig.apiKey,
    toolExecution: "sequential",
  });
  async function persist() {
    const temp = path.join(dataDir, "session.tmp");
    await fs.writeFile(
      temp,
      JSON.stringify({
        appID: state.appID,
        session: state.session,
        model: state.model,
        turns: state.turns,
        messages: agent.state.messages,
        undo,
      }),
      { mode: 0o600 },
    );
    await fs.rename(temp, path.join(dataDir, "session.json"));
  }
  const unsubscribe = agent.subscribe((event) => {
    if (!current) return;
    if (event.type === "message_start" && event.message.role === "assistant") {
      block = { type: "text", text: "" };
      current.blocks.push(block);
    }
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta" &&
      block
    )
      block.text += redact(event.assistantMessageEvent.delta);
    if (
      event.type === "message_end" &&
      event.message.role === "assistant" &&
      event.message.errorMessage
    )
      current.error = redact(event.message.errorMessage);
    if (event.type === "tool_execution_start")
      current.blocks.push({
        type: "tool",
        id: event.toolCallId,
        name: event.toolName,
        args: event.args,
        status: "running",
        output: "",
      });
    if (
      event.type === "tool_execution_update" ||
      event.type === "tool_execution_end"
    ) {
      const tool = current.blocks.find((b) => b.id === event.toolCallId),
        result = event.result || event.partialResult;
      if (tool) {
        tool.output = redact(
          result?.content
            ?.filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n") || "",
        );
        if (event.type === "tool_execution_end")
          tool.status = event.isError || result?.isError ? "error" : "done";
      }
    }
    scheduleEmit();
  });
  async function run(prompt, before, priorMessages) {
    const timeout = setTimeout(() => {
      if (current) current.error = "本轮达到 5 分钟时间限制";
      stopping = true;
      agent.abort();
    }, 300000);
    try {
      if (!stopping) await agent.prompt(prompt);
      current.status = stopping ? "stopped" : current.error ? "error" : "done";
    } catch (e) {
      current.error = redact(e.message);
      current.status = stopping ? "stopped" : "error";
    } finally {
      clearTimeout(timeout);
      current.finishedAt = Date.now();
      for (const b of current.blocks)
        if (b.type === "tool" && b.status === "running") b.status = "stopped";
      try {
        const after = await snapshot(root);
        current.changes = changes(before, after);
        if (current.changes.length)
          undo = { before, after, priorMessages, turnId: current.id };
      } catch (e) {
        current.error = redact(e.message);
        current.status = "error";
      }
      const completed = current;
      // Keep the session locked until its final checkpoint is written.
      try {
        await persist();
      } catch (e) {
        completed.error = "保存会话失败：" + redact(e.message);
        completed.status = "error";
      }
      current = null;
      block = null;
      state.busy = false;
      emit();
    }
  }
  async function chat(prompt, model) {
    if (
      typeof prompt !== "string" ||
      !prompt.trim() ||
      prompt.trim().length > 20000
    )
      throw fail("请输入 1–20000 字的需求", 400);
    if (state.busy) throw fail("当前会话仍在执行");
    const nextModel = resolveModel(model);
    if (!nextModel.apiKey) throw fail("后端尚未配置此模型的 API Key", 503);
    state.busy = true;
    stopping = false;
    try {
      const before = await snapshot(root),
        priorMessages = structuredClone(agent.state.messages);
      modelConfig = nextModel;
      agent.state.model = nextModel.model;
      state.model = nextModel.model.id;
      state.modelId = nextModel.model.id;
      state.configured = true;
      current = {
        id: randomBytes(8).toString("hex"),
        model: state.model,
        prompt: prompt.trim(),
        blocks: [],
        status: "running",
        startedAt: Date.now(),
        changes: [],
      };
      state.turns.push(current);
      undo = null;
      await persist();
      emit();
      const turnId = current.id;
      task = run(prompt.trim(), before, priorMessages);
      return {
        ok: true,
        appID: state.appID,
        session: state.session,
        model: state.model,
        turnId,
      };
    } catch (e) {
      if (current) {
        current.status = "error";
        current.error = redact(e.message);
        current.finishedAt = Date.now();
      }
      current = null;
      state.busy = false;
      emit();
      throw e;
    }
  }
  async function undoLast() {
    if (state.busy || !undo) throw fail("当前没有可撤销的修改");
    state.busy = true;
    try {
      await restore(root, undo.before, undo.after);
      agent.state.messages = undo.priorMessages;
      const turn = state.turns.find((t) => t.id === undo.turnId);
      if (turn) turn.status = "undone";
      undo = null;
      await persist();
    } finally {
      state.busy = false;
      emit();
    }
  }
  async function reset() {
    if (state.busy) throw fail("请先停止当前任务");
    state.busy = true;
    try {
      agent.state.messages = agent.state.messages
        .filter((m) => m.role === "system")
        .slice(0, 1);
      state.turns = [];
      undo = null;
      await persist();
    } finally {
      state.busy = false;
      emit();
    }
  }
  function stop() {
    if (state.busy) {
      stopping = true;
      agent.abort();
    }
  }
  // Also records empty sessions, so scoped preview URLs survive a server restart.
  await persist();
  return {
    root,
    getState,
    chat,
    stop,
    reset,
    undo: undoLast,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async dispose() {
      stop();
      await task;
      clearTimeout(emitTimer);
      unsubscribe();
      listeners.clear();
    },
  };
}
