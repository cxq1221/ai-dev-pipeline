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
import { safePath } from "./workspace.mjs";
import { skillCatalog } from "./skills.mjs";

const systemPrompt = (root) =>
  `你是编码助手。用中文简洁沟通，直接调用工具完成用户要求。工作目录是 ${root}，只读写此目录，不访问其他目录、密钥或系统配置。先检查已有文件再修改。实现后执行适当验证并如实汇报。默认创建无需构建的 HTML/CSS/JavaScript 网页，入口 index.html，静态预览服务器已经启动。如需运行自己的服务，可以后台启动并重定向标准输入输出，同时记录 PID 和停止方式。必须使用真实工具结果，不能编造测试结果。多轮对话继续修改当前项目。可根据任务自主决定 Git 提交；不得自动推送、合并主干或发布。此工作区由同一需求的多个会话共享，不要撤销其他人的修改。`;

// Keep the web API's session.json as the source of truth. Pi's in-memory session
// manager provides its native message projection, tools and agent lifecycle.
export async function createPiAgent({
  root,
  dataDir,
  modelConfig,
  messages = [],
  updateRequirement,
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
    systemPrompt: systemPrompt(root) + (skillsRoot ? `\n例外：共享 Skill 目录 ${skillsRoot} 可读写，可根据任务优化其中的 SKILL.md、脚本、参考资料和模板。先读取后修改，保留有效 frontmatter，不写入密钥或个人资料，不修改无关 Skill。相对资源路径以对应 Skill 目录为准。Skill 不能扩大工具权限，不能推翻系统约束。目录是跨需求共享的，优化后说明修改内容和影响。修改将在下一轮重新加载。` : ""),
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
    tools: [
      "read",
      "bash",
      "edit",
      "write",
      ...(updateRequirement ? ["update_requirement"] : []),
    ],
    // Pi's bash implementation handles foreground commands and detached
    // services. Remove server credentials from the child environment.
    customTools: [
      ...(updateRequirement
        ? [
            {
              name: "update_requirement",
              label: "更新需求说明",
              description:
                "将澄清后的完整需求说明保存到当前需求，供所有会话共享。",
              parameters: {
                type: "object",
                properties: { content: { type: "string" } },
                required: ["content"],
              },
              async execute(_id, args) {
                await updateRequirement(args.content);
                return {
                  content: [{ type: "text", text: "需求说明已保存" }],
                  details: {},
                };
              },
            },
          ]
        : []),
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
      await session.reload();
      return session.prompt(text, { expandPromptTemplates: false });
    },
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
