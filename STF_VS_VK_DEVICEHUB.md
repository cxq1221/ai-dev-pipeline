# DeviceFarmer/STF 与 VK DeviceHub 对比调研

> 调研日期：2026-09-22（Asia/Shanghai）  
> 范围：仅使用两个项目的官方 GitHub 仓库、README、源码、发布记录和官方文档。  
> 对比对象：[DeviceFarmer/STF](https://github.com/DeviceFarmer/stf) 与 [VK DeviceHub](https://github.com/VKCOM/devicehub)

## 结论

**VK DeviceHub 是 DeviceFarmer/STF 的直接 fork，不是另一套从零设计的平台。**它保留了 STF 的 Web 设备池、`stf` CLI、`STF_*` 环境变量、REST API、用户/分组/预约模型，以及 app、api、provider、processor、triproxy、websocket 等分布式单元；主要增量是：

- 在 Android 之外增加 iOS/WDA 设备接入和浏览器控制；
- 将主数据库从 RethinkDB 改为 MongoDB；
- 提供更直接的 Docker Compose、macOS Compose 和 Helm 部署；
- 增加服务用户、组管理员/Moderator、JWT 流程等企业使用能力；
- 增加 iOS WebDriver/Appium 远程连接路径，但仍不是 Sonic 式内置测试用例编排平台。

选择建议很清楚：

- **只做 Android，优先成熟度、上游持续维护和较低迁移复杂度：选 DeviceFarmer/STF。**
- **必须同时管理 Android 和 iOS，并愿意承担 MongoDB、Mac/Xcode、WDA 和签名运维：优先验证 VK DeviceHub。**
- **已经运行 STF 时，不要把 DeviceHub 当成镜像地址一换就能升级。**REST API、CLI 和业务模型有较强兼容基础，但数据库、部署配置、镜像、前端和 iOS 组件均已分叉，应按迁移项目处理。

## 核心差异表

| 维度 | DeviceFarmer/STF | VK DeviceHub | 判断 |
| --- | --- | --- | --- |
| 继承关系 | OpenSTF 的后续活跃维护项目 | 官方 README 和 GitHub 均明确标注为 DeviceFarmer/STF 的 fork | DeviceHub 是在 STF 架构上持续分叉，不是平行原创平台 |
| Android | 官方核心平台；README 标注 Android 2.3.3～15，并支持 Wear、Fire OS 等 | 继承 STF Android 能力，README 标注 Android 2.3.3～14、Wear、Fire OS 等 | Android 基础能力高度同源；按当前官方声明，DeviceHub 不是 Android 版本覆盖上的严格超集 |
| iOS | README 将 iOS support 列为长期目标，当前主线不提供 | iOS 设备可通过 Appium WebDriverAgent 进入 UI，支持画面、简单点击/手势/按键、安装应用；可选 ESP32 控制 | iOS 是 DeviceHub 最关键的产品差异，但需要 Mac/Xcode/WDA/签名 |
| 数据库 | RethinkDB ≥ 2.2 | MongoDB 6.0.10 replica set；提供 `stf migrate-to-mongo` | 不是原地数据库升级；需要专项迁移和回滚方案 |
| 认证 | mock、LDAP、OAuth2、OpenID、SAML2；REST API 使用用户访问令牌 | 同样提供 mock、LDAP、OAuth2、OpenID、SAML2；文档明确浏览器 JWT 流程，另有 service user | 认证协议种类基本同源；DeviceHub 在服务账号和角色上有扩展 |
| 权限/租户 | 用户、系统管理员、设备分组、预约、配额 | 继承上述能力，并文档化 System Admin、Group Owner、Group Moderator、Regular User 四级角色 | DeviceHub 更适合分组运营，但仍需实测越权、占用隔离和审计 |
| 部署 | `stf local`；官方 Docker 镜像；正式部署文档以 systemd + Docker 多单元为主，也有 standalone Compose | 首屏直接提供 Linux/macOS Docker Compose；支持 Helm；systemd 被标记为 legacy | DeviceHub 的新部署入口更现代，但组件和网络拓扑仍然较重 |
| 浏览器远控 | Android 实时画面、触控、键盘、远程 ADB、文件/应用等 | 继承 Android 能力，并增加 iOS WDA 画面与交互；可选 ESP32 降低纯 WDA 手势限制 | 双端远控选 DeviceHub；Android-only 两者体验血缘接近 |
| 自动化 | REST API 可预约设备、取得远程 ADB，再与外部 Appium/CI 集成 | 增加统一 `/api/v1/autotests`，按 Android/iOS 和条件申请/释放设备，分别返回 ADB/WDA 地址供外部 Appium Grid 使用 | DeviceHub 的设备自动分配接口更完整；两者仍都不是内置用例/结果编排中心 |
| 分布式 | app/api/provider/processor/triproxy/websocket 等多进程，可跨主机部署 | 保留同一类单元和连接模型，新增 `ios-provider`、`ios-device` 等 | 架构兼容度高，但不能据此推定二进制和配置完全兼容 |
| 维护活跃度 | `package.json` 为 3.7.9；CHANGELOG 记录 3.7.9 于 2026-07-08 发布；默认分支 2026-09-22 仍有提交 | 最新 release v1.5.2 为 2026-02-28；默认分支最新提交为 2026-03-25 | 两者都不是“死项目”；截至调研日，STF 的提交更新更近，DeviceHub 最近一轮发布重点是 Apple/WDA |
| 许可证 | Apache-2.0 | Apache-2.0，许可证保留 OpenSTF、Orange、Zebrunner、VK 等版权声明 | 都可免费自部署和二开；仍需保留许可证/NOTICE 并核查依赖许可证 |

## 1. 继承关系：DeviceHub 保留了多少 STF

[DeviceHub README](https://github.com/VKCOM/devicehub#about-project)直接写明它是由 VK 成员开发的 DeviceFarmer/STF fork，GitHub 仓库页也显示 `forked from DeviceFarmer/stf`。这不是仅仅“参考过 STF”。

源码和文档还能看到大量兼容痕迹：

- 可执行命令仍提供 `stf`，同时增加 `devicehub` 和 `dh` 别名；见 [DeviceHub `package.json`](https://github.com/VKCOM/devicehub/blob/master/package.json)。
- 配置仍广泛使用 `STF_*` 前缀；[CLI 单元文档](https://github.com/VKCOM/devicehub/blob/master/units.md)还说明若干旧环境变量继续兼容，但已 deprecated。
- app、api、auth、provider、processor、reaper、storage、triproxy、websocket 等单元和 ZeroMQ/Protocol Buffers 通信模型被保留；见 [DeviceHub 部署概览](https://github.com/VKCOM/devicehub/blob/master/doc/deployment/DEPLOYMENT.md)与 [STF 部署文档](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)。
- 两边的 REST API 都保留 `/api/v1/user/devices`、设备占用/释放、`remoteConnect` 和 Bearer Token 等核心契约；对比 [STF API](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md)与 [DeviceHub API](https://github.com/VKCOM/devicehub/blob/master/doc/API.md)。DeviceHub 还增加了更新设备信息的 `PUT /devices/{serial}`。

因此，对已有 STF 客户端和运维经验来说，DeviceHub 有明显复用价值；但 fork 已经在数据库、UI、依赖和设备类型上形成实质分叉，不能按“小版本升级”理解。

## 2. Android 与 iOS

### DeviceFarmer/STF

[STF README](https://github.com/DeviceFarmer/stf#features)的正式支持范围是 Android 2.3.3～15，包括浏览器实时画面、触控、键盘、复制粘贴、文件管理、APK 安装、日志、Shell 和远程 ADB。README 的长期目标仍列着 iOS support，说明当前上游主线不能作为双端平台采购。

### VK DeviceHub

[DeviceHub README](https://github.com/VKCOM/devicehub#operating-system-support)标注 Android 2.3.3～14，并在 Android 之外明确列出 iOS：由 Appium WebDriverAgent 支持的设备可进入 UI，支持简单点击、手势、按键和应用安装。[iOS 接入文档](https://github.com/VKCOM/devicehub/blob/master/doc/ios-docs/ios-device.md)要求 macOS/Xcode、WDA、Provisioning Profile、MongoDB，并通过 `ios-provider` 管理设备和端口转发。就官方当前声明的 Android 版本上限而言，DeviceHub 不是 STF 的严格超集。

它还提供[可选 ESP32 控制方案](https://github.com/VKCOM/devicehub/blob/master/doc/ios-docs/esp32.md)，借助 iOS AssistiveTouch 的鼠标/键盘能力改善只靠 WDA REST 手势带来的延迟和限制。这不是免配置功能，需要额外硬件和配对运维。

[v1.5.2 发布说明](https://github.com/VKCOM/devicehub/releases/tag/v1.5.2)显示最近的 iOS 工作包括切换到 npm 版 `appium-webdriveragent`、WDA 签名保存/恢复脚本、设备释放时停止 WDA Session、WDA healthcheck、触摸路径优化和 USB 监听改造。这表明 iOS 不是 README 中的空壳功能，但也说明其稳定性高度依赖 Apple/WDA 工具链。

## 3. 数据库与迁移

STF 官方要求 [RethinkDB ≥ 2.2](https://github.com/DeviceFarmer/stf#requirements)，数据库迁移使用 `stf migrate`。

DeviceHub 把运行数据库换成 MongoDB。其 [MongoDB 文档](https://github.com/VKCOM/devicehub/blob/master/mongo.md)指定 MongoDB 6.0.10 且使用 replica set，并提供：

```bash
stf migrate-to-mongo
```

该命令的[官方实现](https://github.com/VKCOM/devicehub/blob/master/lib/cli/migrate-to-mongo/index.js)从 RethinkDB 读取 `users`、`groups`、`logs`、`stats`、`accessTokens`、`devices`、`vncauth` 七张表，再直接批量插入 MongoDB。

迁移风险需要明确：

- 官方文档只给出迁移命令，没有给出停机窗口、回滚、重复执行、增量同步和迁移后校验方案。
- 从实现看，它是直接读取并 `insertMany` 的一次性搬迁逻辑。应先克隆生产数据做演练，并自行补记录数、关键索引、用户 Token、设备/组关系和预约数据的校验。
- 所有直接查询 RethinkDB 的自研报表、脚本或插件都不能原样复用。

这里的“兼容”主要是业务模型和部分 API 兼容，不是存储层兼容。

## 4. 认证与权限

两者都提供 mock、LDAP、OAuth2、OpenID、SAML2 登录单元，不能把“DeviceHub 有企业认证、STF 没有”作为差异。STF 的 [CLI 源码](https://github.com/DeviceFarmer/stf/tree/master/lib/cli)和 DeviceHub 的 [CLI 文档](https://github.com/VKCOM/devicehub/blob/master/units.md)都能确认这些模式；两者 REST API 都通过 UI 生成的访问令牌调用。

DeviceHub 的增量主要是：

- [认证流程文档](https://github.com/VKCOM/devicehub/blob/master/doc/Auth.md)明确浏览器从 auth 服务取得 JWT 并存入 localStorage；
- CLI 增加 service user 创建能力；
- [组角色文档](https://github.com/VKCOM/devicehub/blob/master/doc/groups/group-roles.md)列出 System Admin、Group Owner、Group Moderator、Regular User，并说明 UI 和 API 的权限检查。

这些增强让 DeviceHub 更适合多个项目组共同使用，但仍不等于完成了强租户隔离。尤其是 STF 官方长期存在的内部进程信任、设备使用后数据清理等风险，DeviceHub 官方材料没有提供足够证据证明已全面消除，生产部署仍需专项安全测试。

## 5. 部署方式

STF 支持 npm 安装、`stf local`、官方 Docker 镜像和多单元正式部署；其[正式部署文档](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)主要讲 systemd + Docker，同时 README 也提供 standalone `docker-compose.yaml`。

DeviceHub 的默认入口更现代：

- [README 快速启动](https://github.com/VKCOM/devicehub#how-to-run)直接使用 `docker-compose-prod.yaml`，并单独提供 macOS Compose；
- [部署总览](https://github.com/VKCOM/devicehub/blob/master/doc/deployment/DEPLOYMENT.md)列出 Docker Compose、legacy systemd 和 Kubernetes Helm；
- [systemd 到 Compose 迁移文档](https://github.com/VKCOM/devicehub/blob/master/doc/deployment/systemd-to-docker.md)给出了原 STF 风格单元到 DeviceHub Compose 服务的映射。

需要注意：两者都不是一个单进程服务。浏览器必须能够访问部分 Provider 地址，ZeroMQ/WebSocket、ADB 端口范围、反向代理和 TLS 仍需完整设计。DeviceHub 只是把常用拓扑模板化，并没有消除分布式设备农场本身的网络复杂度。

## 6. 远控与自动化

两者的 Android 远控能力同源，核心包括设备占用、实时屏幕、触控、键盘、APK/文件、日志、Shell 和远程 ADB。

自动化方面也要保持边界：

- STF 的 [API 文档](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md)允许脚本占用设备并取得远程 ADB 地址，还链接了外部 Appium 示例。
- DeviceHub 另外提供[统一 Appium 设备申请 API](https://github.com/VKCOM/devicehub/blob/master/doc/howto/HowToUseDevicesForAppium.md)：通过 `/api/v1/autotests` 按平台、数量、型号、SDK 等条件申请和释放设备，Android 返回 ADB `remoteConnectUrl`，iOS 返回 WDA `remoteConnectUrl`，再交给外部 Appium Grid；其[官方 releases](https://github.com/VKCOM/devicehub/releases)也记录 1.4.6 加入 iOS WebDriver remote connect 和 JWT Token。
- 两者都没有 Sonic 那种完整的测试用例、套件、定时任务、结果报告和版本管理中心。它们提供“设备池 + 远程控制 + 自动化接入点”，真正的 Appium 用例编排、CI 和报告仍要外接。

所以，若需求核心是 Android/iOS 远程设备门户和跨平台设备自动分配，DeviceHub 更完整；若需求核心是企业自动化测试管理，两者都只是底座，不能因支持 Appium 就视为完整测试平台。

## 7. 维护活跃度

截至 2026-09-22：

- STF 的 [`package.json`](https://github.com/DeviceFarmer/stf/blob/master/package.json)版本是 3.7.9；[`CHANGELOG.md`](https://github.com/DeviceFarmer/stf/blob/master/CHANGELOG.md)记录 3.7.9 于 2026-07-08 发布；默认分支最新提交为 [2026-09-22](https://github.com/DeviceFarmer/stf/commit/714180043772518fabf3e26c28e8b77dd490d2a8)。
- DeviceHub 最新 release 是 [v1.5.2，2026-02-28](https://github.com/VKCOM/devicehub/releases/tag/v1.5.2)；默认分支最新提交为 [2026-03-25](https://github.com/VKCOM/devicehub/commit/fd1eee5878b71bf72a66c7fef953fa1e85918e7c)。

两边都不能归为停止维护，但活跃节奏不同：STF 当前提交和版本更新更近；DeviceHub 2026 年的发布工作集中在 Apple/WDA 链路。选择 DeviceHub 时应重点验证目标 iOS/Xcode/WDA 组合，不要只按“支持 iOS”三个字判断成熟度。

## 8. 从 STF 迁移到 DeviceHub 的兼容性判断

### 可以复用的部分

- 团队对 STF 的设备、用户、分组、预约和 Provider 架构知识；
- 大量 `stf` CLI 名称和 `STF_*` 配置习惯；
- 设备占用/释放、远程 ADB等核心 REST API 调用；
- Android 设备接入、ADB、minicap/minitouch 类运维经验；
- 多进程、ZeroMQ、WebSocket、反向代理的网络模型。

### 必须迁移或重新验证的部分

- RethinkDB 到 MongoDB replica set 的数据搬迁、索引、备份和恢复；
- 镜像、Compose/Helm、服务名、内部地址和端口配置；
- 自研 RethinkDB 查询、数据库报表和数据库级插件；
- 登录回调、JWT、Token、service user 和组权限；
- 前端白标、自研补丁以及与上游 STF 的后续合并策略；
- iOS 的 Mac、Xcode、WDA、Provisioning Profile、USB/端口转发和健康检查。

### 迁移结论

**API/业务模型兼容度：中高；部署兼容度：中；数据库兼容度：低；自定义补丁兼容度：取决于改动层次。**

推荐采用并行迁移，而不是覆盖升级：

1. 用生产数据副本执行 `stf migrate-to-mongo`，完成表记录、关系、Token 和设备状态校验。
2. 先只接少量 Android 设备，验证既有 API、远程 ADB、预约和认证。
3. 再加入 iOS Provider，单独验证签名、WDA 重启、长时间串流和断线恢复。
4. 新旧平台并行一段时间，冻结写入后做最终数据迁移，再切换入口。
5. 保留 RethinkDB 和旧 STF 的可回退窗口，确认无回滚需求后再退役。

## 9. 许可证

两者根仓库都是 Apache License 2.0：

- [DeviceFarmer/STF LICENSE](https://github.com/DeviceFarmer/stf/blob/master/LICENSE)
- [VK DeviceHub LICENSE](https://github.com/VKCOM/devicehub/blob/master/LICENSE)

因此二者都可以免费自部署、修改和二次分发，但需要遵守 Apache-2.0 的版权、许可证和 NOTICE 等要求，并对打包使用的第三方依赖单独核验。DeviceHub 许可证中保留了 OpenSTF、Orange、Zebrunner、VK 等版权声明，也进一步印证其继承链。本文不构成法律意见。

## 一手来源索引

1. [DeviceFarmer/STF 官方仓库](https://github.com/DeviceFarmer/stf)
2. [STF README](https://github.com/DeviceFarmer/stf/blob/master/README.md)
3. [STF CHANGELOG](https://github.com/DeviceFarmer/stf/blob/master/CHANGELOG.md)
4. [STF API 文档](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md)
5. [STF 部署文档](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)
6. [STF LICENSE](https://github.com/DeviceFarmer/stf/blob/master/LICENSE)
7. [VK DeviceHub 官方仓库](https://github.com/VKCOM/devicehub)
8. [DeviceHub README](https://github.com/VKCOM/devicehub/blob/master/README.md)
9. [DeviceHub releases](https://github.com/VKCOM/devicehub/releases)
10. [DeviceHub MongoDB 与迁移文档](https://github.com/VKCOM/devicehub/blob/master/mongo.md)
11. [DeviceHub RethinkDB→MongoDB 迁移实现](https://github.com/VKCOM/devicehub/blob/master/lib/cli/migrate-to-mongo/index.js)
12. [DeviceHub iOS 接入文档](https://github.com/VKCOM/devicehub/blob/master/doc/ios-docs/ios-device.md)
13. [DeviceHub ESP32 iOS 控制文档](https://github.com/VKCOM/devicehub/blob/master/doc/ios-docs/esp32.md)
14. [DeviceHub Appium 使用文档](https://github.com/VKCOM/devicehub/blob/master/doc/howto/HowToUseDevicesForAppium.md)
15. [DeviceHub CLI/认证单元文档](https://github.com/VKCOM/devicehub/blob/master/units.md)
16. [DeviceHub 组角色文档](https://github.com/VKCOM/devicehub/blob/master/doc/groups/group-roles.md)
17. [DeviceHub 部署总览](https://github.com/VKCOM/devicehub/blob/master/doc/deployment/DEPLOYMENT.md)
18. [DeviceHub systemd→Compose 迁移文档](https://github.com/VKCOM/devicehub/blob/master/doc/deployment/systemd-to-docker.md)
19. [DeviceHub LICENSE](https://github.com/VKCOM/devicehub/blob/master/LICENSE)
