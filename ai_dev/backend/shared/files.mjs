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
