import { test, expect } from "bun:test";

test("本机执行服务提供健康状态", async () => {
  const { startLlmBackend } = await import("../backend/llm/http.mjs");
  const service = await startLlmBackend({ databaseUrl: process.env.TEST_DATABASE_URL, port: 0, previewPort: 0 });
  try {
    const response = await fetch(`${service.url}/health`);
    expect(await response.json()).toEqual({ ok: true, service: "llm" });
  } finally {
    await service.close();
  }
});
