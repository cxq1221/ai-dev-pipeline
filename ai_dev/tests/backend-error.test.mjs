import { test, expect } from "bun:test";
import path from "node:path";
import { fixture, api } from "./helpers.mjs";
import { startLlmBackend } from "../backend/llm/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";

test("后端明确拒绝请求时显示错误，不永久显示执行中", async () => {
  const f = await fixture();
  const backend = await startLlmBackend({ port: 0, databaseUrl: process.env.TEST_DATABASE_URL });
  const gw = await startGateway({ port: 0, previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"), databaseUrl: process.env.TEST_DATABASE_URL, executorUrl: backend.url + "/missing" });
  try {
    const r = await api(gw.url, "/api/requirements", { title: "后端地址错误", originalDescription: "讨论", repositoryPath: f.repo });
    const { conversationId: id } = await api(gw.url, `/api/requirements/${r.id}/clarification`, { message: "讨论需求" });
    let state;
    for (let i = 0; i < 100; i++) { state = await api(gw.url, `/api/conversations/${id}/state`); if (!state.busy) break; await Bun.sleep(30); }
    expect(state.turns.at(-1).status).toBe("error");
    expect(state.turns.at(-1).error).toContain("404");
  } finally { await gw.close(); await backend.close(); }
}, 15000);
