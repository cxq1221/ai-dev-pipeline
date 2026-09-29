import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { git } from "../shared/files.mjs";
const execute = promisify(execFile);
export async function prepareWorkspace(
  workspaceRoot,
  { requirementId, repositoryPath, initializeEmptyRepository = false },
) {
  if (
    !/^[a-zA-Z0-9-]+$/.test(requirementId) ||
    !path.isAbsolute(repositoryPath)
  )
    throw Object.assign(new Error("需求 ID 或仓库路径无效"), { status: 400 });
  try {
    if (await git(repositoryPath, "rev-parse", "--is-inside-work-tree") !== "true") throw new Error();
  } catch {
    throw Object.assign(new Error("该路径不是可用的本地 Git 工作仓库，请检查路径。"), { status: 400 });
  }
  let baseRef;
  try {
    baseRef = await git(repositoryPath, "rev-parse", "--verify", "HEAD^{commit}");
  } catch {
    const branch = await git(repositoryPath, "symbolic-ref", "-q", "HEAD").catch(() => "");
    const branchExists = branch && await execute("git", ["-C", repositoryPath, "show-ref", "--verify", "--quiet", branch]).then(() => true, e => e.code !== 1);
    if (!branch || branchExists)
      throw Object.assign(new Error("仓库 HEAD 无法读取，请检查仓库状态后重试。"), { status: 400 });
    if (initializeEmptyRepository !== true)
      throw Object.assign(new Error("仓库还没有初始提交。请确认创建空的初始提交后继续；现有文件不会提交或复制到需求工作区。"), { status: 409, code: "EMPTY_REPOSITORY" });
    // Write an empty tree directly: never consume or modify the user's index.
    const tree = await git(repositoryPath, "hash-object", "-t", "tree", "-w", "/dev/null");
    const commit = await git(repositoryPath, "-c", "user.name=Forge", "-c", "user.email=forge@localhost", "commit-tree", tree, "-m", "初始化空仓库以创建需求工作区");
    await git(repositoryPath, "update-ref", "HEAD", commit, "0".repeat(commit.length));
    baseRef = commit;
  }
  const branchName = `codex/req-${requirementId}`,
    workspacePath = path.join(workspaceRoot, requirementId);
  await fs.mkdir(workspaceRoot, { recursive: true });
  await git(
    repositoryPath,
    "worktree",
    "add",
    "-b",
    branchName,
    workspacePath,
    baseRef,
  );
  return { baseRef, branchName, workspacePath };
}
