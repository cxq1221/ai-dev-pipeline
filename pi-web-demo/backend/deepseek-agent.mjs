import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";

const modelIds = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);
const shellPatch = fileURLToPath(new URL("./deepseek-shell.patch.yml", import.meta.url));

export function resolveDeepSeekModel(name) {
  const id = name === "deepseek-flash" ? "deepseek-v4-flash" : name;
  if (!modelIds.has(id))
    throw Object.assign(new Error("不支持的 model，可选：deepseek-flash, deepseek-v4-pro"), { status: 400 });
  return { id, apiKey: process.env.DEEPSEEK_API_KEY };
}

export function createDeepSeekAgent({ root, dataDir, sessionId, model }) {
  let harness;
  const selectedModel = model;

  async function close() {
    const closing = harness;
    harness = undefined;
    if (closing) await closing.close();
  }

  async function run(prompt, modelConfig, onNotification) {
    if (modelConfig.id !== selectedModel.id) throw new Error("Harness 模型与当前会话不一致");
    if (!harness) {
      const env = {
        PATH: process.env.PATH,
        HOME: root,
        TMPDIR: process.env.TMPDIR || "/tmp",
        LANG: process.env.LANG || "en_US.UTF-8",
        DEEPSEEK_API_KEY: selectedModel.apiKey,
        DSH_HOME: path.join(dataDir, "harness"),
        DSH_SYSTEM_PROMPT: `你是编码助手。用中文简洁沟通，在工作目录 ${root} 内完成用户的开发任务。先检查文件再修改，完成后执行适当验证。默认创建可直接预览的 index.html。不要提交、推送或部署，除非用户明确要求。只汇报真实执行结果。`,
      };
      if (process.env.DEEPSEEK_BASE_URL)
        env.DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL;
      harness = new DeepSeekHarness({
        profile: "sdk-minimal",
        patches: [shellPatch],
        cwd: root,
        processCwd: root,
        dshHome: env.DSH_HOME,
        provider: "deepseek-official",
        model: selectedModel.id,
        // Coding tasks may spend substantial output tokens on reasoning before
        // producing a tool call. Match the official SDK example's budget.
        maxTokens: 49_152,
        env,
        initializeTimeoutMs: 30000,
      });
    }
    return harness.run(prompt, { sessionId, onNotification });
  }

  return { run, close };
}
