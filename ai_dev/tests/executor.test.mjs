import { test, expect } from "bun:test";

test("本机执行服务提供健康状态", async () => {
  const { startExecutor } = await import("../backend/executor/http.mjs");
  const service = await startExecutor({ port: 0, previewPort: 0 });
  try {
    const response = await fetch(`${service.url}/health`);
    expect(await response.json()).toEqual({ ok: true, service: "executor" });
  } finally {
    await service.close();
  }
});
