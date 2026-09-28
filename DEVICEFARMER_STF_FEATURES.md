# DeviceFarmer/STF 当前特性与边界

> 调研日期：2026-09-24  
> 取证范围：仅使用 DeviceFarmer/STF 官方 GitHub 仓库中的 README、部署文档、API 文档、Metrics 文档、Compose 配置、变更记录及许可证。  
> 当前核对版本：`3.8.0`，对应官方仓库提交 [`6019395`](https://github.com/DeviceFarmer/stf/commit/6019395dc59c7ed65d02cc10dfa5e535fbfb667d)。

## 1. 一句话定位

DeviceFarmer/STF 是一个 **Apache-2.0 开源、可免费自部署的 Android 实体设备农场与浏览器远控平台**。它适合把多台通过 ADB 接入的 Android 设备集中展示、分配给用户，并提供浏览器操控、远程 ADB 和一组基础 REST API；但它不是完整的移动自动化测试管理平台，也不具备面向不可信租户的强隔离能力。[官方 README](https://github.com/DeviceFarmer/stf#readme) · [许可证](https://github.com/DeviceFarmer/stf/blob/master/LICENSE)

## 2. 能力总览

| 领域 | 当前能力 | 判断 |
|---|---|---|
| 设备远控 | 浏览器实时画面、触摸/多点触控、键盘输入、旋转、文件与 APK 操作、Shell、日志 | 成熟的核心能力；VNC 仍为实验性 |
| 库存与预约 | 状态、占用人、硬件信息、检索、分组、长期分配、限时/循环预约、用户配额 | 能覆盖内部设备实验室的基础资源管理 |
| 远程 ADB | 可从本地 ADB、Android Studio、Chrome DevTools 连接被占用设备 | 核心能力，但必须限制网络暴露 |
| REST API | 设备查询、占用/释放、远程 ADB 开关、用户信息；另有管理员 Metrics 端点 | API 面较窄，适合集成而非完整编排 |
| 分布式 | Provider、App、Database、Proxy 等角色拆分；ZeroMQ + Protocol Buffers；可多主机扩展 | 是分布式设备农场，不是 Kubernetes 原生控制平面 |
| 认证权限 | Mock、LDAP、OAuth2、OpenID、SAML2；普通用户/管理员；分组与配额 | 有认证和资源分配，但不是企业级细粒度 RBAC/强租户隔离 |
| 可观测性 | 设备状态、实时日志、Prometheus 指标、Node.js 进程指标 | 可接 Prometheus/Grafana；未内置完整告警与运营看板体系 |
| 平台支持 | Android 实体设备；Linux/BSD 推荐，macOS 适合开发 | 无 iOS；无官方 Windows 支持 |
| 部署 | npm、本地 `stf local`、Docker/Compose、systemd + Docker 分角色部署 | 可从单机试用扩展到多节点生产部署 |

## 3. 设备远控

官方 README 明确列出的浏览器远控能力包括：[Features](https://github.com/DeviceFarmer/stf#features)

- 实时屏幕画面，官方描述约为 30–40 FPS，实际效果依赖设备和主机性能，并支持旋转。
- 鼠标模拟触摸以及多点触控；`Alt` 配合拖动可模拟缩放、旋转等手势。
- 键盘输入、组合键、复制粘贴；官方同时提示非拉丁字符输入可能表现不佳。
- 拖放安装 APK，并可在安装后启动应用。
- 远程执行 Shell 命令并实时查看输出。
- 查看、筛选设备日志。
- 文件浏览与文件传输。
- 打开 URL、识别浏览器及默认浏览器。
- 通过 `minirev` 做反向端口转发。
- VNC 支持仍标记为 **experimental / work in progress**，不应作为稳定生产能力承诺。

这些能力以“人与设备的交互式远控”为中心，不等同于自动生成测试用例、运行测试套件或产出测试报告。

## 4. 设备库存、占用与预约

STF 会记录并展示设备是否连接、离线、不可用、未授权、被拔出，以及当前占用用户；可按手机号、IMEI、ICCID、Android 版本、运营商、产品、分组等条件检索，还可查看电池、硬件规格并让设备显示红色识别画面。[Device inventory](https://github.com/DeviceFarmer/stf#device-inventory)

资源分配分为两层：[Booking & Partitioning](https://github.com/DeviceFarmer/stf#booking--partitioning)

1. 用户可以临时占用和释放可用设备。
2. 管理员可以把“设备集合 + 用户集合 + 时间规则”组成分组，既支持长期分配，也支持限时、循环预约，并设置默认或按用户的分组配额。

因此它具备内部实验室所需的库存、预约和基础配额管理，但官方材料没有给出审批流、计费、SLA、跨组织账单或复杂策略引擎。

## 5. 远程 ADB 与 REST API

### 5.1 远程 ADB

被用户占用的设备可通过网络地址执行 `adb connect`，之后能使用本地 `adb shell`、Android Studio/其他 IDE 调试，以及 Chrome Remote Debugging。[官方 README](https://github.com/DeviceFarmer/stf#features)

这是 STF 与 Appium、现有 CI 或自研测试执行器集成的主要入口，但自动化执行、队列、用例模型和报告体系需要外部系统提供。

### 5.2 REST API

官方 API 使用 Bearer access token；token 在 STF UI 的 **Settings > Keys** 中生成，并提供 Swagger 描述。[API 文档](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md)

文档列出的主要接口包括：

- 查询全部设备及单台设备；设备列表包含已断开的设备。
- 查询当前用户及其已占用设备。
- 占用设备、释放设备。
- 开启远程 ADB 并取得连接地址、关闭远程 ADB。
- `3.8.0` 还提供管理员专用的 `/api/v1/metrics` Prometheus 指标端点。

从官方 API 文档可见，这是一组面向“设备访问与占用”的基础 API，并非覆盖用户、分组、预约、测试计划、任务编排、制品与报告的完整平台 API。

## 6. 分布式架构

官方生产部署把 STF 拆成多个独立进程/角色，各组件主要通过 **ZeroMQ + Protocol Buffers** 通信，并使用 RethinkDB 保存状态。[Deployment](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)

```text
浏览器 / API 客户端
        │
    Reverse Proxy
        │
 App / Auth / API / WebSocket / Storage / Groups Engine
        │            │
   Triproxy / Processor / Reaper
        │
 Provider 主机 ── ADB ── Android 实体设备
        │
     RethinkDB
```

关键角色：

- **Provider 主机**：运行 ADB 与 `stf-provider`，直接连接 USB Android 设备；可横向增加主机和设备。
- **应用侧**：包含 App、Auth、API、WebSocket、Processor、Reaper、Storage、Groups Engine、Triproxy、数据库代理/迁移等进程。
- **数据库**：RethinkDB。
- **入口**：由反向代理统一暴露 Web、API、WebSocket 及设备流量。

仓库中的 Compose 方案进一步把这些角色拆成多个容器，并给出 RethinkDB 持久卷、Provider、Triproxy、Auth、API、WebSocket、Storage 和 Nginx 的组合示例。[Docker Compose 指南](https://github.com/DeviceFarmer/stf/blob/master/docker/compose/README.md) · [`docker-compose.yaml`](https://github.com/DeviceFarmer/stf/blob/master/docker-compose.yaml)

## 7. 认证、权限与多租户边界

官方代码提供 `auth-mock`、`auth-ldap`、`auth-oauth2`、`auth-openid`、`auth-saml2` 等认证入口；部署文档重点说明 Mock、OAuth2 和 LDAP。[认证 CLI 源码目录](https://github.com/DeviceFarmer/stf/tree/master/lib/cli) · [Deployment](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)

权限侧能够区分普通用户与管理员，并以设备占用、分组、预约、用户集合和配额控制资源访问。不过应把它理解成 **内部组织的基础权限和资源划分**：

- 官方没有宣称细粒度 RBAC、属性策略、审计合规或强租户隔离。
- 内部组件流量缺少完善的安全与加密设计。
- 已释放设备不会被可靠恢复出厂或彻底清除上一用户数据。

因此，STF 不适合未经安全加固就直接面向互不信任的外部客户提供公共多租户服务。[Security](https://github.com/DeviceFarmer/stf#security)

## 8. 可观测性

### 8.1 Prometheus

`3.8.0` 新增管理员专用的 Prometheus 文本格式端点 `GET /api/v1/metrics`；可使用管理员 access token 或浏览器管理员会话访问，缺失/无效凭据返回 401，普通用户返回 403。[Metrics 文档](https://github.com/DeviceFarmer/stf/blob/master/doc/METRICS.md) · [3.8.0 Changelog](https://github.com/DeviceFarmer/stf/blob/master/CHANGELOG.md#380-2026-09-23)

主要指标包括：

- 设备总数、按状态计数、可用数、忙碌数。
- Provider 总数。
- 用户总数、按权限级别计数。
- 分组总数、活跃数、按状态和类别计数。
- `process_*`、`nodejs_*` 进程与运行时指标。

指标在抓取时从数据库计算；官方文档给出了 Prometheus 和 Grafana 的对接方式，但没有内置完整告警规则、预制运营大盘、链路追踪或 SLO 管理。

### 8.2 操作层观测

Web UI 还提供设备在线/占用状态、实时 Shell 输出和设备日志查看，适合日常定位单设备问题。它不能替代集中日志平台和基础设施监控。

## 9. 平台支持与部署方式

### 9.1 设备与宿主平台

- **设备端**：官方 README 当前声明支持 Android 2.3.3（SDK 10）至 Android 15（SDK 35），包括部分 Android 衍生系统；无需 root。[Requirements](https://github.com/DeviceFarmer/stf#requirements)
- **新版本测试覆盖**：`3.8.0` 变更记录提到 Android CI 矩阵覆盖 5.0–16，并新增 Android 16.1/17 测试任务。这反映持续兼容性验证，不能直接替代 README 尚未更新的正式支持声明。[Changelog](https://github.com/DeviceFarmer/stf/blob/master/CHANGELOG.md#380-2026-09-23)
- **宿主机**：Linux/BSD 推荐生产使用；macOS 可用于开发，但官方认为其 ADB 在生产中不够可靠；不提供官方 Windows 支持。[Requirements](https://github.com/DeviceFarmer/stf#requirements)
- **iOS**：不支持，只被列为长期目标。[Future goals](https://github.com/DeviceFarmer/stf#future-goals)

### 9.2 部署路径

1. **本地试用**：全局安装 `@devicefarmer/stf` 后运行 `stf local`；该模式包含 Mock 登录，适合开发验证。
2. **npm 自建**：自行安装 Node.js、ADB、RethinkDB、ZeroMQ、CMake、GraphicsMagick、Protocol Buffers 等依赖并启动各组件。
3. **Docker/Compose**：使用 `devicefarmer/stf` 镜像及仓库 Compose 配置；适合快速搭建单机或拆分服务。
4. **分布式生产部署**：按 Provider、App、Database、Proxy 角色部署，可把 USB 设备分散到多台 Provider 主机。

### 9.3 当前文档冲突

官方 README 仍写着 Node.js “up to 20.x”，而 `3.8.0` 的 [`package.json`](https://github.com/DeviceFarmer/stf/blob/master/package.json) 已要求 `node >= 22.18.0`。部署时应以锁定版本的 `package.json`/发布制品为准，并在上线前验证镜像与依赖，而不能直接照抄 README 的旧版本要求。

## 10. 维护状态与许可证

- **维护状态**：项目仍在活跃维护。官方 `3.8.0` 于 2026-09-23 发布，包含 Prometheus 指标、Android 新版本 CI、依赖升级、安全/稳健性修复和发布自动化；次日主分支版本提交仍有更新。[Changelog](https://github.com/DeviceFarmer/stf/blob/master/CHANGELOG.md#380-2026-09-23) · [当前提交](https://github.com/DeviceFarmer/stf/commit/6019395dc59c7ed65d02cc10dfa5e535fbfb667d)
- **维护预期**：README 明确说明项目主要由志愿时间和有限硬件支撑，进展可能较慢，不应按商业产品 SLA 预期。[Current status](https://github.com/DeviceFarmer/stf#current-status)
- **许可证**：Apache License 2.0，可免费使用、修改和自部署，但仍需遵守许可证中的版权、NOTICE、专利及商标等条款。[LICENSE](https://github.com/DeviceFarmer/stf/blob/master/LICENSE) · [`package.json`](https://github.com/DeviceFarmer/stf/blob/master/package.json)

## 11. 安全与运维局限

官方安全说明非常明确：[Security](https://github.com/DeviceFarmer/stf#security)

1. 项目为可信内部用户设计，内部进程之间“很少或没有”安全与加密措施。
2. 即使前端配置 HTTPS，内部进程流量仍可能是明文。
3. 熟悉系统的恶意用户可能绕过设备所有权边界控制设备。
4. 设备在用户切换时不会被彻底重置，可能残留账号、文件与应用数据。
5. 官方部署文档还警告不要在生产环境沿用默认 Docker ADB key。[Deployment](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)
6. Compose 示例使用 Mock Auth 和 HTTP，官方要求在不可信网络中自行加入真实认证与 TLS。[Compose 指南](https://github.com/DeviceFarmer/stf/blob/master/docker/compose/README.md)
7. USB、Hub、ADB 与实体设备本身可能需要人工干预，STF 不是能够消除硬件故障的自愈平台。[FAQ](https://github.com/DeviceFarmer/stf#faq)

若用于生产，至少需要把组件放在受控内网，使用真实身份源、TLS、网络分段、独立 ADB key、最小端口暴露，并在每次换人后增加外部的设备清理/重置流程。

## 12. 明确不具备或不应误判的能力

- **没有 iOS 支持**。
- **不是完整自动化测试平台**：没有官方内建的测试用例库、套件、调度队列、断言、测试报告、失败重试和质量趋势闭环；可通过远程 ADB/API 与 Appium、CI 或自研执行器集成。
- **不是强隔离的公共多租户云服务底座**：基础用户/管理员、分组和配额不能替代零信任隔离、细粒度 RBAC 和完整审计。
- **不能保证换用户后设备数据已清除**；“properly reset user data”仍被列为短期目标。[Future goals](https://github.com/DeviceFarmer/stf#future-goals)
- **VNC 尚未正式产品化**，仍为实验性能力，其 UI 完整暴露仍在目标列表中。
- **计划性设备重启仍是目标而非现成功能**。
- **没有官方 Windows 生产支持**。
- **不是 Android 虚拟机/容器的弹性供给平台**；其核心对象是通过 ADB 接入的 Android 设备。官方 CI 使用模拟器做兼容性验证，不等于平台提供模拟器资源编排。
- **没有内置完整监控运营套件**；3.8.0 提供的是 Prometheus 指标出口，告警、大盘、集中日志和追踪仍需外部系统。
- **官方 REST API 不等同于完整管理 API**；公开文档主要覆盖设备、用户占用和远程 ADB。

## 13. 选型结论

如果目标是建设一个 **可信内网中的 Android 真机共享与远控平台**，并准备自行接入 Appium/CI、补齐安全加固和设备清理流程，STF 仍是成熟、可二次开发的开源基础。

如果目标是 **Android + iOS 一体化、强多租户隔离、完整自动化测试编排与报告、商业级运维 SLA**，STF 本身不够，需要叠加较多自研系统，或选择更贴近这些要求的上层平台。

## 14. 官方资料索引

- [DeviceFarmer/STF 官方仓库](https://github.com/DeviceFarmer/stf)
- [README：功能、要求、安全与项目状态](https://github.com/DeviceFarmer/stf#readme)
- [REST API 文档](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md)
- [分布式部署文档](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)
- [Prometheus Metrics 文档](https://github.com/DeviceFarmer/stf/blob/master/doc/METRICS.md)
- [Docker Compose 指南](https://github.com/DeviceFarmer/stf/blob/master/docker/compose/README.md)
- [Changelog](https://github.com/DeviceFarmer/stf/blob/master/CHANGELOG.md)
- [`package.json`](https://github.com/DeviceFarmer/stf/blob/master/package.json)
- [Apache-2.0 LICENSE](https://github.com/DeviceFarmer/stf/blob/master/LICENSE)
