import { test, expect } from "bun:test";
import path from "node:path";
import { fixture, api, completeClarification } from "./helpers.mjs";
import { startLlmBackend } from "../backend/llm/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";
test("真实模型经网关修改需求代码并可预览", async () => {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error("未配置真实模型");
  const f = await fixture();
  const ex = await startLlmBackend({ databaseUrl: process.env.TEST_DATABASE_URL,
    port: 0,
    dataRoot: path.join(f.root, "runtime"),
  });
  const gw = await startGateway({ previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"),
    port: 0,
    executorUrl: ex.url,
    databaseUrl: process.env.TEST_DATABASE_URL,
  });
  try {
    const r = await api(gw.url, "/api/requirements", {
      title: "真实闭环验证",
      originalDescription: "把首页标题改为 Forge works",
      repositoryPath: f.repo,
    });
    await completeClarification(gw.url, r.id);
    const c = await api(gw.url, `/api/requirements/${r.id}/conversations`, {
      title: "真实开发",
    });
    await api(gw.url, `/api/conversations/${c.id}/chat`, {
      message:
        "先读取 index.html，再把内容修改成 <h1>Forge works</h1>。执行 pwd 验证目录；使用 update_requirement 工具保存需求说明“首页展示 Forge works”。不要提交。",
    });
    let state;
    for (let i = 0; i < 240; i++) {
      state = await api(gw.url, `/api/conversations/${c.id}/state`);
      if (!state.busy) break;
      await Bun.sleep(500);
    }
    expect(state.turns[0].status).toBe("done");
    expect(
      (await api(gw.url, `/api/requirements/${r.id}/file?path=index.html`))
        .content,
    ).toContain("<h1>Forge works</h1>");
    expect(
      (await api(gw.url, `/api/requirements/${r.id}`)).clarifiedDescription,
    ).toContain("Forge works");
    const preview = await api(gw.url, `/api/requirements/${r.id}/preview`);
    expect(await (await fetch(preview.url)).text()).toContain("Forge works");
  } finally {
    await gw.close();
    await ex.close();
  }
}, 150000);
