# Oh My Pi：对 ai_dev 的设计参考

调研日期：2026-09-29。对象为官方仓库 `can1357/oh-my-pi`，核对固定提交 [`fc671eba383f2a7208500836673b485c0dc7073d`](https://github.com/can1357/oh-my-pi/tree/fc671eba383f2a7208500836673b485c0dc7073d)。本次为官方文档与源码静态核查，未安装 OMP、运行其测试或进行模型效果基准测试。

## 结论

**值得借鉴执行协议、恢复状态、工具输出预算和编辑反馈；暂不建议把现有 Pi 直接替换成 OMP。** 当前 ai_dev 已有真实双服务、MySQL、Pi 会话、共享工作区和预览实现，应对已有链路做小步增强，而不是重新搭建另一套 Agent 平台。现状依据：[工程设计](ENGINEERING_DESIGN.md)、[实现计划](../tasks/plan.md)、[执行服务](../backend/executor/session.mjs)、[Pi 适配](../backend/executor/pi-agent.mjs)。这些模式并非都由 OMP 独创；落地时应优先复用当前 Pi 已有的会话与工具能力，避免自行重做。

OMP 是 Pi 的独立分支，不只是给原 Pi 添加几个插件；包名为 `@oh-my-pi/pi-coding-agent`。SDK 要求 Bun ≥ 1.3.14，并引入 Rust/N-API 原生依赖，不能因为都叫 Pi、都支持 Bun 就认为接口和会话数据可直接互换。[官方 SDK](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/docs/sdk.md)、[包定义](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/packages/coding-agent/package.json)、[原生依赖定义](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/packages/natives/package.json)。

## 最值得参考的设计

| 设计 | 官方事实与证据 | 对 ai_dev 的建议 |
|---|---|---|
| SDK 与外部协议分离 | SDK 是 Bun 进程内集成入口；RPC 是跨进程 stdio JSONL，命令响应、进度事件与执行完成分开。[SDK](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/docs/sdk.md)、[RPC](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/docs/rpc.md) | 保留“网关 → 自有 HTTP/SSE 协议 → 本机 Pi SDK”。借鉴命令/事件/结果契约，不把网关塞进模型循环，也不需要首期改成 OMP 子进程。 |
| 接收成功不等于执行完成 | RPC 用请求 `id` 关联结果；`prompt` 的接受响应与后续 `prompt_result` 区分。OMP 的 `agent_end.isTerminal === false` 不能当作最终完成。[RPC 请求关联](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/docs/rpc.md#requestresponse-correlation)、[SDK 事件语义](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/docs/sdk.md#event-subscription-model) | 沿用现有 turn ID，把“已接收、执行中、终态、检查点已保存”分清。OMP 字段仅是设计参考，不能未经核对直接套到当前 Pi 0.87.1。 |
| 会话恢复不是聊天文本恢复 | `SessionManager` 管理带 `id/parentId` 的条目和活动路径；压缩记录、分支摘要是独立条目，用于重建模型上下文。[session-manager.ts](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/packages/coding-agent/src/session/session-manager.ts)、[压缩机制](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/docs/compaction.md) | 给自有 checkpoint 加格式版本与引擎版本；核查当前 Pi 恢复所需的摘要、模型设置等状态。不要直接照搬 OMP JSONL，也不要把恢复上下文理解为恢复磁盘文件。 |
| 工具输出有预算且能追溯 | `OutputMetaBuilder` 描述按行/字节截断、截断方向、artifact ID、完整输出捕获失败；Bash 工具会分配输出 artifact。[output-meta.ts](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/packages/coding-agent/src/tools/output-meta.ts)、[bash.ts](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/packages/coding-agent/src/tools/bash.ts) | 统一 Shell/搜索日志的显示预算，长输出保留可按需读取的完整日志；标清“截断”，不能让模型把摘要当完整结果。前端截断不等于减少模型 Token，预算必须明确作用在哪一层。 |
| 编辑协议携带所见版本 | 当前 hashline 提示要求 `[PATH#TAG]` 的四位十六进制快照标签、原始行号，限制编辑已展示的内容；`patcher.rs` 校验实时文件、已见快照并处理不匹配。[hashline 提示](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/crates/pi-edit/prompts/hashline.md)、[patcher.rs](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/crates/pi-edit/src/modes/hashline/patcher.rs) | 当前 ai_dev 已有读取后 SHA256 检查，优先改善冲突后“重新读取哪部分、如何重试”的反馈，再小范围对比 hashline。它不是数据库事务或多人文件锁，不能解决所有 Shell 并发覆盖。 |
| 明确控制默认能力 | OMP 默认发现扩展、MCP、LSP 等；`toolNames` 本身不是白名单，须 `restrictToolNames: true`。多个顶层会话建议各有私有 `AgentRegistry`。[SDK 默认发现、工具与隔离说明](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/docs/sdk.md) | 当前 Pi 适配已有显式工具与禁用隐式扩展，不应重复建设；把这些变成测试约束。若未来评估 OMP，先关默认发现并测试多会话隔离；共享代码不等于共享 Agent 注册表或对话。 |

### 一个当前就值得优化的点：事件增量与完整快照分开

核对当前安装的 Pi 0.87.1：其 `dist/core/tools/bash.js` 已有输出截断及完整日志临时文件，`read.js` 已支持分页和截断；`dist/core/session-manager.d.ts` 也已有压缩条目与上下文重建接口。因此下述建议是检查这些能力是否贯通到我们的持久化和 UI，不是从零重写截断或压缩。

当前 `backend/executor/session.mjs` 的 `state()` 包含完整 `agent.state.messages` 与 `turn.blocks`，流式更新约每 60ms 调用一次；因此“下发新输入是增量”不代表“回传进度也是增量”。这是当前源码事实，不是 OMP 的性能结论。[当前执行服务](../backend/executor/session.mjs)。

建议回传 `text_delta / tool_update / turn_finished` 等小事件，完整状态仅供首次加载、重连查询和终态保存。OMP 的命令/事件/结果分层提供参考，但它的 stdio RPC 不是现成的可靠 SSE 消息总线；跨网络重连、幂等和数据库持久化仍由我们的网关负责。[官方 RPC](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/docs/rpc.md)。

## 对已有实现计划的增量建议

以下是后续建议，不修改已完成任务状态，也不意味着本次已实现。

| 顺序 | 对应现有任务 | 最小增强 | 验收方式 |
|---|---|---|---|
| 1 | T06/T07/T08 执行与展示 | 进度增量事件与恢复快照分离，保持当前 API 的状态查询能力 | 同一固定输出测试统计传输字节；中途重连后最终文本和工具状态一致，不重复完成 |
| 2 | T07/T12 持久化与恢复 | checkpoint 增加格式/引擎版本；验证长对话压缩后的恢复行为 | 对话含工具调用和压缩后重启；模型可继续，工具不自动重放；不支持的版本明确拒绝或迁移 |
| 3 | T07/T10 工具与文件 | 大输出截断元信息、完整日志按需读取 | 长日志、有末尾错误、超长单行、日志保存失败四种场景；前端不隐藏截断事实 |
| 4 | T11 共享工作区 | 保持现有哈希检查，优化过期编辑反馈；hashline 做可选实验 | 多会话修改同文件时返回明确冲突；固定模型/任务比较成功率、重试次数、实际 Token 和耗时 |

首期不搬 OMP 的完整 TUI、自动多 Agent、记忆系统、LSP/DAP、浏览器/桌面工具栈。这是基于本项目范围的取舍，不是否认这些能力；若后来需要其中一项，应单独做适配实验，而非一次性引入整个分支。

## 限制与未验证事项

- 已核对的是固定提交官方文档与源码，未对 OMP 在本机的安装、原生二进制加载、模型调用、停止/恢复、多会话做运行验证。
- SDK 文档与 coding-agent 包声明 Bun ≥ 1.3.14；仓库根包另有 `packageManager: bun@>=1.4`。嵌入已发布包和从源码开发的要求要分别核对，不能仅据“支持 Bun”推断替换成本。[根 package.json](https://github.com/can1357/oh-my-pi/blob/fc671eba383f2a7208500836673b485c0dc7073d/package.json)。
- 不引用 README 中的特定模型提升/Token 降幅作为本项目收益保证。模型、提示、代码任务及工具实现不同，必须用同一批任务实测。
- 当前 Pi 的 `messages` 检查点能支持既有恢复链路；是否遗漏压缩元数据等状态，要在当前锁定 SDK 上验证，不能因 OMP 的持久化更丰富就断言现有实现已损坏。
- 本次仅新增此调研文档；未替换引擎、修改业务源码或调整现有实现计划。
