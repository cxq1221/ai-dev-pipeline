> 原始实现计划。当前独立后端改造见 [开发计划](llm-backend-plan.md)。

# ai_dev 首期实现计划

日期：2026-09-29 · 状态：首期核心实现已完成；具体证据与取舍见 [验证记录](../docs/VERIFICATION.md)

依据：[工程设计](../docs/ENGINEERING_DESIGN.md)、[双服务决策](../docs/adr/0002-gateway-executor-session-sync.md)。执行清单见 [todo.md](todo.md)。下文保留原计划与验收要求，实现结果以验证记录为准。

## 目标与边界

交付一条真实可用的链路：创建需求 → 独立需求分支与持久工作区 → Pi 对话开发 → 查看代码、差异和 Web 预览 → 继续会话。

- Vue + Bun + MySQL；一个工程、两个 Bun 服务，首期均在本地 Mac。
- 网关管理业务与持久化；开发机执行服务承载完整 Pi 模型与工具循环。
- 复制 pi-web-demo 的 Pi 版本并适配，保留原工程；先锁定现有 Pi 0.87.1，不同时升级 SDK。
- 一个需求共享工作区，多会话独立上下文并允许同时修改；正常消息增量下发。
- 不做附件、其他业务模块、权限页面、远程机器调度、移动设备预览、整目录撤销或自动推送发布。

## 阶段与完成标志

| 阶段 | 任务 | 可演示结果 | 进入下一阶段的条件 |
|---|---|---|---|
| P0 运行可行性 | T01–T02 | Bun 实际驱动 Pi 读写文件、执行命令、流式返回与停止 | 真实模型冒烟通过；不能以模拟响应替代 |
| P1 创建需求 | T03–T05 | 在需求池创建需求，形成数据库记录、需求分支与工作区 | UI、数据库和 Git 三者对应一致 |
| P2 对话开发 | T06–T08 | 创建会话，通过两个服务让 Pi 修改需求代码，保存结果 | 浏览器到真实执行闭环通过 |
| P3 说明与预览 | T09–T11 | 更新共享需求说明，查看累计差异与 Web 页面 | 多会话共享代码、独立上下文可验证 |
| P4 恢复与交付 | T12–T14 | 刷新、断开与服务重启后状态清晰；一条命令启动 | 集成、浏览器及真实模型检查全部完成 |

依赖主线：T01 → T02 → T03 → T04 → T05 → T06 → T07 → T08 → T09/T10 → T11 → T12 → T13 → T14。每阶段结束演示并记录检查结果；不把跨阶段大批修改积到最后才验证。

## 任务说明

以下路径均相对 ai_dev；每项控制在约 2–5 个主要文件，必要时拆为更小提交。验证命令为实施后应提供的命令，不代表目前已经存在或执行通过。

### T01：建立最小 Bun 工程与环境检查

- 工作：创建独立依赖清单和锁文件、配置模板与忽略规则；检查 Bun、Git、MySQL 及模型配置是否可用，不输出凭据。
- 验收：只引入 Pi 路径所需依赖；配置检查明确指出缺项；原 Demo 不变。
- 验证：`bun install`、`bun run check:env`；记录 Bun/MySQL 实际版本。
- 依赖：无。规模：M。
- 文件：package.json、bun.lock、.env.example、.gitignore、scripts/check-env.mjs。

### T02：验证 Pi 在 Bun 下的真实执行

- 工作：复制 Pi 和模型适配，使用临时测试仓库验证 SDK，不先开发完整页面。
- 验收：真实模型可读写文件及执行无害 Shell；流式事件可消费；停止后能继续新一轮。
- 验证：`bun run smoke:pi`；检查磁盘文件与工具输出，记录失败点；无模型配置时报告未验证，不算通过。
- 依赖：T01。规模：M。
- 文件：backend/executor/pi-agent.mjs、models.mjs、backend/redact.mjs、scripts/smoke-pi.mjs、docs/VERIFICATION.md。

**检查点 P0：** Bun 兼容性通过后再继续。失败先做最小兼容修复，不擅自改回 Node 或更换 Agent。

### T03：建立双服务与 MySQL 基础

- 工作：创建两个回环地址监听的 Bun 入口及三张业务表迁移；仅网关建立数据库连接。
- 验收：两服务独立启动并返回健康状态；迁移可重复运行；数据库或执行服务不可用时可明确诊断。
- 验证：`bun run db:migrate` 执行两次；`bun test tests/foundation.test.mjs`，使用独立测试数据库。
- 依赖：T02。规模：M。
- 文件：server.mjs、executor.mjs、backend/gateway/db.mjs、migrations/001_initial.sql、scripts/migrate.mjs。

### T04：打通创建需求与工作区

- 工作：实现需求创建/查询 API；执行服务从已有 Git 仓库的已提交基线创建 worktree 与需求分支。
- 验收：持久保存需求与工作区映射；原仓库未提交内容不复制、不覆盖；创建失败不返回虚假成功，重试不覆盖已有目录。
- 验证：`bun test tests/requirements.test.mjs`，临时仓库覆盖成功、无效仓库和重复请求场景。
- 依赖：T03。规模：M。
- 文件：backend/gateway/requirements.mjs、http.mjs、executor-client.mjs、backend/executor/http.mjs、workspace.mjs。

### T05：交付统一需求池页面

- 工作：迁移 Vue/Vite 基础，新增需求池、创建表单及详情路由。
- 验收：创建并进入需求；搜索和刷新保留真实数据；不存在需求显示错误，不回落为看似成功的列表。
- 验证：`bun run build`；浏览器创建、搜索、刷新、直接打开详情 URL。
- 依赖：T04。规模：M。
- 文件：vite.config.js、frontend/index.html、frontend/src/App.vue、pages/RequirementsPage.vue、pages/DevelopmentPage.vue。

**检查点 P1：** 用测试仓库在浏览器创建一项需求，核对数据库路径、实际目录及分支。

### T06：建立独立会话和增量执行契约

- 工作：实现会话 CRUD、执行轮次记录和执行服务会话缓存；定义初始化、chat、state、stop、事件和检查点格式。
- 验收：会话 ID 与工作区 ID 解耦；发送前保存用户消息；重复轮次 ID 不重复启动，相同会话忙时拒绝新执行，不锁整个需求。
- 验证：`bun test tests/execution-contract.test.mjs`；检查第二轮请求不携带历史全文。
- 依赖：T05。规模：M。
- 文件：backend/gateway/conversations.mjs、executor-client.mjs、backend/executor/sessions.mjs、session.mjs、http.mjs。

### T07：接通真实 Pi 与结果持久化

- 工作：连接 T06 契约和 Pi，处理流式事件、终态及原生上下文检查点，适配前端展示 blocks。
- 验收：Pi 实际修改指定需求代码；回复、工具结果和终态保存到 MySQL；只有执行服务调用模型，网关不执行代码工具。
- 验证：`bun test tests/execution.test.mjs`；`bun run smoke:flow` 真实模型生成一个简单 Web 页面并读回文件。
- 依赖：T06。规模：M。
- 文件：backend/executor/session.mjs、pi-agent.mjs、backend/gateway/conversations.mjs、executor-client.mjs、scripts/smoke-flow.mjs。

### T08：迁移 Pi 对话交互

- 工作：按组件逐项迁移聊天展示、输入区、工具卡片与 useSession，接入会话列表及网关 SSE。
- 验收：发送、停止、继续、新建/切换会话可用；无固定 appID 限制；不出现 Harness、撤销或清空历史入口。
- 验证：`bun run build`；浏览器执行一轮真实代码修改并观察工具状态，停止后继续。
- 依赖：T07。规模：M；组件超过 5 个时分两批迁移，不重写原有渲染器。
- 文件：frontend/src/pages/DevelopmentPage.vue、composables/useSession.js、components/ChatTurn.vue、ChatComposer.vue 及其必要工具卡片。

**检查点 P2：** 从页面发消息，经网关、Pi 到真实文件，再回到页面与数据库，完整演示一次。

### T09：保存共享的澄清后需求

- 工作：为 Pi 提供需求说明更新工具，经内部请求调用网关；页面显示可收起的原始需求和澄清后说明。
- 验收：工具保存得到确认后才显示成功；其他会话查看同一最新说明；后续输入带入必要的说明变化，不拼接其他会话全文。
- 验证：`bun test tests/requirement-spec.test.mjs`；两个会话验证说明共享。
- 依赖：T08。规模：M。
- 文件：backend/executor/pi-agent.mjs、backend/gateway/requirements.mjs、http.mjs、executor-client.mjs、frontend/src/pages/DevelopmentPage.vue。

### T10：接入文件、累计差异与静态 Web 预览

- 工作：迁移 WorkspacePanel，执行服务提供文件与 Git 差异，独立预览端口展示需求目录中的 Web 文件。
- 验收：已提交、未提交及新增文件变化均可发现；预览和代码属于同一需求；无入口时显示无预览，不假装支持任意应用开发服务器。
- 验证：`bun test tests/workspace-view.test.mjs`；浏览器检查 iframe、新页面、中文文件名和路径越界拒绝。
- 依赖：T08。规模：M。
- 文件：backend/executor/workspace.mjs、http.mjs、backend/gateway/http.mjs、executor-client.mjs、frontend/src/components/WorkspacePanel.vue。

### T11：验证共享代码与并发会话

- 工作：去除按会话复制代码、整目录快照恢复等假设；调整提交提示，保留文件编辑匹配检查。
- 验收：不同会话可并行修改同一需求目录，上下文互不混入；差异标注为需求累计改动；无自动 push、合并或发布流程。
- 验证：`bun test tests/shared-workspace.test.mjs`；双会话分别修改不同文件，再测试同文件过期编辑提示。记录 Shell 并发仍可能冲突的限制。
- 依赖：T09、T10。规模：M。
- 文件：backend/executor/pi-agent.mjs、sessions.mjs、workspace.mjs、tests/shared-workspace.test.mjs。

**检查点 P3：** 双会话开发并共享预览，说明更新、代码差异均对应实际文件，不声称消除了所有并发冲突。

### T12：实现会话恢复与中断处理

- 工作：从 MySQL 检查点恢复 Pi；网关重连先查询存活执行，再决定状态；不自动重放中断工具。
- 验收：浏览器关闭不取消执行；网关单独重启不误判正在执行的任务；执行服务重启后保留历史并标记中断，用户可继续。
- 验证：`bun test tests/recovery.test.mjs`；分别重启浏览器、网关、执行服务，核对工具调用次数及文件内容。
- 依赖：T11。规模：M。
- 文件：backend/gateway/conversations.mjs、executor-client.mjs、backend/executor/sessions.mjs、session.mjs、tests/recovery.test.mjs。

### T13：统一启动与本地安全检查

- 工作：提供 dev/build/start/test 命令、双进程启动与退出、简明 README；检查预览和 API 的本地访问边界。
- 验收：一条命令启动两个 Bun 服务，退出不遗留监听进程；模型和数据库凭据不进入前端或日志；跨站请求不能任意触发本机执行，预览不读取工作区外文件。
- 验证：`bun run build`、`bun run start`；端口及 Origin/Host、路径越界测试，检查产物与日志脱敏。
- 依赖：T12。规模：M。
- 文件：scripts/dev.mjs、package.json、backend/gateway/http.mjs、backend/executor/http.mjs、README.md。

### T14：完成首期回归与交付记录

- 工作：从全新测试数据库、临时 Git 仓库执行核心流程，记录自动化与真实模型/浏览器验证结果。
- 验收：全部本期流程有通过证据；未接入能力明确列出；原 pi-web-demo 与用户现有工作目录未被修改。
- 验证：`bun test`、`bun run build`、`bun run smoke:flow`；人工浏览器按下节清单复验。测试替身仅用于确定性测试，不替代真实模型闭环。
- 依赖：T13。规模：M。
- 文件：tests/end-to-end.test.mjs、scripts/smoke-flow.mjs、docs/VERIFICATION.md、README.md。

## 最终交付检查

- 从需求池创建需求，进入正确详情；刷新后数据不丢失。
- Pi 真正读写需求目录、执行工具，流式回复与停止可用。
- 两会话共享代码、独立上下文；澄清后说明持久保存。
- 文件、累计差异、Web 预览匹配真实代码。
- 正常输入增量下发；重启恢复不重复执行已发生的副作用。
- 可按 README 从干净配置启动；未验证项不标为完成。

## 风险与处理

| 风险 | 处理方式 |
|---|---|
| Pi 或依赖在 Bun 下存在兼容问题 | T02 最先验证；只修复必要差异，不默默回退 Node |
| 缺少 MySQL / 模型访问配置 | T01 明确记录；实施时索取缺失配置，不写入文档或 Git |
| 上下文恢复只恢复了展示文本 | 保存并验证 Pi 原生消息结构，含工具结果；单测不只检查界面文本 |
| 多会话覆盖或提交混入其他会话修改 | 不做整目录撤销；累计差异不归因单会话；明确共享分支事实 |
| 网关重启丢失最后一段执行事件 | 重连查询执行状态和最新检查点；未持久化内容如实标记，不承诺零丢失 |
| 搬迁 Demo 导致范围扩张 | 排除另一引擎、示例项目和非本期模块；不同时进行语言或 SDK 大升级 |

## 协作安排与开工条件

按职责可由三人覆盖：A 负责网关/MySQL，B 负责 Pi/工作区，C 负责 Vue/浏览器验证。先共同完成 P0 和执行契约；随后按已确定契约协作，避免同时改写同一入口文件。以上是责任边界，不要求新增三套服务，也不代表本次已经启动并行实施。

产品决策无新增阻塞项。开工先执行 T01 检查本机依赖与配置；真实模型或数据库不可用时记录具体缺项。计划经用户确认后开始实现，按阶段检查点交付，不一次性迁入整个 Demo。
