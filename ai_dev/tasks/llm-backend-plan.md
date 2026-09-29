> 本文件保留上一版 runId 协议的计划/验证历史；当前 session 协议见 docs/LLM_HTTP_API.md、docs/SESSION_API_VERIFICATION.md 和 tasks/session-api-plan.md。

# 大模型后端独立化开发计划

工作分支：codex/llm-backend。执行方式：TDD，一次一个行为切片，先记录失败结果再实现。主工作区与运行实例不修改。

## 测试 seam（用户已确认）

1. 后端 POST /chat、POST /stop 与可恢复的流式事件。
2. 自定义 Tool 的 tool_call/tool_result 往返，含停止、失败与重复结果。
3. ai_dev 公开 HTTP/SSE 的需求澄清、自动开发、后端绑定及旧数据迁移。
4. 实际工作区文件、预览与浏览器交互。

仅替代外部模型 HTTP。使用独立 MySQL 和真实临时 Git 仓库，不通过内部函数或查库断言。

## 纵向切片

- [x] 1. chat 提交与流式结果：后端独立接收提示词、工作区和消息。
- [x] 2. 后端持久化：重复执行、断线重放、重启后的会话续聊和任务终态。
- [x] 3. 自定义 Skill / Tool：按轮注入、执行限制、外部工具等待与结果反馈、stop。
- [x] 4. 业务归属：ai_dev 组织提示词/业务工具，完整澄清成功后才自动开发。
- [x] 5. 工作区与预览归 ai_dev，不依赖后端额外入口。
- [x] 6. 多后端绑定：新会话选择新后端，旧会话保留原绑定。
- [x] 7. 旧上下文一次性导入，保留原数据并通过公开行为验证。
- [x] 8. 回归、浏览器、配置与文档/ADR更新；记录实际检查和限制。

## 保持的规则

首版同机，两个 Bun 进程；共享 MySQL 实例、独立表和配置；后端不解释需求阶段或写业务表；不实现 MCP。新旧数据迁移不删除历史；不迁移第三方后端原生上下文。

## TDD 记录

- chat：RED 缺少标准模块；GREEN 经真实 Pi 和模拟模型 HTTP 写出工作区文件。
- 持久化：RED resume 返回 500；GREEN 重启后事件原样重放、原生上下文续聊。
- Skill/Tool：RED 没有 tool_call；GREEN Skill 注入后工具往返并继续写文件。
- stop：RED 404；GREEN 等待中的调用停止，迟到结果 409。
- 权限：RED 同名 write 覆盖返回 200；GREEN 明确 400，越权写入不会发生。
- 业务/工作区：RED 新后端无旧 workspaces 接口；GREEN ai_dev 拥有工作区和业务工具，原澄清回归通过。
- 绑定：RED 新旧会话无 backendId；GREEN 更换默认后端后各自仍路由至正确后端。
- 崩溃等待：RED 重启补交结果 409；GREEN 原 toolCallId 恢复，完成原执行。
- 迁移：RED 缺少导入脚本；GREEN 重复导入保留历史和后续新消息；额外 RED 未迁移仍允许续聊，GREEN 返回迁移提示。
- 页面：RED 没有后端选择控件；GREEN Chrome 创建新会话使用候选后端，显示当前绑定。
- 复核修复：RED 立即 stop 404、断线停止后永久 running；GREEN 两条端到端停止用例通过。
- 错误处理：RED 错误后端地址永久 running；GREEN 可见 HTTP 404 error。
- 外部工具错误：RED isError 显示 done；GREEN 工具显示 error，重复同结果幂等、冲突 409。
- 独立复核：修复派发事务窗口、已接受任务 404 重放、完成运行时未释放、恢复 stop 竞态。

## 最终验证

25 项标准测试、1 项 Chrome smoke、前端构建和差异检查通过。详见 [验证记录](../docs/LLM_BACKEND_VERIFICATION.md) 与 [接入协议](../docs/LLM_HTTP_API.md)。没有执行主库迁移或合并主工作区。
