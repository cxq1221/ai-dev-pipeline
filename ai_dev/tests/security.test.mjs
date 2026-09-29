import { test, expect } from "bun:test";
import { startExecutor } from "../backend/executor/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";
test("浏览器跨站请求不能访问网关或触发本机执行", async () => {
  const ex = await startExecutor({ port: 0, previewPort: 0 });
  const gw = await startGateway({
    port: 0,
    executorUrl: ex.url,
    databaseUrl: process.env.TEST_DATABASE_URL,
  });
  try {
    expect(
      (
        await fetch(gw.url + "/api/requirements", {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(ex.url + "/workspaces", {
          method: "POST",
          headers: { Origin: "null", "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(gw.url + "/health", { headers: { Host: "evil.example" } }))
        .status,
    ).toBe(403);
  } finally {
    await gw.close();
    await ex.close();
  }
});
