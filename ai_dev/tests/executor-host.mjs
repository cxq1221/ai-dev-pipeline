import { startLlmBackend } from "../backend/llm/http.mjs";
await startLlmBackend({ databaseUrl: process.env.TEST_DATABASE_URL,
  port: Number(process.env.TEST_EXECUTOR_PORT),
  dataRoot: process.env.TEST_DATA_ROOT,
  modelBaseUrl: process.env.TEST_MODEL_URL,
});
