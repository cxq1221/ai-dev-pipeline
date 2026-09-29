import { test, expect } from "bun:test";
import { SQL } from "bun";
import path from "node:path";
import { fixture, api, completeClarification } from "./helpers.mjs";
import { modelServer } from "./model-server.mjs";
import { startExecutor } from "../backend/executor/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";
test("网关重启不取消开发机上的执行，并能恢复已完成结果", async () => {
  const f = await fixture(),
    model = modelServer();
  const ex = await startExecutor({
    port: 0,
    previewPort: 0,
    workspaceRoot: path.join(f.root, "workspaces"),
    dataRoot: path.join(f.root, "runtime"),
    modelBaseUrl: model.url,
  });
  const config = {
    port: 0,
    databaseUrl: process.env.TEST_DATABASE_URL,
    executorUrl: ex.url,
  };
  let gw = await startGateway(config);
  try {
    const r = await api(gw.url, "/api/requirements", {
      title: "恢复",
      originalDescription: "开发",
      repositoryPath: f.repo,
    });
    await completeClarification(gw.url, r.id);
    const initialRequests = model.requests.length;
    const c = await api(gw.url, `/api/requirements/${r.id}/conversations`, {
      title: "A",
    });
    await api(gw.url, `/api/conversations/${c.id}/chat`, { message: "慢任务" });
    await gw.close();
    gw = await startGateway(config);
    await Bun.sleep(1200);
    const state = await api(gw.url, `/api/conversations/${c.id}/state`);
    expect(state.busy).toBe(false);
    expect(state.turns[0].status).toBe("done");
    expect(model.requests.length).toBe(initialRequests + 1);
    await gw.close();
    await ex.close();
    const restarted = await startExecutor({
      port: Number(new URL(ex.url).port),
      previewPort: 0,
      workspaceRoot: path.join(f.root, "workspaces"),
      dataRoot: path.join(f.root, "runtime"),
      modelBaseUrl: model.url,
    });
    ex.close = restarted.close;
    gw = await startGateway(config);
    await api(gw.url, `/api/conversations/${c.id}/chat`, {
      message: "恢复后继续",
    });
    await Bun.sleep(300);
    expect(
      (await api(gw.url, `/api/conversations/${c.id}/state`)).turns.length,
    ).toBe(2);
    expect(JSON.stringify(model.requests.at(-1).messages)).toContain("慢任务");
    await gw.close();
    // Persisted automatic work must be dispatched after a gateway restart.
    const sql = new SQL(process.env.TEST_DATABASE_URL);
    const queuedId = `auto-${crypto.randomUUID()}`, now = Date.now();
    try {
      await sql`INSERT INTO turns (id,conversation_id,prompt,blocks,status,started_at) VALUES (${queuedId},${c.id},${"自动恢复开发"},${"[]"},${"queued"},${now})`;
    } finally { await sql.close(); }
    const beforeAutomatic = model.requests.length;
    gw = await startGateway(config);
    let resumed;
    for (let i = 0; i < 100; i++) {
      resumed = await api(gw.url, `/api/conversations/${c.id}/state`);
      if (!resumed.busy) break;
      await Bun.sleep(30);
    }
    expect(resumed.turns.find(t => t.id === queuedId).status).toBe("done");
    expect(model.requests.length).toBe(beforeAutomatic + 1);
    await gw.close();
    gw = await startGateway(config);
    await api(gw.url, `/api/conversations/${c.id}/state`);
    await Bun.sleep(300);
    expect(model.requests.length).toBe(beforeAutomatic + 1);
  } finally {
    await gw.close();
    await ex.close();
    model.close();
  }
}, 15000);
