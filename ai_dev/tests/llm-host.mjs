import { startLlmBackend } from "../backend/llm/http.mjs";
const server = await startLlmBackend({ port: Number(process.env.TEST_EXECUTOR_PORT || 0), databaseUrl: process.env.TEST_DATABASE_URL, dataRoot: process.env.TEST_DATA_ROOT, modelBaseUrl: process.env.TEST_MODEL_URL });
console.log(server.url);
