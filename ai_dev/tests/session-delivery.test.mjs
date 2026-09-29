import { test, expect } from "bun:test";
import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { fixture, api } from "./helpers.mjs";
import { modelServer } from "./model-server.mjs";
import { startLlmBackend } from "../backend/llm/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";

// Real transport fault: forwards every request to the real backend, drops only
// the reply after that backend has accepted a message or tool result.
test("聊天和工具结果响应丢失后查询 session 恢复，不重发消息或重复业务工具", async () => {
  const f = await fixture(), model = modelServer();
  const backend = await startLlmBackend({ port: 0, databaseUrl: process.env.TEST_DATABASE_URL, modelBaseUrl: model.url, dataRoot: path.join(f.root, "data") });
  let droppedSend = false, droppedResult = false;
  const proxy = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      const payload = body ? JSON.parse(body) : null;
      const upstream = await fetch(backend.url + req.url, { method: req.method, headers: { "Content-Type": "application/json" }, body: body || undefined });
      if (req.url === "/chat" && !payload.action && !droppedSend) {
        droppedSend = true; await upstream.body.cancel(); res.destroy(); return;
      }
      const text = await upstream.text();
      if (payload?.action === "tool_result" && !droppedResult) {
        droppedResult = true; res.destroy(); return;
      }
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("Content-Type") }); res.end(text);
    } catch { res.destroy(); }
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${proxy.address().port}`;
  const gw = await startGateway({ port: 0, previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"), databaseUrl: process.env.TEST_DATABASE_URL, executorUrl: url });
  try {
    const r = await api(gw.url, "/api/requirements", { title: "断线", originalDescription: "讨论需求", repositoryPath: f.repo });
    const { conversationId } = await api(gw.url, `/api/requirements/${r.id}/clarification`, { message: "更新说明" });
    let state;
    for (let i = 0; i < 200; i++) { state = await api(gw.url, `/api/conversations/${conversationId}/state`); if (!state.busy) break; await Bun.sleep(30); }
    expect(droppedSend).toBe(true);
    expect(droppedResult).toBe(true);
    expect(state.turns.at(-1).status).toBe("done");
    expect((await api(gw.url, `/api/requirements/${r.id}`)).clarifiedDescription).toContain("80ms");
    expect(model.requests.filter(r => r.messages.at(-1).role === "user")).toHaveLength(1);
  } finally { await gw.close(); proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); await backend.close(); model.close(); await fs.rm(f.root, { recursive: true, force: true }); }
}, 15000);

test("聊天响应挂起但连接未断时仍可核实并停止，不永久占用会话", async () => {
  const f = await fixture(), model = modelServer();
  const backend = await startLlmBackend({ port: 0, databaseUrl: process.env.TEST_DATABASE_URL, modelBaseUrl: model.url, dataRoot: path.join(f.root, "data") });
  let held = false;
  const proxy = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      const upstream = await fetch(backend.url + req.url, { method: req.method, headers: { "Content-Type": "application/json" }, body: body || undefined });
      if (req.url === "/chat" && !JSON.parse(body).action) {
        await upstream.body.cancel(); held = true; return; // keep the downstream connection open
      }
      res.writeHead(upstream.status, { "Content-Type": upstream.headers.get("Content-Type") }); res.end(await upstream.text());
    } catch { res.destroy(); }
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const gw = await startGateway({ port: 0, previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"), databaseUrl: process.env.TEST_DATABASE_URL, executorUrl: `http://127.0.0.1:${proxy.address().port}` });
  try {
    const r = await api(gw.url, "/api/requirements", { title: "挂起停止", originalDescription: "讨论需求", repositoryPath: f.repo });
    const { conversationId } = await api(gw.url, `/api/requirements/${r.id}/clarification`, { message: "更新说明" });
    for (let i = 0; i < 100 && !held; i++) await Bun.sleep(20);
    expect(held).toBe(true);
    await api(gw.url, `/api/conversations/${conversationId}/stop`, {});
    let state;
    for (let i = 0; i < 240; i++) { state = await api(gw.url, `/api/conversations/${conversationId}/state`); if (!state.busy) break; await Bun.sleep(30); }
    expect(state.busy).toBe(false);
    expect(state.turns.at(-1).status).toBe("stopped");
    expect((await api(gw.url, `/api/requirements/${r.id}`)).clarifiedDescription).toBe("");
  } finally { await gw.close(); proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); await backend.close(); model.close(); await fs.rm(f.root, { recursive: true, force: true }); }
}, 15000);
