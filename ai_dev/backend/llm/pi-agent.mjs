import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
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
import { safePath, listFiles } from "../shared/files.mjs";
import { skillCatalog } from "../shared/skills.mjs";

export async function createPiAgent({
  root,
  dataDir,
  modelConfig,
  messages = [],
  systemPrompt = "你是编码助手，使用工具完成任务。",
  allowedTools = [],
  tools = [],
  callTool,
  skillsRoot,
}) {
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
    // Disable implicit discovery; load only our explicitly approved catalog.
    skillsOverride: () => skillCatalog(skillsRoot),
    appendSystemPrompt: [],
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt,
  });
  await loader.reload();
  const manager = SessionManager.inMemory(root);
  for (const message of messages) manager.appendMessage(message);
  const seen = new Map();
  async function fingerprint(file) {
    try {
      return createHash("sha256")
        .update(await fs.readFile(file))
        .digest("hex");
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  const withinWorkspace = (tool) => ({
    ...tool,
    async execute(id, args, signal, onUpdate, context) {
      const target = path.resolve(root, args.path);
      const allowedRoot = skillsRoot && (target === skillsRoot || target.startsWith(skillsRoot + path.sep)) ? skillsRoot : root;
      const file = await safePath(allowedRoot, target),
        before = await fingerprint(file);
      if (tool.name === "write" && before !== null && seen.get(file) !== before)
        throw new Error("文件未读取或已被其他会话修改，请先重新读取再覆盖。");
      const result = await tool.execute(id, { ...args, path: file }, signal, onUpdate, context);
      const after = await fingerprint(file);
      if (tool.name !== "read" || before === after) seen.set(file, after);
      else seen.delete(file);
      return result;
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
    tools: allowedTools,
    customTools: [
      ...tools.map(tool => ({
        ...tool, label: tool.name,
        async execute(id, args, signal) {
          const result = await callTool(id, tool.name, args, signal);
          if (result.isError) throw new Error(result.content.filter(c => c.type === "text").map(c => c.text).join("\n") || "外部工具执行失败");
          return result;
        },
      })),
      {
        name: "list_files", label: "查看项目文件", description: "列出当前工作区的文件路径，不修改文件。",
        parameters: { type: "object", properties: {} },
        async execute() { return { content: [{ type: "text", text: (await listFiles(root)).join("\n") }], details: {} }; },
      },
      withinWorkspace(createReadTool(root)),
      withinWorkspace(createWriteTool(root)),
      withinWorkspace(createEditTool(root)),
      createBashTool(root, {
        exposeSessionEnvironment: false,
        spawnHook: (context) => ({
          ...context,
          env: {
            PATH: context.env.PATH,
            AI_DEV_WORKSPACE: root,
            ...(skillsRoot ? { AI_DEV_SKILLS_DIR: skillsRoot } : {}),
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
    async prompt(text) {
      session.setActiveToolsByName(allowedTools);
      return session.prompt(text, { expandPromptTemplates: false });
    },
    continue: () => session.agent.continue(),
    abort: () => session.abort().catch(() => {}),
    dispose: () => session.dispose(),
  };
}
