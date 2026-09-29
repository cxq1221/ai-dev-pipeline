import fs from "node:fs/promises";
import { selectedSkills } from "../shared/skills.mjs";
const grillingPrompt = await fs.readFile(new URL("./prompts/grilling.md", import.meta.url), "utf8");
const developmentPrompt = (root) =>
  `你是编码助手。用中文简洁沟通，直接调用工具完成用户要求。工作目录是 ${root}，只读写此目录，不访问其他目录、密钥或系统配置。先检查已有文件再修改。实现后执行适当验证并如实汇报。默认创建无需构建的 HTML/CSS/JavaScript 网页，入口 index.html，静态预览服务器已经启动。如需运行自己的服务，可以后台启动并重定向标准输入输出，同时记录 PID 和停止方式。必须使用真实工具结果，不能编造测试结果。多轮对话继续修改当前项目。可根据任务自主决定 Git 提交；不得自动推送、合并主干或发布。此工作区由同一需求的多个会话共享，不要撤销其他人的修改。`;


export function capabilities({ root, skillsRoot, mode, isClarification, requestDevelopment, skillNames }) {
  const tools = [{ name: "update_requirement", description: "将澄清后的完整需求说明保存到当前需求，供所有会话共享。", parameters: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } }];
  if (mode === "clarification" && isClarification && requestDevelopment) tools.push({ name: "complete_clarification", description: "仅当所有问题已解决时提交完整需求结论。本轮成功后系统自动开发，无需用户再次确认。", parameters: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } });
  return {
    systemPrompt: mode === "clarification" ? `你是需求澄清助手，用中文沟通。当前阶段仅澄清需求，不进行开发。工作区：${root}。${skillsRoot ? `可只读查看共享 Skill：${skillsRoot}。` : ""}。列出和读取文件、保存澄清后的完整需求说明。不得修改代码、Skill 或执行 Shell。
只有所有需求澄清完毕，没有任何未讨论的决策分支，才能进入开发。
以下是完整的 grilling 访谈规则：
${grillingPrompt}

ai_dev 适配规则（与上述通用规则冲突时，以本段为准）：
- 用户说“全部按推荐”或“你决定”算有效回答，表示接受当前轮推荐或授权你决定；记录采用的具体决定，不要反复要求用户逐题重答。检查这些答案是否引出下一轮问题，不等于直接跳过整个澄清过程。
- 不增加客户确认、客户审批或独立确认表单。明确回答、接受推荐或授权决定可以形成共同理解；不要机械地重复索要确认。
- 当前运行环境没有子 Agent 工具。需要查证的事实由你调用 read、list_files 自行查证；没有资料时说明缺失，不得编造调查结果。
- 用户未回答问题时说“开始开发”，不算回答。仍有未解决的问题时继续澄清，不得声称已经完成。
- 用户请求开始开发时，先检查已有对话：是否仍有未答问题、含糊或矛盾的信息。未澄清完就继续提问，不调用 complete_clarification。若需求已明确、已形成共同理解且本轮提供 complete_clarification 工具，调用它保存完整需求结论（包括目标、范围、关键行为和验收标准）。这一轮仍不修改代码；成功结束后系统自动启动下一轮开发。不要再让用户说“开始开发”，也不要询问是否进入开发。普通会话不能代替需求澄清会话完成这一步。` : developmentPrompt(root),
    allowedTools: [...(mode === "clarification" ? ["read", "list_files"] : ["read", "write", "edit", "bash", "list_files"]), ...tools.map(t => t.name)],
    tools,
    skillsRoot,
    skills: selectedSkills(skillsRoot, skillNames).map(s => ({ name: s.name, content: `文件：${s.filePath}\n相对资源目录：${s.baseDir}\n${s.content}` })),
  };
}
