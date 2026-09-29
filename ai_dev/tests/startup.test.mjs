import { test, expect } from "bun:test";
test("统一启动命令启动两个 Bun 服务并在退出时关闭端口", async () => {
  const proc = Bun.spawn([process.execPath, "scripts/dev.mjs"], {
    cwd: import.meta.dir + "/..",
    env: {
      ...process.env,
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      LLM_DATABASE_URL: process.env.TEST_DATABASE_URL,
      PORT: "4457",
      EXECUTOR_PORT: "4458",
      PREVIEW_PORT: "4459",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        ready =
          (await fetch("http://127.0.0.1:4457/health")).ok &&
          (await fetch("http://127.0.0.1:4458/health")).ok;
        if (ready) break;
      } catch {}
      await Bun.sleep(100);
    }
    expect(ready).toBe(true);
  } finally {
    proc.kill("SIGTERM");
    await proc.exited;
  }
  let reachable = false;
  try {
    reachable = (await fetch("http://127.0.0.1:4458/health")).ok;
  } catch {}
  expect(reachable).toBe(false);
}, 15000);
