import { startGateway } from "./backend/gateway/http.mjs";
const service = await startGateway({
  port: Number(process.env.PORT || 4417),
  executorUrl: `http://127.0.0.1:${process.env.EXECUTOR_PORT || 4418}`,
  serveUI: process.env.NODE_ENV === "development" ? "development" : true,
});
console.log(`需求工作台 ${service.url}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await service.close();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
