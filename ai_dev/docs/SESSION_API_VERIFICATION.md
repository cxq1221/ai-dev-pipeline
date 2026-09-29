# Session 协议 v2 验证记录

日期：2026-09-29。工作目录：独立 worktree llm-backend/ai_dev_pipeline/ai_dev，分支 codex/llm-backend。本记录在提交前完成验证；未合并主分支。

## 实际通过

- `TEST_DATABASE_URL=…/ai_dev_session_test bun test`：28 tests、178 assertions、19 files 全部通过。
- `bun run smoke:ui`（同一独立测试库）：真实 Chrome 1 test、35 assertions 通过，包含澄清门控、自动开发与刷新。
- `bun run build`：通过。
- `git diff --check`：通过。
- 4517 网关与页面、4518 LLM health、后端列表 HTTP 检查通过；4519 由网关提供静态预览。

## 验证边界

只替代外部模型 HTTP；使用真实 Pi、MySQL、Git、HTTP 和文件系统。响应丢失与挂起通过转发真实后端请求后丢弃/扣留响应注入，不用伪造后端替代业务实现。独立测试库 ai_dev_session_test 与预览库 ai_dev_preview 分开。

覆盖无 runId 发送、同会话忙时拒绝、工具与 Skill 往返、调用 ID 跨轮唯一、重复工具结果、旧结果拒绝、停止、SIGKILL 重启中断、上下文保留、旧执行结果懒迁移、网关重启查询恢复、聊天/工具结果响应丢失、响应挂起后的停止。原澄清权限、自动开发一次、已有会话绑定、共享 Skill 和真实工作区回归通过。

TDD RED/GREEN 证据见 tasks/session-api-plan.md。Spec 与 Standards 审查发现 HTTP 无响应会阻塞停止；先补失败测试，再增加 5 秒有界请求超时，测试通过且 Spec 复核通过。可选的 publish 职责集中建议未扩大为额外重构。

## 实际限制

没有运行付费真实模型 smoke；真实 Agent 运行使用确定性模型 HTTP 响应。两个后端的路由验证使用相同实现，没有验证第三方独立引擎。一个会话只由一个后端进程负责，不支持多副本接管；不承诺消息 exactly-once、事件续传或崩溃后续跑。

4517 预览仍使用原独立预览数据库和工作区，启动前确认该端口无旧服务占用。主 checkout 的服务和数据库没有切换。旧事件数据保留，不删除表；协议 v1/v2 应同时升级两端。
