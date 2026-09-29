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
import { safePath, listFiles } from "./workspace.mjs";
import { skillCatalog } from "./skills.mjs";

const grillingPrompt = await fs.readFile(new URL("./prompts/grilling.md", import.meta.url), "utf8");

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
  let mode = "development", requestDevelopment = false;
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
    systemPromptOverride: (base) => mode === "clarification"
      ? `你是需求澄清助手，用中文沟通。当前阶段仅澄清需求，不进行开发。工作区：${root}。${skillsRoot ? `可只读查看共享 Skill：${skillsRoot}。` : ""}。列出和读取文件、保存澄清后的完整需求说明。不得修改代码、Skill 或执行 Shell。
只有所有需求澄清完毕，没有任何未讨论的决策分支，才能进入开发。
以下是完整的 grilling 访谈规则：
${grillingPrompt}

ai_dev 适配规则（与上述通用规则冲突时，以本段为准）：
- 用户说“全部按推荐”或“你决定”算有效回答，表示接受当前轮推荐或授权你决定；记录采用的具体决定，不要反复要求用户逐题重答。检查这些答案是否引出下一轮问题，不等于直接跳过整个澄清过程。
- 不增加客户确认、客户审批或独立确认表单。明确回答、接受推荐或授权决定可以形成共同理解；不要机械地重复索要确认。
- 当前运行环境没有子 Agent 工具。需要查证的事实由你调用 read、list_files 自行查证；没有资料时说明缺失，不得编造调查结果。
- 用户未回答问题时说“开始开发”，不算回答。仍有未解决的问题时继续澄清，不得声称已经完成。
- 用户请求开始开发时，先检查已有对话：是否仍有未答问题、含糊或矛盾的信息。未澄清完就继续提问，不调用 complete_clarification。若需求已明确、已形成共同理解且本轮提供 complete_clarification 工具，调用它保存完整需求结论（包括目标、范围、关键行为和验收标准）。这一轮仍不修改代码；成功结束后系统自动启动下一轮开发。不要再让用户说“开始开发”，也不要询问是否进入开发。普通会话不能代替需求澄清会话完成这一步。`
      : base,
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
      if (mode === "clarification" && tool.name !== "read") throw new Error("澄清阶段不允许修改文件，请先开始开发。");
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
      "list_files",
      "complete_clarification",
      ...(updateRequirement ? ["update_requirement"] : []),
    ],
    // Pi's bash implementation handles foreground commands and detached
    // services. Remove server credentials from the child environment.
    customTools: [
      {
        name: "complete_clarification", label: "完成需求澄清", description: "仅在用户请求开始开发且全部需求问题已解决时调用，提交完整需求结论；成功结束本轮后系统自动开始开发。未回答问题或仍有歧义时必须继续提问。",
        parameters: { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
        async execute(_id, args) {
          if (mode !== "clarification" || !requestDevelopment) throw new Error("当前轮次不允许完成需求澄清");
          if (typeof args.content !== "string" || !args.content.trim() || args.content.length > 50000) throw new Error("请提交 1–50000 字的完整需求结论");
          return { content: [{ type: "text", text: "需求结论已提交；本轮成功结束后系统会自动继续开发，无需用户再次操作。" }], details: {} };
        },
      },
      {
        name: "list_files", label: "查看项目文件", description: "列出当前需求工作区的文件路径，不修改文件。",
        parameters: { type: "object", properties: {} },
        async execute() { return { content: [{ type: "text", text: (await listFiles(root)).join("\n") }], details: {} }; },
      },
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
    async prompt(text, nextMode = "development", wantsDevelopment = false) {
      requestDevelopment = wantsDevelopment === true;
      mode = nextMode === "clarification" ? "clarification" : "development";
      await session.reload();
      session.setActiveToolsByName(mode === "clarification"
        ? ["read", "list_files", ...(requestDevelopment ? ["complete_clarification"] : []), ...(updateRequirement ? ["update_requirement"] : [])]
        : ["read", "write", "edit", "bash", "list_files", ...(updateRequirement ? ["update_requirement"] : [])]);
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
