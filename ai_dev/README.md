# ai_dev · 本地需求开发工作台

Vue + Bun + MySQL + Pi Coding Agent。一个工程、两个 Bun 服务：网关保存需求与会话，执行服务在本机读写代码并调用模型。首期只实现需求会话与 AI 代码开发。

## 启动

已验证环境：macOS、Bun 1.4.2、MySQL 9.6.0、Pi 0.87.1。其他 MySQL/Bun 版本尚未验证。

1. 安装 Bun，准备可访问的 MySQL，并创建空数据库 `ai_dev`。
2. 根据 [.env.example](.env.example) 在本目录配置 `.env`：数据库连接和 DeepSeek API Key。不要提交真实配置。
3. 在本目录执行：

```sh
bun install
bun run check:env
bun run db:migrate
bun run dev
```

没有全局 Bun 时，可用 `npm exec --yes --package=bun@1.4.2 -- bun run dev` 启动；应用进程仍是 Bun。依赖安装、迁移命令可用同样前缀运行。

访问 `http://127.0.0.1:4417`。网关默认 4417，执行服务 4418，隔离预览 4419。`dev` 提供 Vite 开发模式；交付模式执行 `bun run build` 后 `bun run start`。Ctrl+C 关闭两个应用服务，不停止外部 MySQL。

网关不持有模型凭据，执行服务不持有数据库连接配置；启动器分别传递环境变量。数据库必须预先存在，迁移只创建本工程三张表，不删除或重置数据。

## 使用

### 可选：本地 Docker MySQL

本项目提供独立的 MySQL 8.4 容器，不复用其他项目数据库：

```sh
bun scripts/setup-mysql.mjs
docker compose --env-file .env.mysql -f compose.mysql.yaml up -d --wait
bun --env-file=.env.mysql scripts/migrate.mjs
```

地址 `127.0.0.1:33318`，数据库和普通用户均为 `ai_dev`。随机密码与连接地址保存在权限为 `600` 的 `.env.mysql`，已忽略 Git；初始化脚本不会覆盖已有凭据或应用 `.env`。不要运行会输出展开密码的 `docker compose config`，也不要分享容器初始化日志（含随机 root 密码）。

数据保存在命名卷 `ai-dev-db_mysql-data`，容器重建不会清空。停止使用 `docker compose --env-file .env.mysql -f compose.mysql.yaml stop`；不要使用 `down -v`，它会删除数据库卷。容器以 `unless-stopped` 自动重启，仍需 Docker Desktop 运行。

连接地址使用 `sslmode=require`，启用 TLS 以兼容 MySQL 8.4 的密码认证；这里使用本地容器自签证书，不代表生产环境的证书身份校验。

以上只创建新库，不迁移旧库或自动切换应用。切换时可将 `.env.mysql` 中的 `DATABASE_URL` 配入应用环境，或启动 Bun 时额外加载该文件；模型凭据仍由原配置提供。

### 开发流程

1. 在统一需求池提出需求，填写标题、原始需求和本地已有 Git 仓库的绝对路径。
2. 系统从仓库当前 **已提交** 代码建立 `codex/req-…` 分支和独立 worktree；不复制原目录未提交改动。
3. 进入需求开发，新建会话。Pi 可读取、编辑文件、执行 Shell、按需提交 Git，并通过 `update_requirement` 工具保存澄清后的需求。
4. 右侧查看文件、相对初始提交的累计差异以及静态 `index.html` 预览，可收起后再次展开、新窗口查看。
5. 同一需求可以有多个会话，共享代码与说明，但各自保留对话历史。同一会话只执行一轮，不同会话允许同时执行。

不会自动合并主干、推送或发布。没有整目录撤销、清空历史、附件上传、版本/制品/系统测试/设备管理页面。

## 恢复与限制

- 正常消息只向执行服务下发新消息；需求说明变化时附带最新说明。执行实例丢失时从 MySQL 的 Pi 原生检查点恢复，不每次下发全部历史。
- 首期在轮次结束保存可恢复的完整 Pi 检查点；过程中保存可展示的回复和工具状态。进程突然退出可能丢失未保存内容，中断轮次不会自动重放，应先检查现有代码再继续。
- 网关重启不取消独立执行服务上的任务；执行服务暂时不可达时不武断标记任务失败，恢复连接后查询真实状态。
- 文件写入工具会阻止未经读取或读取后发生变化的整文件覆盖。共享分支上的 Shell/Git 操作仍可能冲突；不宣称多会话具有事务隔离。
- 预览仅支持静态 Web 文件，不代理任意开发服务器，不提供 Android/iOS 或远程桌面画面；缺少 `index.html` 会显示无预览。
- 本地回环监听、来源检查、预览隔离并不构成操作系统沙箱。Pi 的 Shell 具有启动用户的本机权限，只用于可信需求和仓库；不得直接暴露公网。
- 测试接口验证了路径越界与符号链接限制，但本期不提供多用户权限或多租户安全隔离。

## 测试

使用专门的空测试数据库，设置 `TEST_DATABASE_URL`。测试会新增需求记录及临时 Git 仓库，不重置现有数据库，不要指向业务数据库。

```sh
TEST_DATABASE_URL='mysql://user:password@127.0.0.1:3306/ai_dev_test' bun test
bun run build
bun run smoke:ui
bun run smoke:pi
bun run smoke:flow
```

后三个命令按需使用同一测试数据库配置。`smoke:pi`、`smoke:flow` 必须有真实模型凭据，会产生模型调用费用；缺少凭据会失败，不作为跳过后通过。`smoke:ui` 使用 macOS 已安装 Chrome（可通过 `CHROME_PATH` 指定可执行文件）。普通测试仅在模型 HTTP 边界提供确定性响应，Pi、网关、MySQL 和 Git 都真实执行。

测试边界为网关 API/SSE、执行服务接口、文件/预览接口和浏览器用户操作；不依赖私有方法，不直接查询数据库断言业务行为。详见 [验证记录](docs/VERIFICATION.md)、[实现清单](tasks/todo.md)、[工程设计](docs/ENGINEERING_DESIGN.md)。

## 目录与迁移来源

- `server.mjs` / `backend/gateway/`：需求、会话、MySQL、浏览器 API/SSE。
- `executor.mjs` / `backend/executor/`：Pi 会话、工作区、工具、预览。
- `frontend/`：需求池与开发工作台。
- `migrations/`：可重复执行的建表 SQL。
- `.data/`、`workspaces/`：本地运行数据，不提交 Git。

Pi 适配和聊天/工作区组件由 `research/pi-web-demo` 复制后适配；保留原 Demo，未迁入 DeepSeek Harness 后端。`dev`/`start` 只管理两套服务，没有引入消息队列或机器调度。

## Skill 支持

默认共享目录为 `ai_dev/skills`，可通过执行服务环境变量 `SKILLS_DIR` 指定其他目录。仅加载该目录中的 `SKILL.md`，不自动加载用户全局 Skills，不跟随目录内的符号链接。

- 每个 Skill 使用独立子目录，`SKILL.md` 包含 `name`、`description` YAML frontmatter；参考文件、脚本、模板可放入 `references/`、`scripts/`、`assets/`。
- 输入框中的 **Skill** 支持手动多选（最多 10 个）；未选择时，Pi 根据系统提示中的名称和描述自行匹配并读取全文。
- `disable-model-invocation: true` 的 Skill 不加入自动匹配目录，可手动选择；这不是文件访问权限限制。预置 `skill-maintenance` 用于改进共享 Skill。
- Agent 可以读写共享 Skill 目录，整体覆盖已有文件需先读取；精确编辑使用原文匹配。这里是跨需求共享目录，优化会影响其他需求，不应存放密钥、隐私资料或需求专属业务数据。
- 每轮执行前重新加载 Skill；新建、修改或删除后，现有会话下一轮生效，正在执行的轮次不受实时替换。手动选择列表可点击刷新。
- 手动使用的名称记录在用户消息中；自动读取通过工具记录查看。只列出目录不代表本轮已使用该 Skill。
- 文件工具限制在需求工作区和指定 Skill 目录；Bash 不是操作系统沙箱，Skill 不是权限机制。首期没有自动备份或版本回滚，重要 Skill 建议纳入 Git。
