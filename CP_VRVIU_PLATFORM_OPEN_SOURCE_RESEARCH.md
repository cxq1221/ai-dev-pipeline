# cp.cloudgame.vrviu.com 平台开源项目指纹调研

> 调研日期：2026-09-21（Asia/Shanghai）  
> 目标：`http://cp.cloudgame.vrviu.com/Index`  
> 范围：仅访问公开入口页与其公开静态资源，并与开源项目官方仓库、官方源码进行只读对照；未登录、未尝试账号、未扫描端口、未枚举目录、未进行漏洞测试。

## 结论

**高置信度结论：该平台的 Web 主框架基于开源项目 [Sonic 云真机平台](https://github.com/SonicCloudOrg)，前端直接源自 [SonicCloudOrg/sonic-client-web](https://github.com/SonicCloudOrg/sonic-client-web)，并做了二次开发或白标定制。**

更完整但需要保留证据边界的判断是：

- **已由公开静态资源直接证实**：Web 前端是 `sonic-client-web` 的构建产物或其近源 fork。
- **后端代码血缘也有强证据，但未直接证实运行二进制版本**：公开的登录配置接口路径、返回码、英文消息和数据结构均与 [sonic-server](https://github.com/SonicCloudOrg/sonic-server) 对应；设备侧则高概率采用 [sonic-agent](https://github.com/SonicCloudOrg/sonic-agent)。这些证据仍不能证明服务器上运行的是哪个 fork、提交或版本。
- **不是原样部署**：公开语言包把平台中文名改成了“火眼云真机平台”，主包也存在部署专用后端地址和上游当前路由文件没有的兜底路由。因此准确说法应是“基于 Sonic 二次开发”，不是“未经修改的 Sonic 官方版”。
- **无法可靠判定精确版本**：入口仍保留 `Version: SONIC_VERSION` 占位符，公开 bundle 没有可信的发布版本号。不能把官方仓库 `package.json` 中的版本或最新 release 号直接当作该部署版本。

综合置信度：**很高（约 95% 以上）**。这不是只凭页面标题作出的猜测，而是多组具有较强唯一性的源码级特征同时吻合。

## 证据链

### 1. 入口 HTML 与官方源码近乎同源

公开入口返回 `200 OK`，响应头显示：

- `Server: nginx/1.20.0`
- `Content-Type: text/html`
- `Last-Modified: Mon, 12 May 2025 08:18:20 GMT`
- HTML 大小为 2,843 字节；本次抓取 SHA-256 为 `ea5130b1ea064845870fa7396060722074dea0b3a8b139182d9d1d1bc5c14eda`

入口 HTML 包含以下直接指纹：

```text
Version: SONIC_VERSION
SonicCloudOrg
<title>Sonic</title>
<div id="app"></div>
```

连同顶部完整的 `SONIC` ASCII 字符画，这些内容与官方 [`sonic-client-web/index.html`](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/index.html) 一致。公开站点多出的 `<script type="module">`、`modulepreload` 与 CSS 标签，是 Vite 生产构建正常生成的资源引用；官方仓库 README 也明确使用 `npm run build` 构建，并将 `dist` 放进 nginx。

这组指纹中的组织名、未替换版本占位符、ASCII 横幅和标题同时一致，误判为另一个同名项目的可能性很低。

**置信度：极高。**

### 2. 主 JavaScript 的路由树与官方前端逐项吻合

公开主包 `/assets/index.eff3f436.js` 中可见以下路由和页面组件：

```text
/Login
/Index
/AndroidRemote/:deviceId
/IOSRemote/:deviceId
/Home/:projectId
Devices
AndroidTestCase
IOSTestCase
TestSuites
Results
Elements
Scripts
GlobalParams
Modules
Versions
Jobs
ProjectAlertRobots
RemoteSettings
```

这些路由名称、层级和参数形式与官方 [`src/router/index.js`](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/router/index.js) 对应。尤其是 Android/iOS 远控、用例、测试套件、测试结果、公共步骤、控件元素和版本迭代同时出现，既符合 Sonic 的产品定位，也形成了比普通 Vue 页面更强的组合指纹。

公开 bundle 还额外包含 `/:pathMatch(.*)` 的 NotFound 路由，而官方当前主分支路由文件中没有这一项。这是“存在版本差异或二次改动”的直接迹象之一。

**置信度：极高。**

### 3. 鉴权和接口调用形态与官方源码一致

公开主包和登录 chunk 中可见：

- 本地存储键 `SonicToken`
- 请求头 `SonicToken`
- 登录配置接口 `/controller/users/loginConfig`
- 登录接口 `/controller/users/login`
- 项目接口 `/controller/projects`
- 返回码 `2000`、`1001`、`1003` 的对应处理
- 请求头 `Accept-Language` 与 `X-Requested-With: XMLHttpRequest`

上述逻辑与官方 [`src/store/index.js`](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/store/index.js)、[`src/http/axios.js`](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/http/axios.js) 和 [`src/views/Login.vue`](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/views/Login.vue) 高度一致。

进一步只读请求前端实际配置的公开登录配置接口，返回 `code: 2000`、`message: "Search Successful!"`，以及 `registerEnable`、`ldapEnable`、`normalEnable` 三个配置字段。官方 [`UsersController.java`](https://github.com/SonicCloudOrg/sonic-server/blob/v2.7.2/sonic-server-controller/src/main/java/org/cloud/sonic/controller/controller/UsersController.java) 同样暴露 `/users/loginConfig` 并返回 `SEARCH_OK`，官方英文资源中的对应消息正是 `Search Successful!`。这使“后端来自 Sonic Server 代码体系”的判断也具有很强证据，但仍不足以识别实际部署的 fork 或精确版本。

本部署的 bundle 将后端基地址构建成了部署专用的绝对地址，而官方当前生产配置使用相对路径 `/server/api`。报告不记录该内部地址本身；这一差异进一步支持“基于 Sonic 定制部署”，而不是简单引用了 Sonic 的名称。

**置信度：极高。**

### 4. 依赖栈与官方清单一致

入口通过 Vite 风格的哈希文件名预加载或按需加载以下依赖：

- Vue 3、Vue Router、Vuex、Vue I18n
- Element Plus
- Axios、qs、lodash、dayjs/moment
- ECharts、zrender
- CodeMirror、vue-codemirror
- JMuxer
- vue-draggable-next、vue-clipboard3

这些依赖与官方 [`package.json`](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/package.json) 的依赖组合一致。单独看 Vue 或 Element Plus 并不唯一，但与前述 HTML、路由和鉴权指纹一起构成强关联证据。

**置信度：高。**

### 5. 产品定位与 Sonic 官方说明吻合

官方组织将 Sonic 定义为集“移动设备远程控制调试”和“自动化测试”于一体的平台；[`sonic-client-web`](https://github.com/SonicCloudOrg/sonic-client-web) 是前端，[`sonic-server`](https://github.com/SonicCloudOrg/sonic-server) 是后端，[`sonic-agent`](https://github.com/SonicCloudOrg/sonic-agent) 是设备 Agent。

目标站公开语言包中的“云真机平台 / 设备中心 / Android 与 iOS 远程控制 / 测试用例 / 测试套件 / 测试结果”等产品模型，与这套官方说明完全对应。

**置信度：高。**

## 二次开发迹象

| 观察 | 上游对照 | 含义 |
| --- | --- | --- |
| 中文语言包使用“火眼云真机平台” | 官方产品名为 Sonic Cloud | 明显的品牌白标或业务定制 |
| bundle 内后端基地址是部署专用绝对地址 | 官方当前生产配置为 `/server/api` | 构建或部署配置被修改 |
| bundle 包含 NotFound 兜底路由 | 官方当前主分支路由中未见 | 可能是本地改动，也可能来自不同官方版本 |
| 静态文件哈希与官方源码无法直接一一映射 | 哈希受源码、依赖、构建环境影响 | 不能据此断言具体 fork 或提交 |

## 可能使用的 Sonic 组件

Sonic 官方以多个仓库组成完整平台。对这个站点最稳妥的拆分如下：

| 层次 | 项目 | 本次判断 |
| --- | --- | --- |
| Web 前端 | [`SonicCloudOrg/sonic-client-web`](https://github.com/SonicCloudOrg/sonic-client-web) | **直接证实，极高置信度** |
| 后端服务 | [`SonicCloudOrg/sonic-server`](https://github.com/SonicCloudOrg/sonic-server) | 接口路径、响应码、消息及字段均吻合；代码血缘高置信度，运行版本未知 |
| 设备 Agent | [`SonicCloudOrg/sonic-agent`](https://github.com/SonicCloudOrg/sonic-agent) | 高概率，但未直接验证运行二进制 |
| iOS 桥接 | [`SonicCloudOrg/sonic-ios-bridge`](https://github.com/SonicCloudOrg/sonic-ios-bridge) | 属于 Sonic 官方生态；不能仅凭当前静态页确认是否实际启用 |
| iOS WDA | [`SonicCloudOrg/sonic-ios-wda`](https://github.com/SonicCloudOrg/sonic-ios-wda) | 属于 Sonic 官方生态；不能仅凭当前静态页确认运行状态 |
| Android 投屏 | [`SonicCloudOrg/sonic-android-scrcpy`](https://github.com/SonicCloudOrg/sonic-android-scrcpy) | Sonic 对 scrcpy 的衍生组件；不能仅凭当前静态页确认运行状态 |

官方 Agent 生态还涉及 Appium UIAutomator2 Server、minicap、mitmproxy、Poco 等组件。它们是 Sonic 的底层依赖或衍生项目，不应在缺少运行时证据时表述成“该站已经确认启用的独立平台”。

## 替代解释及排除程度

### “只是一个外观仿制站”

可能性很低。目标站不仅保留 Sonic 名称和 HTML 横幅，主 bundle 的路由结构、鉴权键、接口路径、返回码处理和依赖组合也与官方源码一致。仅复制外观无需复制这些内部结构。

### “主框架其实是 OpenSTF / DeviceFarmer STF”

现有公开证据不支持这一结论。Sonic 的确受到 STF 等项目的技术生态影响，但当前可见前端是 `sonic-client-web` 的源码结构。除非后续获得后端或 Agent 运行证据，否则不能把 STF 说成这个站点的直接主框架。

### “这是某个 Sonic fork，而不是官方仓库直接构建”

这是合理且与结论兼容的解释。现有品牌、地址和路由差异都说明可能存在企业内部 fork；公开证据无法确定 fork 的仓库地址、分支或提交。因此报告采用“基于 Sonic 二次开发”的表述。

## 版本与许可证注意事项

- `sonic-client-web` 官方仓库许可证为 [GNU AGPL v3](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/LICENSE)。若需要进一步判断该部署的开源义务是否履行，应交由法务结合实际修改、部署方式和对外提供服务范围评估；本报告不作法律结论。
- GitHub 当前将 `sonic-client-web`、`sonic-server`、`sonic-agent` 标记为归档只读；官方组织也已宣布停止后续维护。若计划复用，应把安全维护、依赖升级、移动系统兼容和社区接管风险纳入评估。
- 目标站的版本占位符没有被替换，且二次开发会改变静态文件哈希。**本次不能从公开静态资源负责任地确定具体 Sonic 版本。**

## 本次未做的事情

- 未提交登录表单，未使用或猜测任何账号密码。
- 未访问需要认证的业务数据。
- 未扫描主机、端口、目录或子域名。
- 未进行漏洞验证、压力测试或绕过尝试。
- 未因前端暴露的接口路径而批量请求 API。
- 未把静态前端能证明的内容扩大解释为后端、Agent 运行版本的确定事实。

## 主要来源

1. 目标公开入口：[http://cp.cloudgame.vrviu.com/Index](http://cp.cloudgame.vrviu.com/Index)
2. Sonic 官方组织：[SonicCloudOrg](https://github.com/SonicCloudOrg)
3. 官方前端仓库：[sonic-client-web](https://github.com/SonicCloudOrg/sonic-client-web)
4. 官方入口源码：[index.html](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/index.html)
5. 官方路由源码：[src/router/index.js](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/router/index.js)
6. 官方状态管理源码：[src/store/index.js](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/store/index.js)
7. 官方请求封装源码：[src/http/axios.js](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/http/axios.js)
8. 官方登录页源码：[src/views/Login.vue](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/views/Login.vue)
9. 官方依赖清单：[package.json](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/package.json)
10. 官方前端许可证：[LICENSE](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/LICENSE)
11. 官方后端仓库：[sonic-server](https://github.com/SonicCloudOrg/sonic-server)
12. 官方 Agent 仓库：[sonic-agent](https://github.com/SonicCloudOrg/sonic-agent)
