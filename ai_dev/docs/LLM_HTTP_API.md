# 大模型后端 HTTP 协议 v2：串行 Session

本项目参考 OpenAI Agents API 的会话入口设计，不宣称与其 API 完全兼容。Agent、模型调用、内置工具、原生上下文全部在 LLM 后端。ai_dev 只依赖 `POST /chat`、`POST /stop`、`GET /sessions/:sessionId`。`GET /health` 为可选运维接口。首版同机、回环 HTTP、可信应用，不实现 MCP、steering 或自动排队。

## 发送消息

```json
{
  "action": "send",
  "sessionId": "conversation-1",
  "workspacePath": "/absolute/workspace",
  "message": "完成本轮任务",
  "systemPrompt": "应用提供的行为规则和业务资料",
  "allowedTools": ["read", "list_files", "save_result"],
  "skills": [{"name": "interview", "content": "本轮使用的 Skill 全文"}],
  "tools": [{
    "name": "save_result",
    "description": "保存应用结果",
    "parameters": {"type": "object", "properties": {"content": {"type": "string"}}, "required": ["content"]}
  }]
}
```

`action` 省略等同 send。不传 runId。sessionId 为 1–100 位字母、数字、短横线，由 ai_dev 提供。首次发送隐式创建会话，必须传本机绝对 workspacePath，后续可省略且不能变更。正文 1–20000 字。

systemPrompt、allowedTools、tools、skills 均为本轮配置，不继承上一轮的配置。省略时使用通用提示词、空工具白名单和空 Skill；历史上下文中的旧消息仍保留。model 为当前实现的可选扩展，省略使用后端默认模型。

同一 session 同时只能执行一轮；运行、等待外部工具、停止中均为忙，发送新消息返回 409。不同 session 可以并行。一个 session 必须只有一个应用调度者、绑定一个后端进程；本版不支持多个进程共同接管同一 session 或负载均衡。

后端持久化接收后返回 SSE，断开连接不取消执行。调用方不能自动重发不确定是否已接受的消息：sessionId 不提供消息幂等性。

## Tool 与 Skill

allowedTools 是权限白名单。当前内置 read/write/edit/bash/list_files。tools 是调用方执行的业务函数定义，包含 name、description 和 object 类型 parameters；不传函数代码，不能覆盖内置名称。skills 是 `{name,content}` 数组，正文作为指令注入，不增加权限。

skillsRoot 为可选同机资源扩展：当前后端可发现其中的 SKILL.md，并允许文件工具访问其资源；它不是所有第三方后端都必须支持的核心字段。不传此字段时仍可使用 skills 正文。模板/脚本不通过 HTTP 自动上传。

## 输出及状态

```text
data: {"type":"snapshot","turn":{"id":"backend-generated-id","prompt":"完成本轮任务","status":"running","blocks":[{"type":"text","text":"正在读取"}]}}

data: {"type":"tool_call","toolCallId":"unique-call-id","name":"save_result","args":{"content":"结论"}}

data: {"type":"done","turn":{"id":"backend-generated-id","prompt":"完成本轮任务","status":"done","blocks":[{"type":"text","text":"已完成"}],"finishedAt":1790000000000}}
```

还可收到工具结果确认事件 tool_result。snapshot 是当前轮累计快照，不是 token 增量。没有 eventId、after、resume、follow 或 X-Run-Status 重放语义。正常关闭前发送 done；失败、停止也以 done 结束，区别在 turn.status。

turn/current 字段：

| 字段 | 含义 |
|---|---|
| id | 后端生成的本轮结果标识，轮内稳定、轮间不同；仅用于辨认查询结果，无需放入请求 |
| prompt | 本轮用户输入，可包含所选 Skill 名称前缀 |
| blocks | 文本 `{type:"text",text}` 或工具 `{type:"tool",id,name,args,status,output}` |
| status | running/done/error/stopped/interrupted |
| error | 可选错误说明 |
| startedAt / finishedAt | 毫秒时间戳；结束时间在完成后提供 |
| sourceRef | 可选 Git commit/branch/dirty 证据 |

当前工具展示块 id 沿用模型内部 ID，仅作本轮展示；外部执行与回传必须用 tool_call/requiredActions 的 toolCallId。

## 查询会话

`GET /sessions/conversation-1`：

```json
{
  "sessionId": "conversation-1",
  "state": "waiting_tool",
  "current": {
    "id": "backend-generated-id",
    "prompt": "完成本轮任务",
    "status": "running",
    "blocks": [],
    "startedAt": 1790000000000
  },
  "requiredActions": [{"toolCallId":"unique-call-id","name":"save_result","args":{"content":"结论"}}]
}
```

state 为 idle/running/waiting_tool/stopping。current 是当前或最近一轮，下一轮接受前保持可查询。idle 不代表成功，必须检查 current.status。未知 session 返回 404。仅导入了上下文、尚未执行且无旧执行记录的 session 也返回 404。

断线后查询状态和累计输出；没有事件重放。查询不启动新的执行。ai_dev 实际采用发送后查询快照的适配方式，避免把持久事件流作为第三方后端的必需能力；浏览器仍通过 ai_dev 的 SSE 更新。

## 提交工具结果

```json
{"action":"tool_result","sessionId":"conversation-1","toolCallId":"unique-call-id","result":{"content":[{"type":"text","text":"已保存"}],"isError":false}}
```

返回 `{"accepted":true}`。后端生成会话内唯一的外部 toolCallId，内部映射到模型调用 ID。只接受当前轮等待的调用；已接受的相同结果可在最近一轮结束后重复提交，不同结果返回 409。下一轮开始后旧调用返回 409。停止/中断后的未完成调用拒绝。

ai_dev 保存已执行的业务工具结果，回传重试复用保存值，不重复副作用。工具回传失败时查询 requiredActions；调用仍在则重交相同结果，已经消失则查询下一状态。工具错误以 isError 表示，不等于整个 Agent 轮次失败。

## 停止及重启

`POST /stop`，请求 `{"sessionId":"conversation-1"}`。当前实现等待本轮结束后返回 `{"stopped":true}`；空闲或未知 session 同样返回无须继续停止。停止不回滚已有文件/数据库修改。

ai_dev 在停止结果未核实前不允许下一轮，重连时先查询，只有同一后端结果仍在运行才再次停止；不把旧停止请求重试到新一轮。

后端进程崩溃后，首次查询或操作将未完成轮次持久化为 interrupted，保留上下文和文件，不恢复原调用栈或重放 Shell/外部工具。进程正常关闭会尝试停止正在运行的会话。

网关发送前保存最近结果标识，并持久化“已尝试发送”，随后最多发送一次。响应丢失后：不同结果 ID 表示本轮已接受，查询继续；仍为旧结果或没有记录则显示中断，说明未自动重发，用户检查现场后继续。首次发送是否生效的极端网络歧义不承诺 exactly-once。不可达时持续核实，保留忙状态。

## 存储和升级

后端继续保存 llm_sessions 原生上下文；新增 llm_session_execution 保存当前状态、请求、累计快照和工具调用，不保存新 SSE 事件数组。llm_runs 保留为旧数据，首次访问旧会话时导入最近结果，不删除原记录。旧运行轮次按中断处理。

ai_dev 保留自己的 turns 业务 ID（不传后端），新增 session_delivery 保存是否尝试发送、前一结果标识与当前后端结果标识。旧 backend_executions/backend_delivery 的请求历史保留，event_cursor 不再使用。业务工具仍按内部轮次及外部调用 ID 保存，内部轮次唯一关联 session。

升级时先停止应用、核实正在执行任务，再同时更新 gateway 与 LLM 后端。v1/v2 协议不可混用。原会话绑定不变，原生上下文不搬回 gateway；第三方后端换引擎使用新的 backendId，新会话选择它，旧会话继续使用旧后端。

## 第三方接入示例

下面只依赖 HTTP，不依赖 Pi SDK 或数据库。示例采用查询方式展示累计结果；网络异常后应继续查询，不重发 send。

```js
const base = "http://127.0.0.1:4518";
const sessionId = crypto.randomUUID();
const post = async (route, body) => {
  const response = await fetch(base + route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(await response.text());
  return response;
};
const stream = await post("/chat", {
  sessionId,
  workspacePath: "/absolute/workspace",
  message: "请调用 save_result 保存需求摘要",
  systemPrompt: "理解用户要求，使用提供的工具。",
  allowedTools: ["save_result"],
  tools: [{ name: "save_result", description: "保存需求摘要", parameters: {
    type: "object", properties: { content: { type: "string" } }, required: ["content"],
  } }],
  skills: [{ name: "summary", content: "摘要包括目标、范围、验收标准。" }],
});
await stream.body.cancel(); // 只断开流，不取消 Agent
for (;;) {
  const response = await fetch(`${base}/sessions/${sessionId}`);
  if (!response.ok) throw new Error(await response.text());
  const state = await response.json();
  console.log(state.current);
  for (const call of state.requiredActions) {
    // 应用实现：先按 sessionId + toolCallId 查已保存结果，再执行业务并持久化。
    const result = await executeBusinessToolOnce(sessionId, call);
    await (await post("/chat", {
      action: "tool_result", sessionId, toolCallId: call.toolCallId, result,
    })).json();
  }
  if (state.state === "idle") break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
```

executeBusinessToolOnce 由接入应用提供，不属于 LLM 后端。生产适配器还需持久化发送尝试、处理请求超时及查询错误；本仓库的 gateway/llm-client.mjs 是完整实例。
