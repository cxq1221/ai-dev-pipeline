import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
export async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-dev-test-"));
  const repo = path.join(root, "repo");
  await fs.mkdir(repo);
  const git = (...args) => {
    const r = Bun.spawnSync(["git", "-C", repo, ...args]);
    if (r.exitCode) throw new Error(r.stderr.toString());
    return r.stdout.toString().trim();
  };
  git("init");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "Test");
  await fs.writeFile(path.join(repo, "index.html"), "<h1>Original</h1>\n");
  git("add", ".");
  git("commit", "-m", "baseline");
  return { root, repo, git };
}
export async function api(url, route, body, method = body ? "POST" : "GET") {
  const response = await fetch(url + route, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error), { status: response.status });
  return data;
}
