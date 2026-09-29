import { startExecutor } from "../backend/executor/http.mjs";
await startExecutor({
  port: Number(process.env.TEST_EXECUTOR_PORT),
  previewPort: 0,
  dataRoot: process.env.TEST_DATA_ROOT,
  modelBaseUrl: process.env.TEST_MODEL_URL,
});
