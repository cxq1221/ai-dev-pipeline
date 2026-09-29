import { test, expect } from "bun:test";
import { fixture, api, completeClarification } from "./helpers.mjs";
import { startLlmBackend } from "../backend/llm/http.mjs";
import { modelServer } from "./model-server.mjs";
import path from "node:path";

test("创建需求后可从接口检索，重启网关后仍可访问", async () => {
  const { startGateway } = await import("../backend/gateway/http.mjs");
  const f = await fixture(), model = modelServer();
  const ex = await startLlmBackend({ databaseUrl: process.env.TEST_DATABASE_URL,
    modelBaseUrl: model.url,
    dataRoot: path.join(f.root, "runtime"),
    port: 0,
  });
  const options = {
    previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"),    port: 0,
    executorUrl: ex.url,
    databaseUrl: process.env.TEST_DATABASE_URL,
  };
  let gw = await startGateway(options);
  try {
    const req = await api(gw.url, "/api/requirements", {
      title: "弱网提示",
      originalDescription: "延迟大于 80ms 时提示",
      repositoryPath: f.repo,
    });
    const fetched = await api(gw.url, `/api/requirements/${req.id}`);
    expect(fetched.title).toBe("弱网提示");
    expect(fetched.workspacePath).not.toBe(f.repo);
    expect(fetched.branchName).toContain(req.id);
    await gw.close();
    gw = await startGateway(options);
    expect(
      (await api(gw.url, `/api/requirements/${req.id}`)).originalDescription,
    ).toBe("延迟大于 80ms 时提示");
    expect(
      (await api(gw.url, "/api/requirements")).some((r) => r.id === req.id),
    ).toBe(true);
    await completeClarification(gw.url, req.id);
    const a = await api(gw.url, `/api/requirements/${req.id}/conversations`, {
      title: "实现提示",
    });
    const b = await api(gw.url, `/api/requirements/${req.id}/conversations`, {
      title: "检查边界",
    });
    expect(a.id).not.toBe(b.id);
    expect(
      (await api(gw.url, `/api/requirements/${req.id}/conversations`)).length,
    ).toBe(3);
    expect(
      (await api(gw.url, `/api/conversations/${a.id}/state`)).turns,
    ).toEqual([]);
  } finally {
    await gw.close();
    await ex.close();
    model.close();
  }
});
