import { test, expect } from "bun:test";
import path from "node:path";
import { fixture, api } from "./helpers.mjs";
import { modelServer } from "./model-server.mjs";
import { startExecutor } from "../backend/executor/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";

export async function waitTurn(url, id) {
  for (let i = 0; i < 100; i++) {
    const state = await api(url, `/api/conversations/${id}/state`);
    if (state.turns.length && !state.busy) return state;
    await Bun.sleep(50);
  }
  throw new Error("执行未结束");
}
test("网关下发新消息，执行结果和独立会话历史可查询", async () => {
  const f = await fixture(),
    model = modelServer();
  const ex = await startExecutor({
    port: 0,
    previewPort: 0,
    workspaceRoot: path.join(f.root, "workspaces"),
    dataRoot: path.join(f.root, "runtime"),
    modelBaseUrl: model.url,
  });
  const gw = await startGateway({
    port: 0,
    databaseUrl: process.env.TEST_DATABASE_URL,
    executorUrl: ex.url,
  });
  try {
    const req = await api(gw.url, "/api/requirements", {
      title: "执行测试",
      originalDescription: "实现页面",
      repositoryPath: f.repo,
    });
    const a = await api(gw.url, `/api/requirements/${req.id}/conversations`, {
      title: "A",
    });
    const b = await api(gw.url, `/api/requirements/${req.id}/conversations`, {
      title: "B",
    });
    await api(gw.url, `/api/conversations/${a.id}/chat`, {
      message: "第一条消息",
    });
    const result = await waitTurn(gw.url, a.id);
    expect(result.turns[0].status).toBe("done");
    expect(result.turns[0].sourceRef.commit).toBe(req.baseRef);
    expect(result.turns[0].blocks[0].text).toContain("第一条消息");
    expect(
      (await api(gw.url, `/api/conversations/${b.id}/state`)).turns,
    ).toEqual([]);
    await api(gw.url, `/api/conversations/${a.id}/chat`, {
      message: "第二条消息",
    });
    expect((await waitTurn(gw.url, a.id)).turns.length).toBe(2);
    await api(gw.url, `/api/conversations/${a.id}/chat`, {
      message: "更新说明",
    });
    await waitTurn(gw.url, a.id);
    expect(
      (await api(gw.url, `/api/requirements/${req.id}`)).clarifiedDescription,
    ).toBe("延迟超过 80ms 显示弱网提示，允许继续进入。");
    await Promise.all([
      api(gw.url, `/api/conversations/${a.id}/chat`, { message: "写入 a.txt" }),
      api(gw.url, `/api/conversations/${b.id}/chat`, { message: "写入 b.txt" }),
    ]);
    await Promise.all([waitTurn(gw.url, a.id), waitTurn(gw.url, b.id)]);
    expect(await api(gw.url, `/api/requirements/${req.id}/files`)).toEqual([
      "a.txt",
      "b.txt",
      "index.html",
    ]);
    expect(
      (await api(gw.url, `/api/conversations/${b.id}/state`)).turns.length,
    ).toBe(1);
    await api(gw.url, `/api/conversations/${b.id}/chat`, {
      message: "直接覆盖首页",
    });
    const blocked = await waitTurn(gw.url, b.id);
    expect(
      blocked.turns
        .at(-1)
        .blocks.some((t) => t.name === "write" && t.status === "error"),
    ).toBe(true);
    expect(
      (await api(gw.url, `/api/requirements/${req.id}/file?path=index.html`))
        .content,
    ).toBe("<h1>Original</h1>\n");
    const before = model.requests.length;
    await api(ex.url, `/sessions/${a.id}/chat`, {
      turnId: result.turns[0].id,
      message: "不应再次执行的旧轮次",
    });
    await Bun.sleep(100);
    expect(model.requests.length).toBe(before);
  } finally {
    await gw.close();
    await ex.close();
    model.close();
  }
}, 20000);
