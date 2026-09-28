import path from "node:path";
import {
  createAgentSession,
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { safePath } from "../workspace.mjs";

const systemPrompt = (root) =>
  `你是编码助手。用中文简洁沟通，直接调用工具完成用户要求。工作目录是 ${root}，只读写此目录，不访问其他目录、密钥或系统配置。先检查已有文件再修改。实现后执行适当验证并如实汇报。默认创建无需构建的 HTML/CSS/JavaScript 网页，入口 index.html，静态预览服务器已经启动。如需运行自己的服务，可以后台启动并重定向标准输入输出，同时记录 PID 和停止方式。必须使用真实工具结果，不能编造测试结果。多轮对话继续修改当前项目。不要提交、推送、部署，除非用户明确要求。`;

// Keep the web API's session.json as the source of truth. Pi's in-memory session
// manager provides its native message projection, tools and agent lifecycle.
export async function createPiAgent({ root, dataDir, modelConfig, messages }) {
  const agentDir = path.join(dataDir, "pi-config");
  const runtime = await ModelRuntime.create({
    authPath: path.join(agentDir, "auth.json"),
    modelsPath: null,
    refreshOnCreate: false,
  });
  if (modelConfig.apiKey)
    await runtime.setRuntimeApiKey("deepseek", modelConfig.apiKey);
  const settings = SettingsManager.create(root, agentDir);
  const loader = new DefaultResourceLoader({
    cwd: root,
    agentDir,
    settingsManager: settings,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: systemPrompt(root),
  });
  await loader.reload();
  const manager = SessionManager.inMemory(root);
  for (const message of messages) manager.appendMessage(message);
  const withinWorkspace = (tool) => ({
    ...tool,
    async execute(id, args, signal, onUpdate, context) {
      await safePath(root, args.path);
      return tool.execute(id, args, signal, onUpdate, context);
    },
  });
  const { session } = await createAgentSession({
    cwd: root,
    agentDir,
    modelRuntime: runtime,
    model: modelConfig.model,
    thinkingLevel: "off",
    settingsManager: settings,
    sessionManager: manager,
    resourceLoader: loader,
    tools: ["read", "bash", "edit", "write"],
    // Pi's bash implementation handles foreground commands and detached
    // services. Remove server credentials from the child environment.
    customTools: [
      withinWorkspace(createReadTool(root)),
      withinWorkspace(createWriteTool(root)),
      withinWorkspace(createEditTool(root)),
      createBashTool(root, {
        exposeSessionEnvironment: false,
        spawnHook: (context) => ({
          ...context,
          env: {
            PATH: context.env.PATH,
            HOME: root,
            TMPDIR: context.env.TMPDIR || "/tmp",
            LANG: "en_US.UTF-8",
          },
        }),
      }),
    ],
  });
  return {
    state: session.state,
    subscribe: (listener) => session.subscribe(listener),
    prompt: (text) => session.prompt(text, { expandPromptTemplates: false }),
    abort: () => session.abort().catch(() => {}),
    setModel: (config) => session.setModel(config.model),
    restoreMessages(restored) {
      manager.resetLeaf();
      for (const message of restored) manager.appendMessage(message);
      session.refreshContext();
    },
    dispose: () => session.dispose(),
  };
}
