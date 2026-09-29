import { test, expect } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startExecutor } from "../backend/executor/http.mjs";

test("空仓库需明确确认，初始化不提交暂存或未跟踪文件", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "forge-empty-"));
  const repo = path.join(root, "repo");
  await fs.mkdir(repo);
  const git = (...args) => Bun.spawnSync(["git", "-C", repo, ...args]);
  git("init");
  await fs.writeFile(path.join(repo, "private.txt"), "private");
  await fs.writeFile(path.join(repo, "staged.txt"), "staged");
  git("add", "staged.txt");
  const before = git("status", "--porcelain").stdout.toString();
  const ex = await startExecutor({ port: 0, previewPort: 0, workspaceRoot: path.join(root, "workspaces") });
  const post = (body) => fetch(ex.url + "/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requirementId: "empty-test", repositoryPath: repo, ...body }) });
  try {
    const denied = await post({});
    expect(denied.status).toBe(409);
    expect((await denied.json()).code).toBe("EMPTY_REPOSITORY");
    expect(git("rev-parse", "--verify", "HEAD").exitCode).not.toBe(0);
    const accepted = await post({ initializeEmptyRepository: true });
    expect(accepted.status).toBe(200);
    const workspace = await accepted.json();
    expect(git("ls-tree", "-r", "HEAD").stdout.toString()).toBe("");
    expect(git("status", "--porcelain").stdout.toString()).toBe(before);
    expect(await fs.readFile(path.join(repo, "private.txt"), "utf8")).toBe("private");
    expect((await fs.readdir(workspace.workspacePath)).filter(x => x !== ".git")).toEqual([]);
  } finally { await ex.close(); }
});
