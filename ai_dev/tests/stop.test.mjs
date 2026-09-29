import { test, expect } from "bun:test";
import path from "node:path";
import { fixture, api } from "./helpers.mjs";
import { modelServer } from "./model-server.mjs";
import { startLlmBackend } from "../backend/llm/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";

test("用户发送后立即停止，不会在延迟派发时重新启动", async () => {
  const f = await fixture(), model = modelServer();
  const backend = await startLlmBackend({ port: 0, databaseUrl: process.env.TEST_DATABASE_URL, modelBaseUrl: model.url });
  const gw = await startGateway({ port: 0, previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"), databaseUrl: process.env.TEST_DATABASE_URL, executorUrl: backend.url });
  try {
    const r = await api(gw.url, "/api/requirements", { title: "停止", originalDescription: "讨论需求", repositoryPath: f.repo });
    const { conversationId: id } = await api(gw.url, `/api/requirements/${r.id}/clarification`, { message: "慢任务" });
    await api(gw.url, `/api/conversations/${id}/stop`, {});
    await Bun.sleep(1000);
    const state = await api(gw.url, `/api/conversations/${id}/state`);
    expect(state.busy).toBe(false);
    expect(state.turns.at(-1).status).toBe("stopped");
    expect(state.mode).toBe("clarification");
  } finally { await gw.close(); await backend.close(); model.close(); }
}, 15000);

test("网关断线期间已停止的业务工具不会在重连时执行", async () => {
  const f = await fixture(), model = modelServer();
  const backend = await startLlmBackend({ port: 0, databaseUrl: process.env.TEST_DATABASE_URL, modelBaseUrl: model.url });
  const options = { port: 0, previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"), databaseUrl: process.env.TEST_DATABASE_URL, executorUrl: backend.url };
  let gw = await startGateway(options);
  try {
    const r = await api(gw.url, "/api/requirements", { title: "断线停止", originalDescription: "讨论需求", repositoryPath: f.repo });
    const { conversationId: id, turnId } = await api(gw.url, `/api/requirements/${r.id}/clarification`, { message: "慢任务更新说明" });
    for (let i = 0; i < 100 && model.requests.length === 0; i++) await Bun.sleep(20);
    await gw.close();
    let waiting = false;
    for (let i = 0; i < 100 && !waiting; i++) {
      const state = await api(backend.url, `/sessions/${id}`);
      waiting = state.state === "waiting_tool";
      if (!waiting) await Bun.sleep(30);
    }
    expect(waiting).toBe(true);
    await api(backend.url, "/stop", { sessionId: id });
    gw = await startGateway(options);
    let state;
    for (let i = 0; i < 100; i++) { state = await api(gw.url, `/api/conversations/${id}/state`); if (!state.busy) break; await Bun.sleep(30); }
    expect(state.turns.at(-1).status).toBe("stopped");
    expect((await api(gw.url, `/api/requirements/${r.id}`)).clarifiedDescription).toBe("");
  } finally { await gw.close(); await backend.close(); model.close(); }
}, 15000);
