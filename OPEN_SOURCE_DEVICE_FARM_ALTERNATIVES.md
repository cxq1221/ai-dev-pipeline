# 开源免费云真机／移动设备农场项目调研

> 调研日期：2026-09-21（Asia/Shanghai）  
> 参照对象：[Sonic 云真机平台](https://github.com/SonicCloudOrg)  
> 筛选口径：必须能够免费自部署；优先完整开源项目。只引用项目官方仓库、官方文档、官方发布记录等一手来源。

## 结论先行

如果目标是找一个可以替代 Sonic、继续做企业内部二开的“完整开源免费底座”，没有一个候选在所有维度上无损替代 Sonic。较务实的选择是按使用重心分四条路线：

1. **Android + iOS、浏览器人工远控优先**：首选验证 [VK DeviceHub](https://github.com/VKCOM/devicehub)。它是 DeviceFarmer/STF 的现代企业 fork，Apache-2.0，完整保留设备池、用户、分组、预约和多 Provider，并增加 iOS/WDA、MongoDB、Docker/Helm 等能力；2026 年仍有维护提交。它当前最接近“完整开源免费、可自部署、双端远控”的 Sonic 替代品。
2. **Android + iOS、人工远控 + Appium 自动化整套生态都要**：验证 [Zebrunner MCloud](https://github.com/zebrunner/mcloud)。它是 Apache-2.0 代码体系，明确支持 Android/iOS 真机、浏览器远控和 Appium，架构也包含中心端、设备 Agent、Grid。不过其顶层仓库和 Agent 的最近正式发布停留在 2024 年，且基于 OpenSTF，多组件集成和持续维护成本不可低估。
3. **Android 远控和设备共享是核心**：优先看 [DeviceFarmer/STF](https://github.com/DeviceFarmer/stf)。它功能成熟、Apache-2.0、截至本次调研仍有 2026 年提交，最适合做 Android 设备池、浏览器远控、预约和远程 ADB；但官方明确把 iOS 支持列为长期目标，而且对进程间通信、设备数据清理和恶意多用户隔离给出了安全警告。
4. **跨 Android/iOS 的自动化设备调度是核心，人工远控不是刚需**：优先看 [Appium Device Farm](https://github.com/AppiumTestDistribution/appium-device-farm)。它活跃、Apache-2.0，支持 Android/iOS/tvOS、Hub/Node、用户/团队和访问密钥；但 **12.0.0 起已经移除实时画面和人工控制**，因此不能直接当成 Sonic 式云真机门户。

[GADS](https://github.com/shamanec/GADS) 在功能上反而很接近“Android/iOS + 远控 + Appium + 多 Provider + Workspace”，而且 2026 年仍活跃；但它不是完整开源：后端等代码使用 AGPL-3.0，`hub-ui` 使用限制修改、衍生和再分发的专有许可证。因此本次按“开源免费”的要求将它排除，不列入推荐。

## 免费与开源分类

“仓库可见”或“可以免费下载使用”不等于“完整开源、适合白标二开”。本报告按以下三类区分：

| 分类 | 项目 | 判断 |
| --- | --- | --- |
| **完整开源，可免费自部署** | VK DeviceHub、DeviceFarmer/STF、Appium Device Farm、ATXServer2、Dogu | 仓库代码使用 Apache-2.0、MIT 或 AGPL-3.0；仍需遵守许可证和第三方依赖义务 |
| **开源自部署体系，但需逐组件核验** | Zebrunner MCloud | README 明确声明代码为 Apache-2.0，主体可免费自部署；它由多个仓库和镜像组成，落地前应对实际采用的组件、镜像和 Zebrunner CE/PRO 集成逐项做许可证清单 |
| **核心开源，但 UI 专有／只是允许使用** | GADS | 除列明组件外为 AGPL-3.0；`hub-ui` 是专有组件，只允许在条款内使用，不允许修改、制作衍生品或再分发，不符合“完整开源白标二开”要求 |

免费自部署仍会产生硬件、USB 集线器、Mac/Xcode、Apple Developer 签名、运维和安全加固成本；“免费”不等于零成本。

## 能力对比

符号说明：✅ 项目官方明确提供；△ 能通过外部组件或有限方式实现，但不是完整原生能力；— 官方未提供或已移除。

| 项目 | 平台完整度 | Android | iOS | 浏览器人工远控 | 自动化 | 分布式/多节点 | 多用户/权限 | 维护状态（截至 2026-09-21） | 许可证与二开结论 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| [VK DeviceHub](https://github.com/VKCOM/devicehub) | 完整 Web 设备管理与远控平台，STF 的现代 fork | ✅ | ✅ WDA；另有 ESP32 控制方案 | ✅ | △ 支持远程 ADB、iOS WebDriver/Appium 连接；不是 Sonic 式用例编排中心 | ✅ 沿用多进程/Provider，并提供 Docker/Helm | ✅ 用户、管理员、分组、预约、配额，并有 JWT/OpenID 等能力 | 默认分支最后提交为 [2026-03-25](https://github.com/VKCOM/devicehub/commit/fd1eee5878b71bf72a66c7fef953fa1e85918e7c)，官方 release 已到 v1.5.2 | [Apache-2.0](https://github.com/VKCOM/devicehub/blob/master/LICENSE)；**双端远控纯开源首选** |
| [Zebrunner MCloud](https://github.com/zebrunner/mcloud) | 完整设备农场生态 | ✅ | ✅ | ✅ | ✅ Appium/Grid | ✅ master + agent + device/grid | △ 基于 STF/CE；快速部署默认 `auth-mock`，生产认证需另配 | 顶层仓库最后提交为 [2024-10-15](https://github.com/zebrunner/mcloud/commit/8564d1c9b75bfd811d723fa31cc9a8ee29bc7fb3)，Agent 最新官方 release 为 [3.0.2 / 2024-12-03](https://github.com/zebrunner/mcloud-agent/releases/tag/3.0.2) | README 声明代码 Apache-2.0；**人工 + 自动化整套候选，必须先做组件许可证、iOS 和认证 PoC** |
| [DeviceFarmer/STF](https://github.com/DeviceFarmer/stf) | 完整 Android 远控/共享平台；不是一体化测试管理平台 | ✅ | — | ✅ | △ REST API 可与 Appium 集成，不内置 Sonic 式用例编排 | ✅ 多进程、多 Provider；有官方[部署文档](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md) | ✅ 管理员、用户、分组、预约、配额；但安全隔离较弱 | [2026-09-19 仍有提交](https://github.com/DeviceFarmer/stf/commit/69885440ee0e33268d75db15d69b6addfa545267)；README 称持续维护但进度较慢 | [Apache-2.0](https://github.com/DeviceFarmer/stf/blob/master/LICENSE)；**Android-only 二开首选** |
| [Appium Device Farm](https://github.com/AppiumTestDistribution/appium-device-farm) | 完整的 Appium 设备分配/自动化平台；不是当前版人工云真机 | ✅ | ✅ | —（12.0.0 起移除） | ✅ 核心能力 | ✅ Hub/Node | ✅ 10.0.0 起用户、团队、访问密钥 | [12.0.1 发布提交，2026-07-25](https://github.com/AppiumTestDistribution/appium-device-farm/commit/fb0e2b5c8610c4a689950cd1774c3c1f6a13237b) | [Apache-2.0](https://github.com/AppiumTestDistribution/appium-device-farm/blob/main/LICENSE)；**自动化优先时适合二开** |
| [ATXServer2](https://github.com/openatx/atxserver2) | 设备管理和远控平台，测试管理较轻 | ✅ | ✅（需独立 provider） | ✅ | △ 提供 API/示例，不是完整测试编排 | ✅ Server + Provider | △ 简单/GitHub/OpenID 登录；私有设备 Beta 且只实现 Android | README 明示“[项目已经不开发了](https://github.com/openatx/atxserver2/blob/master/README.md)”；2026-03-23 仅见依赖/启动方式更新 | [MIT](https://github.com/openatx/atxserver2/blob/master/LICENSE)；**适合读代码和快速 PoC，不建议新生产平台押注** |
| [Dogu](https://github.com/dogu-team/dogu) | 官方定位为设备农场 + Device Studio + Test CI + 报告 | ✅ | ✅ | ✅ | ✅ Appium/Selenium/Playwright、并行/定时 | ✅ 官方架构包含远端执行 | ？ 官方首页未清楚说明足够的租户/权限边界 | 默认分支最后提交为 [2024-07-01](https://github.com/dogu-team/dogu/commit/80ecbca9952a94f7ef6361aa02dd46d2ce60954f)，README 同时写着正在准备重新开源构建 | [AGPL-3.0](https://github.com/dogu-team/dogu)；**功能面广但维护连续性不明，只建议隔离 PoC** |

## 分层推荐

### 第一层：优先做 PoC

#### 1. VK DeviceHub：双端远控的纯开源首选

官方明确说明 VK DeviceHub 是 [DeviceFarmer/STF 的 fork](https://github.com/VKCOM/devicehub)，在成熟的 STF 设备列表、远控、用户、分组、预约和 Provider 架构上增加了 iOS。iOS 设备通过 Appium WebDriverAgent 进入 UI，可完成画面、简单点击/手势、按键和应用安装；[v1.5.2 发布说明](https://github.com/VKCOM/devicehub/releases/tag/v1.5.2)还记录了 WDA 生命周期、健康检查、触控和 Apple 设备释放流程的优化。仓库同时提供 Docker Compose，发布记录包含 Helm、JWT、OpenID 和 iOS WebDriver 远程连接。

适合：希望获得类似 STF/Sonic 的浏览器设备门户，同时必须覆盖 Android 和 iOS，并要求代码和 UI 都能合法二开的团队。

主要风险：

- iOS 仍依赖 macOS、Xcode、WDA 和开发者签名；官方文档要求配置 provisioning profile，不能把“支持 iOS”理解为免运维。
- 基于 STF 的架构仍需重新做跨团队安全审查；不能因为增加了 JWT/OpenID 就推定内部进程通信和设备数据清理问题全部消失。
- 它偏设备远控和共享，不是 Sonic 式内置测试用例、套件、报告和任务编排平台；自动化管理层仍需对接 Appium/CI 或自研。

#### 2. Zebrunner MCloud：人工 + 自动化整套双端生态

官方 README 明确把它定义为支持 Android/iOS 物理设备、人工 Web 访问和 Appium 自动化的 Device Farm，并列出了 `mcloud-agent`、`mcloud-device`、`mcloud-grid`、增强 Appium 镜像等组件。它建立在 OpenSTF 之上，并增加了 iOS 远控和自动化链路。

适合：需要同时覆盖 Android/iOS、人工调试和自动化，能承担多组件部署与维护的团队。

主要风险：

- 顶层主仓和 Agent 正式发布已两年左右没有更新，不能只看 Zebrunner 组织其他仓库近期有活动就认定 MCloud 主链路仍持续演进。
- 快速部署使用 `auth-mock`；多团队生产环境必须验证真实认证、授权、设备占用隔离和审计。
- iOS 依赖 Mac、Xcode/WDA、签名和特定版本组合，必须拿目标 iOS 版本和真实设备做稳定性测试。
- 多仓库/镜像组合意味着许可证、SBOM、漏洞修复和升级兼容需要逐组件负责。

#### 3. DeviceFarmer/STF：Android 远控设备池首选

STF 官方 README 提供实时画面、触控、文件/应用管理、远程 ADB、设备分组、预约、用户和配额；官方部署文档展示了 processor、provider 等独立进程和横向部署方式。官方 API 文档还给出了通过令牌预约设备并配合 Appium 的方案。

适合：Android 真机数量较多，核心是浏览器调试、共享、预约、资产管理和远程 ADB。

主要风险：

- 官方明确只有 Android；iOS 仍是长期目标。
- 它不是 Sonic 那种内置测试用例、套件、结果和定时任务的一体化平台，自动化需要外接 Appium/CI。
- [官方安全说明](https://github.com/DeviceFarmer/stf#A-quick-note-about-security)明确指出内部进程间缺少加密、设备使用后不会完整清除用户数据，且了解内部机制的恶意用户可能越过占用控制。跨团队上线前必须做网络隔离、强认证、代理层 TLS、设备清理和授权改造。

#### 4. Appium Device Farm：自动化设备池首选

它本质上是 Appium 2 插件，负责发现/分配 Android、iOS、tvOS 真机与模拟器，支持并行会话、Dashboard、日志/录像和 Hub/Node。官方 README 还说明 10.0.0 以后加入用户/团队管理和访问密钥认证。

适合：主要目标是 CI/CD 中的 Appium 自动化、设备调度和并行执行。

主要风险：

- [官方 12.0.0 说明](https://github.com/AppiumTestDistribution/appium-device-farm#-breaking-changes---version-1200)明确移除了设备直播和人工交互。继续停留在 11.x 会承担旧分支安全与兼容维护；升级 12.x 则要自行补远控。
- 它是 Appium 插件和自动化设备池，不是 Sonic 式测试管理门户；测试用例管理、报告治理和人工调试体验需要另建。

### 排除项：不是完整开源

#### GADS：功能最像，但关键 UI 闭源

GADS 官方功能表包含 Android/iOS 远控、Appium、Hub/Provider、JWT/OAuth2、管理员和 Workspace 访问控制，技术形态很适合做现代化 PoC。问题不在功能，而在许可边界：

- [`LICENSE-OVERVIEW.txt`](https://github.com/shamanec/GADS/blob/master/LICENSE-OVERVIEW.txt)说明除专有组件外使用 AGPL-3.0；
- [`PROPRIETARY-LICENSE.txt`](https://github.com/shamanec/GADS/blob/master/PROPRIETARY-LICENSE.txt)明确把 `hub-ui` 列为专有软件，并限制复制、修改、衍生和再分发；
- README 也说明 UI 源码不可查看、不可修改，只提供混淆后的预构建产物。

因此本次按用户“开源免费”的要求将其从推荐清单排除。若只是内部免费使用现成 UI，可以依法务确认后试用；若目标是换品牌、深度改 UI、形成自有产品或对外分发，不能把它当完整开源底座。可行替代是只复用 AGPL 后端并完全自研 UI，但这会显著增加工作量，同时要评估 AGPL 网络服务义务。

#### OpenSTF：不要与 DeviceFarmer/STF 重复计数

[OpenSTF 原仓库](https://github.com/openstf/stf)已明确停止主动开发，并指向 DeviceFarmer 继续维护。它是 DeviceFarmer/STF 的旧身份，不是另一个应该新立项的候选；搜索到的旧 OpenSTF 教程、镜像名和部署文档也要先换成 DeviceFarmer 的现行坐标。

### 第三层：仅作为参考或隔离验证

- **ATXServer2**：MIT、结构轻、Android/iOS 远控链路清楚，适合研究 provider、设备占用和 uiautomator2 集成；但项目自己声明停止开发，私有设备分组也仅 Android Beta，不宜作为新生产平台长期基座。
- **Dogu**：功能宣传覆盖设备农场、远控、自动化 CI 和报告，AGPL-3.0 也属于开源许可证；但默认分支自 2024-07-01 后无提交，且官方 README 写着正在准备重新开源构建。当前更像待验证项目，不应在未完成源码可构建性、部署文档、升级路径和权限模型验证前立项。

## 不应误当成完整平台的开源组件

以下项目很重要，也都可能出现在上述平台内部，但它们本身不是完整云真机/设备农场：

| 组件 | 实际定位 | 为什么不能单独等同于平台 |
| --- | --- | --- |
| [Genymobile/scrcpy](https://github.com/Genymobile/scrcpy) | Android 画面与控制 | 没有设备池、用户、预约、租户、自动化编排和中心管理 |
| [Appium](https://github.com/appium/appium) | 跨平台 UI 自动化服务器/协议生态 | 不负责完整设备资产池、人工远控门户和租户治理 |
| [Selenium Grid](https://github.com/SeleniumHQ/selenium) | WebDriver 会话路由和并行执行 | 不是移动设备远控或设备生命周期平台 |
| [Appium/WebDriverAgent](https://github.com/appium/WebDriverAgent) | iOS 自动化桥接 | 只解决 iOS 设备上的自动化/交互通道 |
| [danielpaulus/go-ios](https://github.com/danielpaulus/go-ios) | 与 iOS 设备通信的底层工具 | 没有平台 UI、资源调度、用户和测试管理 |
| [DeviceFarmer/minicap](https://github.com/DeviceFarmer/minicap)、[minitouch](https://github.com/DeviceFarmer/minitouch) | Android 投屏、触控底层组件 | 是 STF 等平台的能力零件，不是完整产品 |
| [remote-android/redroid-doc](https://github.com/remote-android/redroid-doc) | 容器化 Android 运行环境 | 提供虚拟 Android 实例，不等同于带租户、远控和自动化管理的设备云平台 |

## 建议的 PoC 顺序

如果要选型，建议不要只看截图，直接用目标设备做四轮验证：

1. **双端远控路线**：VK DeviceHub 接 2 台 Android + 2 台 iPhone，验证 WDA 签名/重启、8 小时连续远控、断线重连、跨 Provider、分组预约和真实认证。
2. **双端人工 + 自动化路线**：MCloud 使用同一批设备验证远控和并发 Appium，并检查 auth-mock 替换、镜像版本锁定和各组件许可证。
3. **Android 专项路线**：STF 接真实 USB Hub 和计划规模的 Android 设备，验证 ADB 稳定性、画面帧率、跨 Provider 调度、账号隔离和每次使用后的数据清理。
4. **自动化路线**：Appium Device Farm 12.x 验证 Hub/Node、并行调度、团队/密钥、日志录像；若仍要人工远控，单独估算自研 scrcpy/WebRTC 门户的成本，不要以 11.x 长期冻结代替架构决策。

通过门槛至少应包括：目标 Android/iOS 版本兼容、24～72 小时稳定性、设备断电/拔插自恢复、权限绕过测试、清理机制、审计日志、许可证/SBOM、备份升级和故障恢复。最终选型前应由法务审查 AGPL 和混合许可，由安全团队审查设备数据残留、内部明文通信和远程调试暴露面。

## 一手来源

1. [VK DeviceHub 官方仓库及 README](https://github.com/VKCOM/devicehub)
2. [VK DeviceHub 官方 iOS 接入文档](https://github.com/VKCOM/devicehub/blob/master/doc/ios-docs/ios-device.md)
3. [VK DeviceHub 官方 releases](https://github.com/VKCOM/devicehub/releases)
4. [VK DeviceHub 官方许可证](https://github.com/VKCOM/devicehub/blob/master/LICENSE)
5. [Zebrunner MCloud 官方仓库及 README](https://github.com/zebrunner/mcloud)
6. [Zebrunner MCloud Agent 官方 releases](https://github.com/zebrunner/mcloud-agent/releases)
7. [DeviceFarmer/STF 官方仓库及 README](https://github.com/DeviceFarmer/stf)
8. [STF 官方部署文档](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)
9. [STF 官方 REST API 文档](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md)
10. [Appium Device Farm 官方仓库及 README](https://github.com/AppiumTestDistribution/appium-device-farm)
11. [Appium Device Farm 官方许可证](https://github.com/AppiumTestDistribution/appium-device-farm/blob/main/LICENSE)
12. [GADS 官方仓库及 README](https://github.com/shamanec/GADS)
13. [GADS 官方许可总览](https://github.com/shamanec/GADS/blob/master/LICENSE-OVERVIEW.txt)
14. [GADS `hub-ui` 专有许可证](https://github.com/shamanec/GADS/blob/master/PROPRIETARY-LICENSE.txt)
15. [ATXServer2 官方仓库及 README](https://github.com/openatx/atxserver2)
16. [ATXServer2 Android Provider 官方仓库](https://github.com/openatx/atxserver2-android-provider)
17. [ATXServer2 iOS Provider 官方仓库](https://github.com/openatx/atxserver2-ios-provider)
18. [Dogu 官方仓库及 README](https://github.com/dogu-team/dogu)
