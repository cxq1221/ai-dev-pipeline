# Pi 网页编码 Demo

基于 [earendil-works/pi](https://github.com/earendil-works/pi) 的 `@earendil-works/pi-agent-core` 和 `@earendil-works/pi-ai` 0.87.1。真实 Agent 循环负责调用工具、消费结果并继续回答，Express 将事件流发送给网页。不是预设回复，也不依赖终端 Pi CLI。

## 启动前准备

需要 Node.js 22.12+ 和 npm。在 `pi-web-demo/` 目录执行：

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
- 列出文件、读取、创建、精确替换文件内容，执行 shell 命令和验证。
- 展示工具执行过程、输出、成功/失败、每轮耗时；可停止当前执行并继续需求。
- 真实文件快照产生每轮 diff、增加/删除行数；支持撤销最近一轮的文件修改，同时恢复该轮之前的模型上下文。历史卡片保留并标明已撤销。
- 查看工作区文件和源码；自动显示 `index.html` 静态网页，支持手动刷新、独立窗口。
- 清空对话保留文件。没有上传、多会话列表 UI、账户系统、Git 提交、部署或后台构建服务器管理。

可直接输入：“做一个待办清单，支持新增、完成和删除”；继续输入：“增加未完成筛选，调整按钮颜色”。也可直接把要开发的现有小型项目复制到 `workspace/`，然后让 Agent 查看代码。

## 文件与边界

- `server.mjs`：HTTP 启动、网页托管、允许的浏览器来源和预览服务。
- `backend/http.mjs`：HTTP/SSE 接口及会话预览路由。
- `backend/sessions.mjs`：参数校验、会话实例和目录隔离。
- `backend/session.mjs`：Pi Agent 上下文、执行、停止、撤销及持久化。
- `backend/models.mjs`：支持的模型及服务端 Key 来源。
- `backend/tools.mjs`：各会话绑定的文件和命令工具。
- `API.md`：前端/客户端直接调用的 API 契约。
- `workspace.mjs`：文件范围校验、快照、diff、撤销及命令执行。
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
- `tests/`：路径越界、符号链接、二进制恢复、撤销冲突、命令退出和停止测试。

仅面向本机可信开发，服务绑定 `127.0.0.1`。文件工具限制在 `workspace/`，**shell 仍以当前 macOS 用户权限执行，不是操作系统沙箱**；不要将服务直接暴露到公网。预览使用独立端口、CSP 和 iframe sandbox，与控制台分离；支持 JS 和预览源的 localStorage，不支持网络 API 请求、嵌套页面和弹窗等能力。

命令最长 60 秒，一轮最长 5 分钟；命令环境不继承 API Key。快照忽略 `.git`、`node_modules`，单文件限制 10 MB、总量 50 MB，撤销只恢复受快照管理的文件，不撤销系统操作、网络副作用、依赖安装或外部目录修改。发现轮次完成后的手工文件修改时拒绝撤销。突然终止服务会将未完成轮次标为中断，不自动回滚中断时的文件。会话没有上下文压缩，长时间使用可清空对话。

## 验证

```bash
npm test
```

本机已用真实 DeepSeek 调用验证创建 HTML/JS、执行 `node --check`、第二轮读取并修改标题和颜色；浏览器中验证计数按钮、预览、撤销和刷新恢复。模型输出的“测试通过”仅代表它所运行的命令，不能替代浏览器交互测试。

Vue 迁移验证：生产构建、后端 5 项测试、开发模式加载；独立测试工作区验证真实聊天生成、预览、diff、撤销，现有工作区文件和会话保留。

接口参数改造验证：13 项测试覆盖参数校验、并发会话隔离、模型切换、停止/撤销/清空隔离、持久化、SSE、预览和无 Token HTTP 调用。
