import { test, expect } from "bun:test";
import path from "node:path";
import { fixture, api } from "./helpers.mjs";
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
    expect(model.requests.length).toBe(1);
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
  } finally {
    await gw.close();
    await ex.close();
    model.close();
  }
}, 15000);
