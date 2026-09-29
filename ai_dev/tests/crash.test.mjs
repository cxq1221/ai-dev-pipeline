import { test, expect } from "bun:test";
import path from "node:path";
import { fixture, api, completeClarification } from "./helpers.mjs";
import { modelServer } from "./model-server.mjs";
import { startGateway } from "../backend/gateway/http.mjs";
test("执行进程被终止后显示中断，继续时不重放旧请求", async () => {
  const f = await fixture(),
    model = modelServer(),
    url = "http://127.0.0.1:4468";
  let proc;
  async function launch() {
    proc = Bun.spawn([process.execPath, "tests/executor-host.mjs"], {
      cwd: import.meta.dir + "/..",
      env: {
        ...process.env,
        TEST_EXECUTOR_PORT: "4468",
        TEST_DATA_ROOT: path.join(f.root, "runtime"),
        TEST_MODEL_URL: model.url,
      },
      stdout: "ignore",
      stderr: "pipe",
    });
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(url + "/health")).ok) return;
      } catch {}
      await Bun.sleep(100);
    }
    throw new Error("执行服务未启动");
  }
  await launch();
  const gw = await startGateway({
    port: 0,
    executorUrl: url,
    databaseUrl: process.env.TEST_DATABASE_URL,
  });
  try {
    const r = await api(gw.url, "/api/requirements", {
      title: "中断恢复",
      originalDescription: "测试",
      repositoryPath: f.repo,
    });
    await completeClarification(gw.url, r.id);
    const initialRequests = model.requests.length;
    const c = await api(gw.url, `/api/requirements/${r.id}/conversations`, {
      title: "A",
    });
    await api(gw.url, `/api/conversations/${c.id}/chat`, { message: "慢任务" });
    for (let i = 0; i < 30 && model.requests.length === initialRequests; i++) await Bun.sleep(20);
    proc.kill("SIGKILL");
    await proc.exited;
    await launch();
    expect(
      (await api(gw.url, `/api/conversations/${c.id}/state`)).turns[0].status,
    ).toBe("interrupted");
    await api(gw.url, `/api/conversations/${c.id}/chat`, {
      message: "检查文件后继续",
    });
    let state;
    for (let i = 0; i < 60; i++) {
      state = await api(gw.url, `/api/conversations/${c.id}/state`);
      if (!state.busy) break;
      await Bun.sleep(50);
    }
    expect(state.turns.at(-1).status).toBe("done");
    expect(model.requests.length).toBe(initialRequests + 2);
  } finally {
    await gw.close();
    proc.kill("SIGKILL");
    await proc.exited;
    model.close();
  }
}, 15000);
