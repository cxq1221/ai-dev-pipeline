import path from "node:path";
import { startLlmBackend } from "./backend/llm/http.mjs";
const service = await startLlmBackend({
  port: Number(process.env.EXECUTOR_PORT || 4418),
  dataRoot: path.resolve(process.env.DATA_ROOT || ".data"),
  databaseUrl: process.env.LLM_DATABASE_URL,
});
console.log(`大模型后端 ${service.url}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await service.close();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
