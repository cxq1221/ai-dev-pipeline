import { test, expect } from "bun:test";
import path from "node:path";
import fs from "node:fs/promises";
import { fixture, api } from "./helpers.mjs";
import { startExecutor } from "../backend/executor/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";
test("需求文件、累计差异与预览对应真实工作区", async () => {
  const f = await fixture();
  await fs.writeFile(path.join(f.repo, "large.dat"), Buffer.alloc(2100000));
  f.git("add", ".");
  f.git("commit", "-m", "existing binary");
  const ex = await startExecutor({
    port: 0,
    previewPort: 0,
    workspaceRoot: path.join(f.root, "workspaces"),
  });
  const gw = await startGateway({
    port: 0,
    executorUrl: ex.url,
    databaseUrl: process.env.TEST_DATABASE_URL,
  });
  try {
    const r = await api(gw.url, "/api/requirements", {
      title: "文件预览",
      originalDescription: "预览",
      repositoryPath: f.repo,
    });
    await fs.writeFile(
      path.join(r.workspacePath, "index.html"),
      "<h1>Updated</h1>",
    );
    await fs.writeFile(path.join(r.workspacePath, "新文件.txt"), "新增内容");
    expect(await api(gw.url, `/api/requirements/${r.id}/files`)).toContain(
      "新文件.txt",
    );
    expect(
      (await api(gw.url, `/api/requirements/${r.id}/file?path=index.html`))
        .content,
    ).toBe("<h1>Updated</h1>");
    const diff = await api(gw.url, `/api/requirements/${r.id}/diff`);
    expect(diff.find((d) => d.path === "index.html").patch).toContain(
      "+<h1>Updated</h1>",
    );
    expect(diff.find((d) => d.path === "新文件.txt").kind).toBe("added");
    const preview = await api(gw.url, `/api/requirements/${r.id}/preview`);
    expect(await (await fetch(preview.url)).text()).toBe("<h1>Updated</h1>");
    await expect(
      api(gw.url, `/api/requirements/${r.id}/file?path=../../outside`),
    ).rejects.toThrow();
  } finally {
    await gw.close();
    await ex.close();
  }
});
