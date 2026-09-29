import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createTwoFilesPatch, diffLines } from "diff";
const execute = promisify(execFile);
export async function git(root, ...args) {
  return (
    await execute("git", ["-C", root, ...args], { maxBuffer: 5e6 })
  ).stdout.trim();
}
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

export async function safePath(root, name) {
  const base = path.resolve(root),
    target = path.resolve(base, name);
  if (target !== base && !target.startsWith(base + path.sep))
    throw new Error("文件必须位于需求工作区内");
  for (let p = target; p !== base; p = path.dirname(p)) {
    try {
      if ((await fs.lstat(p)).isSymbolicLink())
        throw new Error("不支持符号链接");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return target;
}
export function visible(name) {
  return !name
    .split("/")
    .some(
      (p) =>
        [".git", "node_modules", ".DS_Store"].includes(p) ||
        p.startsWith(".env"),
    );
}
export async function readFile(root, name) {
  if (!visible(name))
    throw Object.assign(new Error("该文件不对外展示"), { status: 403 });
  const target = await safePath(root, name);
  if ((await fs.stat(target)).size > 2e6)
    throw Object.assign(new Error("文件超过 2MB 展示限制"), { status: 413 });
  return fs.readFile(target, "utf8");
}
export async function listFiles(root) {
  const result = await git(root, "ls-files", "-co", "--exclude-standard", "-z");
  const names = [...new Set(result.split("\0").filter((x) => x && visible(x)))];
  const existing = [];
  for (const name of names) {
    try {
      await safePath(root, name);
      if ((await fs.lstat(path.join(root, name))).isFile()) existing.push(name);
    } catch {}
  }
  return existing.sort();
}
export async function diffFiles(root, baseRef) {
  const baseline = (
    await git(root, "ls-tree", "-r", "--name-only", "-z", baseRef)
  )
    .split("\0")
    .filter((x) => x && visible(x));
  const current = await listFiles(root),
    changes = [];
  const candidates = [
    ...(await git(root, "diff", "--name-only", "-z", baseRef, "--")).split(
      "\0",
    ),
    ...(
      await git(root, "ls-files", "--others", "--exclude-standard", "-z")
    ).split("\0"),
  ].filter((name) => name && visible(name));
  for (const name of new Set(candidates)) {
    let before = "",
      after = "";
    let limited = false;
    if (
      baseline.includes(name) &&
      Number(await git(root, "cat-file", "-s", `${baseRef}:${name}`)) > 2e6
    )
      limited = true;
    if (
      current.includes(name) &&
      (await fs.stat(await safePath(root, name))).size > 2e6
    )
      limited = true;
    if (!limited && baseline.includes(name))
      before = (
        await execute("git", ["-C", root, "show", `${baseRef}:${name}`], {
          maxBuffer: 2e6,
        })
      ).stdout;
    if (!limited && current.includes(name)) after = await readFile(root, name);
    if (
      !limited &&
      before === after &&
      baseline.includes(name) &&
      current.includes(name)
    )
      continue;
    const binary = before.includes("\0") || after.includes("\0"),
      parts = binary ? [] : diffLines(before, after);
    changes.push({
      path: name,
      kind: !baseline.includes(name)
        ? "added"
        : !current.includes(name)
          ? "deleted"
          : "modified",
      added: parts.filter((p) => p.added).reduce((n, p) => n + p.count, 0),
      removed: parts.filter((p) => p.removed).reduce((n, p) => n + p.count, 0),
      patch: limited
        ? "文件发生变化，超过 2MB 展示限制"
        : binary
          ? "二进制文件发生变化"
          : createTwoFilesPatch(name, name, before, after).slice(0, 100000),
    });
  }
  return changes;
}
