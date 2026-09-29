import { test, expect } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startLlmBackend } from "../backend/llm/http.mjs";

test("真实 Pi 通过标准 chat 写入网页、执行 Shell、停止并续聊", async () => {
  if (!process.env.DEEPSEEK_API_KEY || !process.env.TEST_DATABASE_URL) throw new Error("需要真实模型配置和独立测试数据库");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-dev-pi-"));
  const service = await startLlmBackend({ databaseUrl: process.env.TEST_DATABASE_URL, port: 0, dataRoot: path.join(root, "runtime") });
  const sessionId = crypto.randomUUID();
  const input = { sessionId, workspacePath: root, allowedTools: ["read", "write", "edit", "bash"] };
  const request = async (route, body) => {
    const response = await fetch(service.url + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect(response.status).toBe(200);
    return response;
  };
  const run = async body => (await (await request("/chat", body)).text()).split("\n\n").filter(s => s.includes("data: ")).map(s => JSON.parse(s.split("data: ")[1])).at(-1);
  try {
    let result = await run({ ...input, message: "用 write 创建 index.html，内容严格为 <h1>Pi smoke</h1>，然后用 bash 执行 pwd。不要提交 Git。" });
    expect(result.turn.status).toBe("done");
    expect(await fs.readFile(path.join(root, "index.html"), "utf8")).toContain("<h1>Pi smoke</h1>");
    expect(result.turn.blocks.some(b => b.name === "bash" && b.status === "done")).toBe(true);
    const pending = await request("/chat", { ...input, message: "执行 bash sleep 30，然后汇报。" });
    await pending.body.cancel();
    await (await request("/stop", { sessionId })).json();
    const stopped = await (await fetch(service.url + `/sessions/${sessionId}`)).json();
    expect(stopped.current.status).toBe("stopped");
    result = await run({ ...input, message: "读取 index.html 并汇报标题，不修改文件。" });
    expect(result.turn.status).toBe("done");
    expect(result.turn.blocks.filter(b => b.type === "text").map(b => b.text).join("")).toContain("Pi smoke");
  } finally { await service.close(); }
}, 150000);
