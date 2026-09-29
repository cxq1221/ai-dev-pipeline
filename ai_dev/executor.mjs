import path from "node:path";
import { startExecutor } from "./backend/executor/http.mjs";
const service = await startExecutor({
  port: Number(process.env.EXECUTOR_PORT || 4418),
  previewPort: Number(process.env.PREVIEW_PORT || 4419),
  dataRoot: path.resolve(process.env.DATA_ROOT || ".data"),
  workspaceRoot: path.resolve(process.env.WORKSPACE_ROOT || "workspaces"),
  gatewayUrl: `http://127.0.0.1:${process.env.PORT || 4417}`,
});
console.log(`Pi 执行服务 ${service.url}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await service.close();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
