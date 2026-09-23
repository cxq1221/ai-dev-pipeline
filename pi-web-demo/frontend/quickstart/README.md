# Vue API Quickstart

一个可以直接复制的 Vue 3 聊天接入示例。页面只有对话区和输入框；使用 Vue、浏览器原生 `fetch` 和 `EventSource`，不使用 SDK。

## 启动场景化 Demo

先在仓库的 `pi-web-demo/` 目录安装依赖，并确保 `.env` 中已配置 `DEEPSEEK_API_KEY`（首次使用可从 `.env.example` 复制，已有文件不要覆盖）：

```bash
npm ci
npm run dev
```

访问 **http://127.0.0.1:4317/** 。这是场景化工作台，包含源码、diff、撤销和运行预览。

## 启动 Quickstart Demo

保持上述 `npm run dev` 运行，直接访问 **http://127.0.0.1:4317/quickstart/**；不需要再启动一个进程。`npm start` 也会构建并托管这两个页面。

两个示例共用 API；Quickstart 默认 `appID=quickdemo`、`session=quickstart`，与工作台数据独立。

## 独立运行或复制到其他项目

这个目录可以整体复制出去，独立运行。需要 Node.js 22.12+。

1. 先按上面的命令保持编码 API 服务运行（默认 `127.0.0.1:4317`，Key 在后端配置）。
2. 在**另一个终端**进入本目录 `pi-web-demo/frontend/quickstart/`，运行：

```bash
npm ci
npm run dev
```

3. 打开 **http://127.0.0.1:5173/**。

独立 Vite 开发服务器把 `/api/*` 转发到 `127.0.0.1:4317`，因此代码中的 `API_BASE = window.location.origin` 无需修改。需要其他后端地址时修改 `vite.config.js` 中的 `backend`。代理仅用于本地开发。

`npm run build` 生成本目录下的 `dist/`。独立部署这些静态文件时，应由宿主提供 `/api` 反向代理，或修改 `App.vue` 顶部的 `API_BASE` 并在后端 `ALLOWED_ORIGINS` 配置页面来源。HTTPS 页面需要 HTTPS API，不能跨协议调用 HTTP。

已有 Vue 项目只需参考或复制 `src/App.vue`，样式在 `src/style.css`；模型 Key 不进入前端。

## 代码入口

```text
src/App.vue      接入参数、HTTP 请求、SSE、聊天展示
src/main.js      Vue 挂载
src/style.css   独立样式
index.html      HTML 入口
vite.config.js  独立开发代理与构建
```

`App.vue` 中只用四个接口：

| 操作 | 接口 | 行为 |
| --- | --- | --- |
| 连接 | `GET /api/state` | 使用三个 query 参数恢复状态 |
| 订阅 | `GET /api/events` | SSE 推送完整状态，直接替换 Vue state |
| 发送 | `POST /api/chat` | JSON 携带三个公共参数和 `message`；202 表示已接受 |
| 停止 | `POST /api/stop` | JSON 携带三个公共参数，停止当前会话 |

公共参数：

```json
{
  "appID": "quickdemo",
  "session": "quickstart",
  "model": "deepseek-flash"
}
```

- `appID` 恰好 9 位字符串，`session` 标识对话，`model` 可选 `deepseek-flash` / `deepseek-v4-pro`。
- 参数固定在 `App.vue` 顶部；复制到其他客户端时替换 `API_BASE`、`appID`、`session` 和 `model`。
- 刷新页面会按相同 appID/session 恢复历史；离开页面只关闭 SSE，不停止服务端任务。要停止请使用“停止”。
- SSE 自动重连；每条事件是完整状态快照，不应当追加到旧消息列表。
- 错误在页面显示，组件卸载时关闭 EventSource。
- 回复以纯文本展示，工具只显示名称和状态；没有 Markdown、文件树、多会话列表等额外依赖。

更完整的契约见仓库 `pi-web-demo/API.md`。
