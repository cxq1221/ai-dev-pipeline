import { test, expect } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fixture, api } from "./helpers.mjs";
import { modelServer } from "./model-server.mjs";
import { startLlmBackend } from "../backend/llm/http.mjs";

const post = (url, route, body) => fetch(url + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const events = async response => (await response.text()).split("\n\n").filter(s => s.includes("data: ")).map(s => JSON.parse(s.split("data: ")[1]));

test("会话无需 runId 即可串行执行，忙时拒绝新消息，结束后可查询结果并继续", async () => {
  const f = await fixture(), model = modelServer();
  const backend = await startLlmBackend({ port: 0, dataRoot: path.join(f.root, "data"), modelBaseUrl: model.url, databaseUrl: process.env.TEST_DATABASE_URL });
  const sessionId = crypto.randomUUID();
  try {
    const first = await post(backend.url, "/chat", { sessionId, workspacePath: f.repo, message: "慢任务 写入 result.txt", allowedTools: ["write"] });
    expect(first.status).toBe(200);
    const duplicate = await post(backend.url, "/chat", { sessionId, message: "另一条消息" });
    expect(duplicate.status).toBe(409);
    expect((await events(first)).at(-1).turn.status).toBe("done");
    const state = await api(backend.url, `/sessions/${sessionId}`);
    expect(state.state).toBe("idle");
    expect(state.current.status).toBe("done");
    expect(await fs.readFile(path.join(f.repo, "result.txt"), "utf8")).toBe("并发成果");
    const second = await post(backend.url, "/chat", { sessionId, message: "谢谢", allowedTools: [] });
    expect(second.status).toBe(200);
    expect((await events(second)).at(-1).turn.status).toBe("done");
    expect((await api(backend.url, `/sessions/${sessionId}`)).current.prompt).toBe("谢谢");
  } finally { await backend.close(); model.close(); await fs.rm(f.root, { recursive: true, force: true }); }
}, 30000);

async function waitState(url, id, predicate) {
  for (let i = 0; i < 150; i++) {
    const state = await api(url, `/sessions/${id}`);
    if (predicate(state)) return state;
    await Bun.sleep(20);
  }
  throw new Error("等待会话状态超时");
}

test("Skill 驱动外部工具往返，查询可补收调用，跨轮调用 ID 唯一且结果幂等", async () => {
  const f = await fixture(), model = modelServer(body => {
    if (body.messages.at(-1).role === "user" && JSON.stringify(body.messages.at(-1)).includes("查询工单")) return { name: "ticket", arguments: "{}" };
    return null;
  });
  const backend = await startLlmBackend({ port: 0, dataRoot: path.join(f.root, "data"), modelBaseUrl: model.url, databaseUrl: process.env.TEST_DATABASE_URL });
  const sessionId = crypto.randomUUID(), input = { sessionId, workspacePath: f.repo, message: "处理", allowedTools: ["ticket"], tools: [{ name: "ticket", description: "查询工单", parameters: { type: "object" } }], skills: [{ name: "ticket", content: "查询工单" }] };
  try {
    const first = await post(backend.url, "/chat", input);
    const firstEvents = events(first);
    const waiting = await waitState(backend.url, sessionId, s => s.state === "waiting_tool");
    const call = waiting.requiredActions[0];
    expect(call.name).toBe("ticket");
    const result = { action: "tool_result", sessionId, toolCallId: call.toolCallId, result: { content: [{ type: "text", text: "工单已批准" }] } };
    expect((await post(backend.url, "/chat", result)).status).toBe(200);
    expect((await firstEvents).at(-1).turn.status).toBe("done");
    expect((await post(backend.url, "/chat", result)).status).toBe(200);
    expect((await post(backend.url, "/chat", { ...result, result: { content: [] } })).status).toBe(409);
    const second = await post(backend.url, "/chat", input), secondEvents = events(second);
    const next = await waitState(backend.url, sessionId, s => s.state === "waiting_tool");
    expect(next.requiredActions[0].toolCallId).not.toBe(call.toolCallId);
    expect((await post(backend.url, "/chat", result)).status).toBe(409);
    expect((await post(backend.url, "/chat", { ...result, toolCallId: next.requiredActions[0].toolCallId })).status).toBe(200);
    expect((await secondEvents).at(-1).turn.status).toBe("done");
  } finally { await backend.close(); model.close(); await fs.rm(f.root, { recursive: true, force: true }); }
}, 15000);

test("按 session 停止等待工具，迟到结果不能继续执行，下一轮仍能使用已有上下文", async () => {
  const f = await fixture(), model = modelServer(body => body.messages.at(-1).role === "user" && JSON.stringify(body.messages.at(-1)).includes("等待") ? { name: "external", arguments: "{}" } : null);
  const options = { port: 0, dataRoot: path.join(f.root, "data"), modelBaseUrl: model.url, databaseUrl: process.env.TEST_DATABASE_URL };
  let backend = await startLlmBackend(options);
  const sessionId = crypto.randomUUID();
  try {
    const stream = events(await post(backend.url, "/chat", { sessionId, workspacePath: f.repo, message: "记住蓝色风车，等待", allowedTools: ["external"], tools: [{ name: "external", description: "外部动作", parameters: { type: "object" } }] }));
    const waiting = await waitState(backend.url, sessionId, s => s.state === "waiting_tool");
    expect((await post(backend.url, "/stop", { sessionId })).status).toBe(200);
    expect((await stream).at(-1).turn.status).toBe("stopped");
    expect((await post(backend.url, "/chat", { action: "tool_result", sessionId, toolCallId: waiting.requiredActions[0].toolCallId, result: { content: [] } })).status).toBe(409);
    await backend.close(); backend = await startLlmBackend(options);
    expect((await api(backend.url, `/sessions/${sessionId}`)).current.status).toBe("stopped");
    const next = await events(await post(backend.url, "/chat", { sessionId, message: "继续", allowedTools: [] }));
    expect(next.at(-1).turn.status).toBe("done");
    // Model HTTP is the approved external seam: native history reaches the provider.
    expect(JSON.stringify(model.requests.at(-1).messages)).toContain("蓝色风车");
  } finally { await backend.close(); model.close(); await fs.rm(f.root, { recursive: true, force: true }); }
}, 15000);

test("后端进程崩溃后当前轮标记中断，不重跑工具，下一轮可以继续", async () => {
  const f = await fixture(), model = modelServer(body => body.messages.at(-1).role === "user" && JSON.stringify(body.messages.at(-1)).includes("等待") ? { name: "external", arguments: "{}" } : null);
  let proc, url;
  const launch = async () => {
    proc = Bun.spawn([process.execPath, "tests/llm-host.mjs"], { env: { ...process.env, TEST_DATA_ROOT: path.join(f.root, "data"), TEST_MODEL_URL: model.url }, stdout: "pipe", stderr: "inherit" });
    const reader = proc.stdout.getReader(); url = new TextDecoder().decode((await reader.read()).value).trim(); reader.releaseLock();
  };
  const sessionId = crypto.randomUUID();
  try {
    await launch();
    const response = await post(url, "/chat", { sessionId, workspacePath: f.repo, message: "等待", allowedTools: ["external"], tools: [{ name: "external", description: "外部动作", parameters: { type: "object" } }] });
    await response.body.cancel();
    await waitState(url, sessionId, s => s.state === "waiting_tool");
    proc.kill("SIGKILL"); await proc.exited; await launch();
    const recovered = await api(url, `/sessions/${sessionId}`);
    expect(recovered.state).toBe("idle");
    expect(recovered.current.status).toBe("interrupted");
    expect(recovered.requiredActions).toEqual([]);
    expect((await events(await post(url, "/chat", { sessionId, message: "继续", allowedTools: [] }))).at(-1).turn.status).toBe("done");
  } finally { proc?.kill("SIGKILL"); if (proc) await proc.exited; model.close(); await fs.rm(f.root, { recursive: true, force: true }); }
}, 15000);

test("旧版执行记录升级后仍可查询最近结果，原生上下文保留", async () => {
  const { SQL } = await import("bun");
  const f = await fixture(), model = modelServer();
  const sessionId = crypto.randomUUID(), oldId = crypto.randomUUID();
  // Historical fixture setup only; all assertions use HTTP and model/file seams.
  const sql = new SQL(process.env.TEST_DATABASE_URL);
  await sql`INSERT INTO llm_sessions VALUES (${sessionId},${f.repo},${JSON.stringify([{ role: "user", content: "旧版约定蓝色风车", timestamp: Date.now() }])})`;
  const turn = { id: oldId, prompt: "旧版约定蓝色风车", blocks: [{ type: "text", text: "已经记住" }], status: "done", startedAt: Date.now(), finishedAt: Date.now() };
  await sql`INSERT INTO llm_runs VALUES (${oldId},${sessionId},${JSON.stringify({ sessionId, runId: oldId, workspacePath: f.repo, message: turn.prompt })},'done',${JSON.stringify([{ eventId: 1, type: "done", turn }])})`;
  await sql.close();
  const backend = await startLlmBackend({ port: 0, databaseUrl: process.env.TEST_DATABASE_URL, modelBaseUrl: model.url, dataRoot: path.join(f.root, "data") });
  try {
    const restored = await api(backend.url, `/sessions/${sessionId}`);
    expect(restored.current.blocks[0].text).toBe("已经记住");
    expect(restored.state).toBe("idle");
    expect((await events(await post(backend.url, "/chat", { sessionId, message: "继续", allowedTools: [] }))).at(-1).turn.status).toBe("done");
    expect(JSON.stringify(model.requests.at(-1).messages)).toContain("旧版约定蓝色风车");
  } finally { await backend.close(); model.close(); await fs.rm(f.root, { recursive: true, force: true }); }
}, 15000);
