# 网页编码 Demo：Pi / DeepSeek Harness

提供两个可单独启动的后端，共用 HTTP/SSE 接口及 Vue Quickstart、场景工作台。Pi 版通过 [Pi Coding Agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) 0.87.1 的 `createAgentSession` 运行。DeepSeek 版通过官方 [DeepSeek Harness TypeScript SDK](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/sdk/client) 启动 `sdk-minimal` Harness 子进程，由 Harness 自己驱动模型和工具；它不是只调用 DeepSeek 模型的自制 Agent。

## 启动前准备

需要 Node.js 22.19+ 和 npm。在 `pi-web-demo/` 目录执行：

```bash
npm ci
```

如果没有 `.env`，复制 `.env.example` 为 `.env`，在其中填写 `DEEPSEEK_API_KEY`；已有 `.env` 不要覆盖。当前机器已配置本地 `.env`。

## 启动场景化 Demo

在 `pi-web-demo/` 目录执行：

```bash
npm run dev
```

打开 http://127.0.0.1:4317/ 。这个页面是完整工作台，包含聊天、文件、diff、撤销和网页预览。前端修改支持热更新；修改后端代码需重启命令。若要用构建后的静态页面运行，执行 `npm start`（会先自动构建）。

## 启动 DeepSeek Harness 版

在同一目录执行：

```bash
npm run dev:deepseek
```

打开 http://127.0.0.1:4319/ 看场景工作台，或 http://127.0.0.1:4319/quickstart/ 看简洁对话示例。静态预览端口为 4320。生产构建方式为 `npm run start:deepseek`。脚本默认使用 4319，即使 `.env` 中为 Pi 版写了 `PORT=4317`；也可在命令前设置 `PORT=其他端口`。两个版本可同时运行，工作区分别位于 `workspaces/` 与 `workspaces-deepseek/`，会话记录也分别存储。

DeepSeek 版的 `model=deepseek-flash` 映射到 Harness 的 `deepseek-v4-flash`，`deepseek-v4-pro` 保持原名。Key 仍只在服务端 `.env` 的 `DEEPSEEK_API_KEY` 中，浏览器无需改代码。Harness 使用官方 `sdk-minimal` 组合和 JSONL 会话日志；[配置补丁](backend/deepseek-shell.patch.yml)把默认的持久 PTY Bash 换成 Harness 自带的单次 Bash 工具，以便多次命令稳定执行。其他 Agent 循环、模型适配器和会话日志仍由 Harness 管理。[官方说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-minimal/README.md)指出该模式是 `danger-full-access`，命令以当前系统用户权限在本机执行，工作目录不是安全边界。仅供可信本机开发使用。

Harness 的单次模型输出上限设为 49,152 tokens。若模型在一次请求中达到该上限，轮次显示为失败并提示拆分需求；已执行的工具和文件修改不会因此自动回滚。

两版有一个能力差异：当前 [Harness SDK 协议](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/protocol/README.md)没有单轮取消或会话回退接口。“停止”会关闭当前 Harness 子进程；下一轮新建 Harness 会话并带入最近完成轮次的文本记录，保留工作区文件。服务重启或切换模型时也采用这种文本恢复方式，旧的 Harness JSONL 日志留在 `.data/deepseek/`；它不等于恢复完整的工具调用和模型内部上下文。因此 DeepSeek 版 `canUndo=false`，`/api/undo` 返回 501，场景工作台不显示撤销按钮。Pi 版仍保持原有完整撤销行为。

## 启动 Quickstart Demo

最简单的方式是在 `pi-web-demo/` 目录执行同一个服务命令：

```bash
npm run dev
```

打开 http://127.0.0.1:4317/quickstart/ 。同一个服务同时提供两个页面，不需要为 Quickstart 再启动一个后端进程。Quickstart 页面只有聊天区，连接参数固定在 `frontend/quickstart/src/App.vue` 顶部，代码注释标明接入步骤。

如果要把 Quickstart 当成独立 Vue 项目运行，请先保持上述后端服务运行，再在**另一个终端**进入 `pi-web-demo/` 目录并执行：

```bash
cd frontend/quickstart
npm ci
npm run dev
```

打开 http://127.0.0.1:5173/ 。独立 Vite 开发服务器会把 `/api` 转发到 `127.0.0.1:4317`。两种 Quickstart 启动方式及复制到其他项目的说明见 [Quickstart README](frontend/quickstart/README.md)。单独构建整个项目使用 `npm run build`。

模型通过请求参数 `model` 选择，支持 `deepseek-flash` 和 `deepseek-v4-pro`，Key 只在服务端 `.env` 配置。接口必填 `session`、`model`、9 位字符串 `appID`，无需 `X-CSRF-Token`。完整请求、响应和 Vue 接入示例见 [API.md](API.md)。`.env`、会话数据和生成文件均被 Git 忽略。

## 两个使用示例

- **API Quickstart**：http://127.0.0.1:4317/quickstart/ ，只演示聊天、SSE 接收和停止。代码集中在 [frontend/quickstart/src/App.vue](frontend/quickstart/src/App.vue)，无 SDK 依赖；[独立运行说明](frontend/quickstart/README.md)。
- **场景工作台**：http://127.0.0.1:4317/ ，保留文件查看、diff、撤销和网页预览。两者通过不同 appID/session 分离数据。

## 基础功能

- 按 `appID + session` 隔离多轮对话、工作区、撤销和 SSE；Vue 页面一次展示一个会话，刷新/正常重启后恢复。
- 使用 Pi Coding Agent 的文件与 shell 工具检查、创建和修改代码并验证结果。
- 展示工具执行过程、输出、成功/失败、每轮耗时；可停止当前执行并继续需求。
- 真实文件快照产生每轮 diff、增加/删除行数；支持撤销最近一轮的文件修改，同时恢复该轮之前的模型上下文。历史卡片保留并标明已撤销。
- 查看工作区文件和源码；自动显示 `index.html` 静态网页，支持手动刷新、独立窗口。
- 清空对话保留文件。没有上传、多会话列表 UI、账户系统、Git 提交、部署或后台构建服务器管理。

可直接输入：“做一个待办清单，支持新增、完成和删除”；继续输入：“增加未完成筛选，调整按钮颜色”。也可直接把要开发的现有小型项目复制到 `workspace/`，然后让 Agent 查看代码。

## 文件与边界

- `server.mjs`：HTTP 启动、网页托管、允许的浏览器来源和预览服务。
- `backend/http.mjs`：HTTP/SSE 接口及会话预览路由。
- `backend/sessions.mjs`：参数校验、会话实例和目录隔离。
- `backend/session.mjs`：Web 会话状态、执行、停止、撤销及持久化。
- `backend/pi-agent.mjs`：创建 Pi Coding Agent 会话、内置工具和服务端模型认证。
- `server-deepseek.mjs`、`backend/deepseek-*.mjs`：DeepSeek Harness 版服务入口、会话隔离、SDK 子进程与事件映射。
- `backend/models.mjs`：支持的模型及服务端 Key 来源。
- `API.md`：前端/客户端直接调用的 API 契约。
- `workspace.mjs`：文件范围校验、快照、diff 和撤销。
- `frontend/src/App.vue`：页面布局及组件间交互。
- `frontend/src/components/ChatTurn.vue`：消息、工具记录、Markdown 和变更卡片。
- `frontend/src/components/ChatComposer.vue`：输入、发送、停止及快捷键。
- `frontend/src/components/WorkspacePanel.vue`：文件读取、diff 和网页预览。
- `frontend/src/components/ConfirmDialog.vue`：可访问的确认弹窗。
- `frontend/src/composables/useSession.js`：API 公共参数、响应式会话、SSE 连接及清理。
- `frontend/src/style.css`：共享样式；`vite.config.js`：Vue 构建配置。
- `dist/`：自动生成的前端产物，不提交 Git。Markdown 仍经 DOMPurify 清理，其余内容使用 Vue 模板自动转义。
- `workspace/`：实际代码目录。附带本机验证生成的计数器时可继续修改；生成文件不提交。
- `.data/session.json`：兼容保留的默认 demo 会话；其他会话在 `.data/sessions/<hash>/` 保存，文件在 `workspaces/<hash>/`。
- `.data/deepseek/<hash>/`：DeepSeek 版 Web 状态和 Harness JSONL 日志；代码在 `workspaces-deepseek/<hash>/`。
- `tests/`：路径越界、符号链接、二进制恢复、撤销冲突、命令退出和停止测试。

仅面向本机可信开发，服务绑定 `127.0.0.1`。Pi 文件工具经路径校验限制在各会话工作区，**Pi 的 bash 工具仍以当前 macOS 用户权限执行，不是操作系统沙箱**；不要将服务直接暴露到公网。预览使用独立端口、CSP 和 iframe sandbox，与控制台分离；支持 JS 和预览源的 localStorage，不支持网络 API 请求、嵌套页面和弹窗等能力。

一轮最长 5 分钟；Pi 的 bash 可按工具参数设置命令超时，子进程环境不继承 API Key。后台进程在启动命令结束后可继续运行，需自行记录 PID 并停止；“停止执行”只终止当前正在运行的命令，不会清理先前启动的后台服务。快照忽略 `.git`、`node_modules`，单文件限制 10 MB、总量 50 MB，撤销只恢复受快照管理的文件，不撤销系统操作、网络副作用、依赖安装或外部目录修改。发现轮次完成后的手工文件修改时拒绝撤销。突然终止服务会将未完成轮次标为中断，不自动回滚中断时的文件。Pi Coding Agent 管理模型上下文及自动压缩；清空对话会保留工作区文件。

## 验证

```bash
npm test
```

本机已用真实 DeepSeek 调用验证 Pi Coding Agent 的回复和工具调用；测试还覆盖文件工具路径校验、命令停止与后台进程存活。模型输出的“测试通过”仅代表它所运行的命令，不能替代浏览器交互测试。

DeepSeek Harness 版已用真实模型验证连续 Bash 调用、创建 `index.html`、HTTP 预览、服务重启后的文本上下文接续和再次修改文件；`npm test` 同时检查第二套后端的状态、事件、模型切换和重启行为。

Vue 迁移验证：生产构建、后端 5 项测试、开发模式加载；独立测试工作区验证真实聊天生成、预览、diff、撤销，现有工作区文件和会话保留。

接口测试覆盖参数校验、并发会话隔离、模型切换、停止/撤销/清空隔离、持久化、SSE、预览和无 Token HTTP 调用。
