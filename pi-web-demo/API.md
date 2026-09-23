# 编码服务 HTTP API

默认地址：`http://127.0.0.1:4317`。无需 SDK，无需 `X-CSRF-Token`。模型 API Key 只由后端配置，客户端不传 Key。

## 公共参数

所有 `/api/*` 接口必填以下三项：GET 使用 query，POST 使用 JSON body。

| 参数 | 类型 | 规则 |
| --- | --- | --- |
| `appID` | string | 恰好 9 个字符，不含空白或控制字符；如 `client001`。纯数字也必须写成字符串。 |
| `session` | string | 1–128 位字母、数字、`_`、`-`；如 UUID 或 `chat-001`。由客户端生成并保存，后续请求复用。 |
| `model` | string | `deepseek-flash` 或 `deepseek-v4-pro`。支持列表和 Key 来源由后端控制。 |

`appID + session` 唯一确定一段对话。更换任意一个会得到独立的上下文、文件目录、撤销记录和事件流。并发初始化同一会话不会创建重复实例。

`model` 不参与会话 ID。提交聊天时用它选择本轮模型，允许同一会话的下一轮更换模型。读取、订阅、停止等操作不会切换模型，状态中的 `model` 表示最近使用的模型。同一会话一次只能执行一轮；不同会话可同时运行。

目前 `appID`、`session` 是路由标识，不是登录认证或访问凭证。本示例面向可信本机客户端，仍绑定 `127.0.0.1`。同源网页直接调用；其他浏览器来源需在后台 `ALLOWED_ORIGINS` 中配置（逗号分隔）。不发送 `Origin` 的原生客户端无需此配置。

## 接口

| 方法 | 路径 | 额外参数 | 响应 |
| --- | --- | --- | --- |
| POST | `/api/chat` | `message`：1–20000 字符的字符串 | `202`，接受任务并返回 `turnId`；完成状态通过 SSE/state 获取 |
| GET | `/api/events` | 无 | `text/event-stream`，立即发送当前状态，之后发送本会话状态更新 |
| GET | `/api/state` | 无 | 当前会话状态 |
| POST | `/api/stop` | 无 | `{ "ok": true }`，请求停止，等待状态变为 `stopped` |
| POST | `/api/reset` | 无 | 清空本会话对话和撤销记录，保留文件 |
| POST | `/api/undo` | 无 | 撤销本会话最近一轮文件修改及相应模型上下文 |
| GET | `/api/files` | 无 | 相对路径字符串数组 |
| GET | `/api/file` | `path`：相对文件路径 | `{ "content": "..." }` |

所有 POST 必须使用 `Content-Type: application/json`。

### 提交需求

```bash
curl http://127.0.0.1:4317/api/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "appID": "client001",
    "session": "chat-001",
    "model": "deepseek-flash",
    "message": "创建一个计数器网页"
  }'
```

```json
{
  "ok": true,
  "appID": "client001",
  "session": "chat-001",
  "model": "deepseek-flash",
  "turnId": "服务器生成的轮次ID"
}
```

### 订阅执行结果

```bash
curl -N 'http://127.0.0.1:4317/api/events?appID=client001&session=chat-001&model=deepseek-flash'
```

每条 SSE 消息的 `data` 是完整状态快照，不是文本增量；断线后 EventSource 自动重连，服务端重新发送最新快照，客户端直接替换状态即可。

```js
const identity = {
  appID: 'client001',
  session: 'chat-001',
  model: 'deepseek-flash',
};
const query = new URLSearchParams(identity);
const events = new EventSource(`/api/events?${query}`);
events.onmessage = event => {
  const state = JSON.parse(event.data);
  console.log(state.busy, state.turns);
};

const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...identity, message: '创建一个计数器网页' }),
});
if (!response.ok) throw new Error((await response.json()).error);
// 页面/组件卸载时：events.close()
```

### 状态字段

- `appID`、`session`、`model`、`modelId`：会话身份和当前模型；`modelId` 为保留的兼容字段。
- `busy`：本会话是否正在执行或保存。
- `configured`：后端是否配置了此模型所需的 Key，不包含 Key 本身。
- `turns`：轮次列表，含 `id`、`model`、`prompt`、`status`、`blocks`、`changes`、开始/结束时间和可选 `error`。
- `blocks`：`text` 回复块或 `tool` 执行块；工具块含 `name`、`args`、`status`、`output`。
- `changes`：文件路径、变更类型、增删行数和 unified diff。
- `canUndo`：是否允许撤销最近一轮。
- `workspace`：服务端本会话的工作路径。
- `previewUrl`：本会话独立路径的静态预览地址，使用此地址可避免预览串会话。生成 HTML 应使用相对资源路径。

状态：`running` / `done` / `error` / `stopped` / `undone` / `interrupted`。

错误使用非 2xx HTTP 状态和 `{ "error": "说明" }`：参数不合法/不支持的模型为 `400`；未配置网页来源为 `403`；同会话执行中或无法撤销为 `409`；非 JSON 写请求为 `415`；模型 Key 未配置为 `503`。模型执行阶段失败通过轮次 `status: "error"` 和 `error` 字段返回。

## Vue demo 参数

默认 `appID=vue-demo1`、`session=demo`、`model=deepseek-flash`。原来的会话和 `workspace/` 文件保留在此默认组合下，不会迁移或删除。

可以通过页面 URL 指定一组参数：

```text
http://127.0.0.1:4317/?appID=client001&session=chat-001&model=deepseek-v4-pro
```

其他会话使用 `workspaces/<hash>/` 和 `.data/sessions/<hash>/`；hash 由 `appID + session` 生成，用户参数不会直接拼接到文件系统路径。无多会话列表 UI。
