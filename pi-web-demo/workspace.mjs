import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { diffLines, createTwoFilesPatch } from "diff";
const skipped = new Set(["node_modules", ".git", ".DS_Store", ".gitkeep"]);
export async function safePath(root, name) {
  const target = path.resolve(root, name);
  if (target !== root && !target.startsWith(root + path.sep))
    throw new Error("文件必须位于工作目录内");
  for (let p = target; p !== root; p = path.dirname(p)) {
    try {
      if ((await fs.lstat(p)).isSymbolicLink())
        throw new Error("不支持符号链接");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return target;
}
export async function snapshot(root) {
  const files = {};
  let total = 0;
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (skipped.has(entry.name)) continue;
      const p = path.join(dir, entry.name);
      if (entry.isSymbolicLink())
        throw new Error("工作目录含符号链接，无法可靠创建快照");
      if (entry.isDirectory()) await walk(p);
      else if (entry.isFile()) {
        const size = (await fs.stat(p)).size;
        total += size;
        if (size > 10e6 || total > 50e6)
          throw new Error("快照限制：单文件 10 MB，总计 50 MB");
        files[path.relative(root, p)] = (await fs.readFile(p)).toString(
          "base64",
        );
      }
    }
  }
  await walk(root);
  return files;
}
export function changes(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .filter((p) => before[p] !== after[p])
    .map((p) => {
      const oldText = Buffer.from(before[p] || "", "base64").toString();
      const newText = Buffer.from(after[p] || "", "base64").toString();
      const binary = oldText.includes("\0") || newText.includes("\0");
      const parts = binary ? [] : diffLines(oldText, newText);
      return {
        path: p,
        kind: !(p in before) ? "added" : !(p in after) ? "deleted" : "modified",
        added: parts.filter((x) => x.added).reduce((n, x) => n + x.count, 0),
        removed: parts
          .filter((x) => x.removed)
          .reduce((n, x) => n + x.count, 0),
        patch: binary
          ? "二进制文件发生变化"
          : createTwoFilesPatch(p, p, oldText, newText).slice(0, 100000),
      };
    });
}
export async function restore(root, before, expected) {
  const current = await snapshot(root);
  if (changes(expected, current).length)
    throw new Error("文件在本轮结束后被修改，已阻止撤销以免覆盖手工修改");
  for (const p of Object.keys(current))
    if (!(p in before)) await fs.unlink(await safePath(root, p));
  for (const [p, data] of Object.entries(before)) {
    const target = await safePath(root, p);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, Buffer.from(data, "base64"));
  }
}
export function runCommand(root, command, signal, onUpdate = () => {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("命令已停止"));
    // Deliberately local execution, NOT an OS sandbox. Never inherit API credentials.
    const child = spawn("/bin/sh", ["-c", command], {
      cwd: root,
      detached: true,
      env: {
        PATH: process.env.PATH,
        HOME: root,
        TMPDIR: process.env.TMPDIR || "/tmp",
        LANG: "en_US.UTF-8",
      },
    });
    let output = "";
    let timedOut = false;
    let aborted = false;
    const kill = () => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const abort = () => {
      aborted = true;
      kill();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      kill();
    }, 60000);
    signal?.addEventListener("abort", abort, { once: true });
    const chunk = (data) => {
      output = (output + data.toString()).slice(-30000);
      onUpdate(output);
    };
    child.stdout.on("data", chunk);
    child.stderr.on("data", chunk);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      kill();
      resolve({ code, output, timedOut, aborted });
    });
  });
}
