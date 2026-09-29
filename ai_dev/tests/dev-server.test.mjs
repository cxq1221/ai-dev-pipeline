import { test, expect } from "bun:test";
import { startGateway } from "../backend/gateway/http.mjs";
test("开发模式直接提供 Vue 源码入口", async () => {
  const gw = await startGateway({
    port: 0,
    databaseUrl: process.env.TEST_DATABASE_URL,
    serveUI: "development",
  });
  try {
    const response = await fetch(gw.url + "/src/main.js");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("createApp");
  } finally {
    await gw.close();
  }
});
