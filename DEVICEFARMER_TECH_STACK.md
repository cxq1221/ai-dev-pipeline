# DeviceFarmer/STF 当前技术栈

> 研究时间：2026-09-29  
> 固定基线：官方仓库提交 [`3224bbe8b5c6f70287c52932a159add9fa9d9f12`](https://github.com/DeviceFarmer/stf/commit/3224bbe8b5c6f70287c52932a159add9fa9d9f12)，项目版本 `3.8.0`，Apache-2.0。  
> 取证范围：该提交的 `package.json`、TypeScript/webpack/build 配置、Dockerfile、`docker-compose.yaml`、源码 imports、README、测试与指标文档。所有链接均固定到同一提交。

## 一、技术栈总览

| 分层 | 当前技术栈 | 结论 |
|---|---|---|
| 前端 | React 19、TypeScript、React Router 8、Mantine 9、Tabler Icons、TanStack Query 5、Zustand 5、CSS Modules | **当前不是 Angular。** React/TSX 入口、路由和 Provider 均在现行源码中。[依赖清单](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L144-L209) [React 入口](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/res/app/src/entries/app.tsx#L1-L60) |
| 后端 | Node.js 22、TypeScript、Express 5、Swagger/OpenAPI middleware、Pug、Passport/OAuth2/SAML/LDAP、Bluebird | 后端是多个 Node.js unit，不是单体服务；TypeScript 编译为 NodeNext/ES2022 JavaScript。[Node/服务依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L39-L113) [后端 tsconfig](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/tsconfig.json#L1-L21) |
| 浏览器实时通信 | Socket.IO 4（仅 WebSocket transport）、原生 `ws` WebSocket | 操作/状态走 Socket.IO；设备画面走浏览器直连 Device Worker 的独立 `ws` server。[Socket.IO 服务端](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/websocket/index.ts#L165-L180) [前端客户端](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/res/app/src/core/socket.ts#L1-L33) [画面 WS](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/device/plugins/screen/stream.ts#L503-L528) |
| 内部消息 | ZeroMQ 6、Protocol Buffers / protobufjs 8 | unit 间以 ZeroMQ传输 protobuf；app/dev 两侧由 triproxy 与 Processor 连接。[依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L92-L112) [官方部署说明](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/doc/DEPLOYMENT.md#L1-L11) |
| 数据库 | RethinkDB 2.x；官方 Compose 固定 2.4.2 | 保存用户、Token、设备状态和 Group/预约等控制面数据。[驱动与外部要求](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L92-L112) [Compose 数据库](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker-compose.yaml#L38-L49) |
| Android 设备侧 | ADB、`@devicefarmer/adbkit`、STFService、minicap/minicap-apk、minitouch、minirev、jpeg-turbo、GraphicsMagick | Provider 用 ADB发现设备，每台设备启动一个插件化 Worker；画面、触控、远程 ADB均由 Worker 侧组件完成。[设备依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L43-L57) [插件装配](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/device/index.ts#L20-L60) |
| 构建 | TypeScript、Webpack 5、esbuild-loader、CSS Modules、npm、自定义 `build.mts` | 前端由 webpack 打包，TS/TSX 经 esbuild-loader 转译；后端由 TypeScript compiler emit。[webpack](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/webpack.config.mts#L12-L90) [构建任务](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/build.mts#L229-L315) |
| 部署 | Ubuntu 22.04 镜像、Docker Compose、Nginx、独立 unit/service、Linux USB privileged ADB 容器 | Compose 是多服务拓扑，不是一个容器跑全部组件。[Dockerfile](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/Dockerfile#L5-L71) [Compose](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker-compose.yaml#L38-L192) |
| 测试与质量 | Mocha、Chai、Sinon、Vitest + jsdom、Testing Library、Playwright、ESLint、TypeScript strict | 后端/通用单测、前端组件测试和真实浏览器 E2E 分开运行。[npm scripts](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L28-L37) [测试说明](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/TESTING.md#L1-L47) |
| 可观测性 | 自有结构化文本日志、设备日志经 protobuf 回传、Prometheus `prom-client` 指标、Compose healthcheck | 有指标和健康检查，但仓库未提供完整开箱即用的集中日志/Tracing 栈。[指标文档](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/doc/METRICS.md#L1-L74) [Compose healthcheck](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker-compose.yaml#L15-L36) |

## 二、前端：已经是 React，不是 Angular

### 当前事实

- `res/app/src/entries/app.tsx` 使用 `createRoot()`、React `StrictMode`、React Router 的 `createHashRouter()`，页面按 `lazy()` 拆包。[当前入口](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/res/app/src/entries/app.tsx#L1-L60)
- UI 组件由 Mantine 提供，图标使用 Tabler；服务端数据缓存由 TanStack Query 提供，另有 Zustand 依赖。[前端依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L144-L209) [React Providers](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/res/app/src/ui/Providers.tsx#L1-L32)
- 前端 TypeScript 配置使用 `react-jsx`、ESNext module、Bundler resolution、strict、noEmit。[前端 tsconfig](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/res/app/tsconfig.json#L1-L24)
- webpack 以三个 TSX 文件为入口：主应用、LDAP 登录、mock 登录；TS/JS 通过 `esbuild-loader` 转到 ES2020，CSS 使用 `style-loader` + `css-loader`，自动启用 CSS Modules。[webpack 配置](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/webpack.config.mts#L12-L73)

### 为什么网上的 Angular 资料已过时

旧 OpenSTF/STF 文章、截图和目录分析经常描述 Angular 前端；但在本报告固定提交中：

1. `package.json` 没有 Angular runtime/build 依赖，明确列出 React 19、React DOM 19、React Router 8、Mantine、TanStack Query、Zustand。[package.json](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L144-L209)
2. 当前入口和页面实现是 `.tsx` React 组件。[应用入口](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/res/app/src/entries/app.tsx#L1-L60)
3. 测试文档直接写明 Web UI 位于 `res/app/src`，技术为“React + TypeScript”。[TESTING.md](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/TESTING.md#L1-L11)
4. 少数测试名称仍写“like Angular”或“Angular UI used”，这是兼容旧行为/数据形状的测试描述，不是当前框架依赖。[日期兼容测试](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/res/app/src/core/date-format.test.ts#L1-L26) [表格兼容测试](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/res/app/src/ui/table-model.test.ts#L1-L20)

因此，面向当前主干二次开发应采用 React/TypeScript 方案；Angular 资料只能用于理解历史业务交互，不能作为当前目录、组件或构建链依据。

## 三、后端与 API

### Node.js + TypeScript unit

- 项目通过 `stf` CLI 启动多个独立 unit。后端源码是严格 TypeScript，目标 ES2022，使用 `NodeNext` module/moduleResolution；构建阶段由 TypeScript compiler 直接 emit 到 `lib` 目录。[后端 tsconfig](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/tsconfig.json#L1-L21) [compile 实现](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/build.mts#L229-L263)
- HTTP 服务以 Express 5 为核心；REST API 从 `api_v1.yaml` 创建 Swagger middleware 和 Swagger UI，并同时连接 app/dev 两侧 ZeroMQ。[API unit](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/api/index.ts#L5-L23) [Swagger 初始化](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/api/index.ts#L106-L148)
- 登录/身份相关依赖包括 Passport、OAuth2、OpenID、SAML 与 LDAP；会话使用 `cookie-session`，JWT/JWS用于 API Token 路径。[服务端依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L56-L103)
- Pug 仍是服务器页面壳/部分模板技术，不代表前端页面仍采用旧框架。[Pug 依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L92-L101)

### Node 版本：以 package/Dockerfile 为准

固定提交存在文档冲突：

- `package.json` engines 写 `node >= 22.18.0`。[engines](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L211-L220)
- 主 Dockerfile 下载 Node `22.23.2`。[Dockerfile](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/Dockerfile#L35-L42)
- README 仍写 Node “up to 20.x”，与同提交的可执行配置冲突。[README 旧要求](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/README.md#L114-L126)

因此当前构建/部署应选择 Node 22.18+，最好对齐官方镜像的 22.23.2；README 的 Node 20 上限应视为尚未同步的旧说明。

## 四、实时通信与数据协议

### 浏览器到平台

- UI 控制和状态更新：Socket.IO 4，服务端和客户端都强制 `transports: ['websocket']`；前端还设置 `reconnection: false`。[服务端](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/websocket/index.ts#L165-L180) [客户端](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/res/app/src/core/socket.ts#L5-L18)
- 实时画面：使用 `ws` 包在每个 Device Worker 上启动独立 WebSocket server，传输 minicap 产生的二进制帧；不是 Socket.IO channel。[画面服务](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/device/plugins/screen/stream.ts#L503-L528)

### unit 之间

- `zeromq` 提供 PUSH/PULL、PUB/SUB、DEALER 等进程间通信；`protobufjs` 编解码 `wire.proto` 定义的业务消息。[依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L92-L112) [`wire.proto`](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/wire/wire.proto#L5-L96)
- 构建脚本从 proto 读取消息/枚举并生成 TypeScript 类型；协议定义并非只在运行时动态解释。[wire types 生成](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/build.mts#L98-L180)
- 官方系统依赖仍要求本机安装 ZeroMQ 和 Protocol Buffers library。[外部依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L214-L220)

## 五、数据库与存储

- 主数据库是 RethinkDB，Node 驱动为 `rethinkdb ^2.0.2`；项目声明外部 RethinkDB `>=2.2`，当前 Compose 使用 `rethinkdb:2.4.2`。[package.json](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L92-L112) [Compose](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker-compose.yaml#L38-L49)
- 数据表包括用户、access token、VNC auth、设备、日志、Group；它是平台元数据/状态存储，而非画面帧或 APK 的持久对象库。[表定义](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/db/tables.ts#L8-L84)
- 上传/图片/APK 元数据处理由 `storage-temp`、`storage-plugin-image`、`storage-plugin-apk` 拆分服务完成；依赖中也提供 AWS S3 SDK，说明代码具有 S3 存储适配能力，但默认 Compose 用临时存储。[存储依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L39-L42) [Compose storage](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker-compose.yaml#L129-L139) [Compose 存储说明](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker/compose/README.md#L34-L44)

## 六、Android 设备侧

| 能力 | 技术/组件 | 官方证据 |
|---|---|---|
| 发现与基础通信 | Android Debug Bridge + `@devicefarmer/adbkit` | Provider 调用 `trackDevices()` 并为设备生成 Worker。[Provider](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/provider/index.ts#L127-L223) |
| 设备服务能力 | `stfservice-prebuilt` | Device Worker 加载 `service` 插件，配合按键、唤醒、旋转等能力。[Worker 插件](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/device/index.ts#L27-L51) |
| 屏幕流 | minicap native binary / minicap APK，JPEG 帧，浏览器 Canvas | 默认流失败时源码会切到 `minicap-apk`；Android 16 的 Compose CI 也建议显式使用 APK grabber。[回退逻辑](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/device/plugins/screen/stream.ts#L130-L178) [Compose 指南](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker/compose/README.md#L40-L47) |
| 触控 | minitouch | README 明确列为多点触控实现，包中使用预编译产物。[README](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/README.md#L29-L50) [依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L43-L55) |
| 反向端口 | minirev | 使用 `@devicefarmer/minirev-prebuilt`。[依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L43-L55) |
| 截图处理 | jpeg-turbo + GraphicsMagick | jpeg-turbo 是 Node 依赖；GraphicsMagick 为外部系统依赖和镜像包。[package.json](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L56-L77) [Dockerfile](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/Dockerfile#L35-L49) |

STF 当前设备平台仍是 Android：README 把 iOS 支持列为长期目标，而非现有能力。[README](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/README.md#L97-L108)

## 七、构建与部署

### 构建流水线

`build.mts` 是自定义任务编排器：

- `wire-types`：从 protobuf 生成 TS 类型；
- `compile`：TypeScript 编译后端；
- `webpack`：打包 React UI，并生成 webpack `stats.json`；
- `lint`：JSON lint + ESLint + 三套 TypeScript typecheck；
- `test`：compile + lint + CLI version check；随后 npm script 再跑 Mocha unit tests。

[任务定义](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/build.mts#L380-L398) [npm scripts](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L28-L37)

前端 React、Mantine 等位于 `devDependencies`，但这是因为构建后静态 bundle 会被打进发布包，运行镜像随后 `npm prune --omit=dev`；不能据此误判前端库“开发时才使用”。[前端依赖位置](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L144-L209) [镜像打包与 prune](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/Dockerfile#L53-L68)

### 容器与服务编排

- 主镜像基于 Ubuntu 22.04，当前 x86_64/arm64 分支均下载 Node 22.23.2，并安装 ZeroMQ、protobuf、GraphicsMagick 等 native 依赖。[Dockerfile](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/Dockerfile#L5-L16) [x86 构建](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/Dockerfile#L20-L71) [arm64 构建](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/Dockerfile#L74-L127)
- Compose 将 RethinkDB、ADB、migrate、triproxy、Processor、Reaper、Groups Engine、Auth、App、API、WebSocket、Storage、Provider 与 Nginx 拆成独立 service。[Compose 服务](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker-compose.yaml#L38-L192)
- ADB service 需要挂载 `/dev/bus/usb` 并以 privileged 运行；Provider 开放 7400–7500 给设备画面和远程连接。[Compose ADB/Provider](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker-compose.yaml#L51-L57) [Provider](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker-compose.yaml#L141-L161)

## 八、测试与质量保障

| 范围 | 工具 | 当前入口 |
|---|---|---|
| 后端、DB、wire、工具单元测试 | Mocha 12 + Chai 6 + Sinon 22 | `npm run test:unit`，扫描 `test/util test/wire test/db test/units`。[scripts](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L28-L37) |
| React 单元/组件测试 | Vitest 5 + jsdom + Testing Library | `npm run test:component`；扫描 `res/app/src/**/*.test.{ts,tsx}`。[Vitest 配置](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/res/app/vitest.config.ts#L1-L16) |
| E2E / 真设备触控 | Playwright 1.62，Chromium | 独立 `test/playwright` 包，可测试 UI，也可指定真实/模拟设备验证画面与触控。[Playwright package](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/test/playwright/package.json#L1-L14) [运行说明](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/TESTING.md#L13-L47) |
| 静态质量 | ESLint 10、typescript-eslint、React Hooks lint、TypeScript strict | `node build.mts lint` 运行 JSON lint、ESLint 和 typecheck。[任务定义](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/build.mts#L380-L398) |

需要注意：根目录 `npm test` 不自动运行 Vitest 组件测试或独立 Playwright E2E；CI/本地验证若只执行 `npm test`，覆盖面并不包含全部前端和浏览器链路。这是依据 scripts 的直接结论。[npm scripts](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L28-L37)

## 九、可观测性

### 指标

- 使用 `prom-client 15`，注册 Node/process 默认指标及 STF 自定义 Gauge。[依赖](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/package.json#L89-L97) [Registry](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/util/metrics.ts#L86-L110)
- 管理员通过 `GET /api/v1/metrics` 拉取 Prometheus text exposition；设备、Provider、用户、Group 指标在 scrape 时从数据库即时聚合。[指标控制器](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/api/controllers/metrics.ts#L13-L38) [指标清单](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/doc/METRICS.md#L15-L51)
- 官方文档给出 Prometheus/Grafana 最小示例，但它们不在默认 Compose 中，需自行增加并用管理员 Token 抓取。[抓取配置](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/doc/METRICS.md#L53-L104)

### 日志与健康检查

- 自有 logger 输出时间、级别、tag、PID、进程/设备 identifier 和格式化 message；Device Worker 日志会包装成 protobuf `DeviceLogMessage` 送入平台总线。[logger](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/util/logger.ts#L8-L82) [设备日志转发](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/lib/units/device/plugins/logger.ts#L1-L28)
- Compose 对 HTTP unit、triproxy 和 RethinkDB有 TCP/HTTP healthcheck，并通过 `depends_on` 控制启动顺序。[Compose healthcheck](https://github.com/DeviceFarmer/stf/blob/3224bbe8b5c6f70287c52932a159add9fa9d9f12/docker-compose.yaml#L15-L49)
- 固定提交中未发现 OpenTelemetry、分布式 Trace 或默认 ELK/Loki 服务。因此当前开箱能力是“进程日志 + Prometheus 指标 + 容器健康检查”，集中日志、告警和 Trace 需要另行建设。

## 十、二次开发选型提示

1. **前端新人直接按 React 19 + TSX + Mantine + React Router 学习代码**，不要按旧 Angular 目录或 controller/service 教程改造。
2. **后端扩展需理解多 unit + ZeroMQ/protobuf 边界**，不能把它当普通 Express 单体项目。
3. **设备能力优先落在 Device Worker 插件**；Web UI/REST 只负责发命令、管理占用和展示状态。
4. **生产镜像固定 Node 22.23.2 更稳妥**，避免遵循已经冲突的 README Node 20 说明。
5. **CI 应分别执行** `npm test`、`npm run test:component`，并按环境增加 Playwright；否则 React 组件和真实浏览器/设备链路没有进入默认测试命令。
6. **可观测性需要补齐集中日志和 Trace**；Prometheus endpoint 需管理员身份，且默认 Compose 不自带 Prometheus/Grafana。

