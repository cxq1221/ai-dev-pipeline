import { test, expect } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startExecutor } from "../backend/executor/http.mjs";

test("真实 Pi 通过执行接口写入网页并执行 Shell", async () => {
  if (!process.env.DEEPSEEK_API_KEY)
    throw new Error("缺少模型配置，不能视为验证通过");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-dev-pi-"));
  const service = await startExecutor({
    port: 0,
    previewPort: 0,
    dataRoot: path.join(root, "runtime"),
  });
  const request = async (route, body) => {
    const r = await fetch(service.url + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    expect(r.status).toBe(200);
    return data;
  };
  try {
    await request("/sessions/smoke", {
      requirementId: "smoke",
      workspacePath: root,
      model: "deepseek-flash",
      messages: [],
    });
    await request("/sessions/smoke/chat", {
      turnId: "smoke-1",
      message:
        "请用 write 工具创建 index.html，内容严格为 <h1>Pi smoke</h1>，然后用 bash 执行 pwd。不要提交 Git。",
    });
    let state;
    for (let i = 0; i < 240; i++) {
      state = await (await fetch(service.url + "/sessions/smoke")).json();
      if (!state.busy) break;
      await Bun.sleep(500);
    }
    expect(state.turn.status).toBe("done");
    expect(await fs.readFile(path.join(root, "index.html"), "utf8")).toContain(
      "<h1>Pi smoke</h1>",
    );
    expect(
      state.turn.blocks.some((b) => b.name === "bash" && b.status === "done"),
    ).toBe(true);
    expect(state.messages.some((m) => m.role === "toolResult")).toBe(true);
    await request("/sessions/smoke/chat", {
      turnId: "smoke-2",
      message: "执行 bash sleep 30，然后汇报。",
    });
    const stopAt = Date.now();
    await request("/sessions/smoke/stop", {});
    expect(Date.now() - stopAt).toBeLessThan(5000);
    state = await (await fetch(service.url + "/sessions/smoke")).json();
    expect(state.busy).toBe(false);
    expect(state.turn.status).toBe("stopped");
    await request("/sessions/smoke/chat", {
      turnId: "smoke-3",
      message: "读取 index.html 并只汇报里面的标题，不修改文件。",
    });
    for (let i = 0; i < 240; i++) {
      state = await (await fetch(service.url + "/sessions/smoke")).json();
      if (!state.busy) break;
      await Bun.sleep(500);
    }
    expect(state.turn.status).toBe("done");
    expect(
      state.turn.blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join(""),
    ).toContain("Pi smoke");
  } finally {
    await service.close();
  }
}, 150000);
