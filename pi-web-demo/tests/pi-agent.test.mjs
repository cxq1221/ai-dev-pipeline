import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPiAgent } from "../backend/pi-agent.mjs";
import { resolveModel } from "../backend/models.mjs";

test("Pi Coding Agent runs its file and bash tools in the selected workspace", async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "pi-coding-web-"));
  const root = path.join(base, "workspace");
  const dataDir = path.join(base, "data");
  await fs.mkdir(root);
  await fs.mkdir(dataDir);
  const agent = await createPiAgent({
    root,
    dataDir,
    modelConfig: {
      ...resolveModel("deepseek-flash"),
      apiKey: "test-only-placeholder",
    },
    messages: [],
  });
  t.after(async () => {
    agent.dispose();
    await fs.rm(base, { recursive: true, force: true });
  });
  const tools = Object.fromEntries(agent.state.tools.map((tool) => [tool.name, tool]));
  assert.deepEqual(Object.keys(tools).sort(), ["bash", "edit", "read", "write"]);
  await tools.write.execute("write-1", { path: "index.html", content: "hello" });
  assert.equal(await fs.readFile(path.join(root, "index.html"), "utf8"), "hello");
  await assert.rejects(
    tools.write.execute("write-2", { path: "../outside.txt", content: "bad" }),
    /工作目录/,
  );
  const shell = await tools.bash.execute("bash-1", {
    command: 'pwd; test -z "$DEEPSEEK_API_KEY"',
  });
  assert.match(shell.content[0].text, new RegExp(root.replaceAll("/", "\\/")));
  const controller = new AbortController();
  const pending = tools.bash.execute("bash-2", { command: "sleep 30" }, controller.signal);
  setTimeout(() => controller.abort(), 80);
  await assert.rejects(pending, /aborted/);

  const started = await tools.bash.execute("bash-3", {
    command:
      'node -e "setTimeout(() => require(\'node:fs\').writeFileSync(\'marker.txt\', \'alive\'), 200); setInterval(() => {}, 1000)" >/dev/null 2>&1 </dev/null & echo $!',
  });
  const pid = Number(started.content[0].text.trim());
  assert.ok(Number.isInteger(pid) && pid > 0);
  t.after(() => {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(await fs.readFile(path.join(root, "marker.txt"), "utf8"), "alive");
  process.kill(pid, 0);
});
