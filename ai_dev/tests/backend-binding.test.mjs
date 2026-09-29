import { test, expect } from "bun:test";
import path from "node:path";
import { fixture, api, completeClarification } from "./helpers.mjs";
import { modelServer } from "./model-server.mjs";
import { startLlmBackend } from "../backend/llm/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";

test("更换默认后端只影响新会话，旧会话保持原绑定", async () => {
  const f = await fixture(), firstModel = modelServer(), secondModel = modelServer(body => body.messages.at(-1).role === "user" ? { name: "write", arguments: JSON.stringify({ path: "second.txt", content: "第二后端" }) } : null);
  const first = await startLlmBackend({ port: 0, databaseUrl: process.env.TEST_DATABASE_URL, modelBaseUrl: firstModel.url });
  const second = await startLlmBackend({ port: 0, databaseUrl: process.env.TEST_DATABASE_URL, modelBaseUrl: secondModel.url });
  const a = crypto.randomUUID(), b = crypto.randomUUID();
  const options = { executorUrl: first.url, port: 0, previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"), databaseUrl: process.env.TEST_DATABASE_URL, backends: [{ id: a, name: "原后端", url: first.url }, { id: b, name: "新后端", url: second.url }], defaultBackendId: a };
  let gw = await startGateway(options);
  const wait = async id => { for (let i = 0; i < 200; i++) { const s = await api(gw.url, `/api/conversations/${id}/state`); if (!s.busy) return s; await Bun.sleep(30); } throw new Error("执行超时"); };
  try {
    const r = await api(gw.url, "/api/requirements", { title: "绑定测试", originalDescription: "页面", repositoryPath: f.repo });
    await completeClarification(gw.url, r.id);
    const old = await api(gw.url, `/api/requirements/${r.id}/conversations`, { title: "旧会话" });
    await gw.close(); gw = await startGateway({ ...options, defaultBackendId: b });
    const fresh = await api(gw.url, `/api/requirements/${r.id}/conversations`, { title: "新会话" });
    expect((await api(gw.url, `/api/conversations/${old.id}/state`)).backendId).toBe(a);
    expect((await api(gw.url, `/api/conversations/${fresh.id}/state`)).backendId).toBe(b);
    await api(gw.url, `/api/conversations/${old.id}/chat`, { message: "写入 first.txt" }); await wait(old.id);
    await api(gw.url, `/api/conversations/${fresh.id}/chat`, { message: "执行" }); await wait(fresh.id);
    expect((await api(gw.url, `/api/requirements/${r.id}/file?path=first.txt`)).content).toBe("并发成果");
    expect((await api(gw.url, `/api/requirements/${r.id}/file?path=second.txt`)).content).toBe("第二后端");
  } finally { await gw.close(); await first.close(); await second.close(); firstModel.close(); secondModel.close(); }
}, 30000);
