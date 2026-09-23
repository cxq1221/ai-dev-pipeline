import { createModels } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";

const models = createModels();
models.setProvider(deepseekProvider());
// Only this server-side table selects provider endpoints and credential sources.
const allowed = new Set(["deepseek-flash", "deepseek-v4-pro"]);
export function resolveModel(name) {
  if (!allowed.has(name)) {
    throw Object.assign(
      new Error(`不支持的 model，可选：${[...allowed].join(", ")}`),
      { status: 400 },
    );
  }
  return {
    model: { ...models.getModel("deepseek", name), maxTokens: 8192 },
    apiKey: process.env.DEEPSEEK_API_KEY,
    streamFn: models.streamSimple.bind(models),
  };
}
export function redact(value) {
  const key = process.env.DEEPSEEK_API_KEY;
  return key ? String(value).split(key).join("[REDACTED]") : String(value);
}
