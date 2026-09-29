---
status: superseded-in-part
---

# 可替换的大模型后端与业务网关

执行协议部分已由 [ADR-0004](0004-session-centric-backend.md) 取代；下文保留历史决策。

2026-09-29，用户确认首版同机、两个 Bun 进程，共用 MySQL 实例但各自管理数据；新会话可使用新后端，旧会话保留原绑定。外部 Skill 和 Tool 足够，首版不实现 MCP。本决策取代 ADR-0002 的业务执行和检查点归属。

ai_dev 通过 [chat/stop 协议](../LLM_HTTP_API.md) 调用完整执行后端。后端运行 Pi 或其他引擎，提供通用文件/Shell 工具，保存自己的原生上下文、任务及有序可重放事件。ai_dev 不读取或回灌原生 messages，不依赖后端的数据库或 Pi 类型。

业务提示词、grilling、需求状态、自定义工具实现、自动开发任务、工作区 Git 创建与静态预览由 gateway 管理。每轮发送系统提示词、Skill 正文、工具定义和白名单。后端以 tool_call/tool_result 完成外部工具往返。Skill 不改变白名单。

业务工具以执行和调用 ID 幂等保存结果。澄清完成仅存候选；整个执行成功时，gateway 在事务中保存需求、更新阶段、插入唯一自动开发任务。错误或停止不会放行。运行状态与派发请求也同事务写入，避免半条派发记录。

数据归属：gateway 的 requirements/conversations/turns/requirement_clarifications、llm_backends/conversation_backends、backend_executions/backend_delivery/business_tool_results/legacy_context_imports；当前后端的 llm_sessions/llm_runs。两个配置分别为 DATABASE_URL 和 LLM_DATABASE_URL，可指向同一实例/库，部署时可按表授予独立账号权限。第三方后端可以使用其他数据库。

已完成的运行时释放后从持久化事件回放。等待外部结果时进程崩溃，按原调用标识恢复；无法确认完成的本机副作用不自动重跑，转为 interrupted。停止先于提交到达也保留停止标记。已接受执行的重连 404 不降级成重新执行。

旧 Pi 上下文通过显式迁移命令导入当前后端，INSERT IGNORE 保证不覆盖新状态，保留原业务库中的旧字段。跨不同后端不迁移上下文。后端配置不再列出某旧 ID 时，其已持久化地址和旧绑定仍保留；同 ID 只应用于同一后端的地址调整，换引擎必须用新 ID。

仍只提供本机可信应用环境，不提供 OS 沙箱或远程工作区同步。当前已验证两个真实后端进程使用同一实现的路由；跨不同引擎的兼容性留待第二个真实实现接入验证。
