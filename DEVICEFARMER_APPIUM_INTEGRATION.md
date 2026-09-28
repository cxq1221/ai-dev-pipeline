# DeviceFarmer/STF 外接 Appium 2 实施指南

> 调研日期：2026-09-24  
> 资料边界：仅使用 DeviceFarmer/STF 官方 API 文档及其链接的官方示例，以及 Appium 官方文档、官方驱动仓库和官方 Python Client。  
> 配套示例：[stf_appium2_runner.py](./stf_appium2_runner.py)

## 1. 结论

STF 不直接执行 Appium 用例。正确集成方式是：**STF 负责设备库存、独占租约和远程 ADB；Appium 2 连接这个 ADB 目标并负责自动化会话**。

```text
CI / Python Runner
  ├─ HTTPS + Bearer Token ──> STF API
  │    查询 → 占用 → remoteConnect → 释放
  ├─ adb connect ────────────> STF Provider 返回的 host:port
  └─ WebDriver ──────────────> Appium 2 :4723
                                  └─ UiAutomator2 → 同一个 ADB host:port
```

STF 官方 API 文档明确提供设备占用、释放和远程 ADB 接口，并链接了一个 Appium 集成示例。该示例把 `remoteConnectUrl` 写入 `UDID`，证明 Appium 应选择网络 ADB 标识 `host:port`，而不是 STF 的物理序列号。[STF API](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md) · [STF Appium Example](https://github.com/openstf/stf-appium-example)

官方示例停留在 Appium 1、Ruby 和 2017 年依赖，流程仍有参考价值，但不应原样用于 Appium 2。本报告配套脚本已按 Appium 2 的根路径、扩展驱动和 Python Options API 改写。

## 2. 端到端流程

### 步骤 1：准备 STF access token

在 STF UI 的 **Settings > Keys** 创建 access token。官方文档说明 token 只显示一次，后续每个 API 请求都带：

```http
Authorization: Bearer <STF_TOKEN>
```

不要把 token 写进代码、镜像、命令行历史或测试报告；通过 CI Secret 注入。[STF API Authentication](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md#authentication)

### 步骤 2：查询并校验设备

```http
GET /api/v1/devices/{serial}?fields=serial,present,ready,using,owner
```

只有 `present=true`、`ready=true`、未被使用且没有 owner 的设备才应尝试占用。这个 GET 只是预检查：查询完成后设备仍可能被其他任务抢走，真正的并发判定必须以占用 POST 的结果为准。[GET device](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md#get-devicesserial)

### 步骤 3：占用设备

```http
POST /api/v1/user/devices
Content-Type: application/json

{"serial":"<DEVICE_SERIAL>","timeout":1800000}
```

`timeout` 单位是毫秒，表示设备空闲达到该时长后自动从用户控制中移除；省略时使用 Provider group timeout。STF 官方示例使用 `900000`（15 分钟）。生产应按最大任务时长留足余量，并通过 PoC 验证 Appium 活动是否符合本部署对“空闲”的判定。[API payload schema](https://github.com/DeviceFarmer/stf/blob/master/lib/units/api/swagger/api_v1.yaml) · [API example](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md#post-userdevices)

### 步骤 4：开启远程 ADB

```http
POST /api/v1/user/devices/{serial}/remoteConnect
```

成功响应中的 `remoteConnectUrl` 类似：

```json
{
  "success": true,
  "remoteConnectUrl": "10.0.20.15:7412",
  "serial": "ABC123"
}
```

调用前应把测试 Worker 的 ADB 公钥加入 STF；否则首次连接可能进入 `unauthorized`。官方允许在 Settings 页面添加 ADB key，或在 UI 占用设备时确认设备上的授权弹窗。[remoteConnect](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md#post-userdevicesserialremoteconnect)

### 步骤 5：建立并验证 ADB

```bash
adb connect 10.0.20.15:7412
adb -s 10.0.20.15:7412 get-state
```

第二条命令应返回 `device`。Appium 进程必须能看到这同一条 ADB 连接：

- Appium 与 Python Runner 同机运行时，默认共享本机 ADB server。
- Appium 在容器或另一台机器时，应在 Appium 所在环境执行 `adb connect`，或显式共享同一个 ADB server；只在 CI Runner 主机执行连接而 Appium 位于隔离容器，Appium通常看不到设备。

### 步骤 6：创建 Appium 2 会话

最小 capability：

```json
{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "appium:udid": "10.0.20.15:7412",
  "appium:newCommandTimeout": 300,
  "appium:app": "/absolute/path/on-appium-host/app.apk"
}
```

关键点：

- `appium:udid` 必须用 `adb devices -l` 中显示的网络目标，即 STF 返回的 `remoteConnectUrl`。官方 UiAutomator2 文档要求真实设备并行测试始终显式设置 `udid`。[UiAutomator2 capabilities](https://github.com/appium/appium-uiautomator2-driver#capabilities)
- `appium:automationName` 为 `UiAutomator2`。[Appium 2 driver docs](https://appium.io/docs/en/2.19/ecosystem/drivers/)
- `appium:app` 是 **Appium Server 所在机器** 可访问的绝对路径，也可改用 `appium:appPackage` + `appium:appActivity` 操作预装应用。[Capability sets](https://github.com/appium/appium-uiautomator2-driver/blob/master/docs/capability-sets.md)
- Appium 2 默认地址是 `http://127.0.0.1:4723`，不再默认使用 Appium 1 的 `/wd/hub`；只有服务端显式以 `--base-path=/wd/hub` 启动时客户端才加旧路径。[Migrating to Appium 2](https://appium.io/docs/en/2.3/guides/migrating-1-to-2/)

### 步骤 7：运行用例

配套脚本建立会话后读取窗口尺寸，并可保存截图，作为最小冒烟验证。实际项目应替换为 pytest/unittest 用例；Appium 官方 Python 示例使用 `UiAutomator2Options().load_capabilities(...)` 和 `webdriver.Remote(...)`，并在 teardown 中调用 `driver.quit()`。[Appium Python quickstart](https://appium.io/docs/en/2.7/quickstart/test-py/) · [Python Client](https://github.com/appium/python-client)

### 步骤 8：无条件清理

无论测试成功、断言失败、ADB 超时还是 Appium 建连失败，都按以下顺序 best effort 清理：

1. `driver.quit()` 关闭 Appium session。
2. `adb disconnect <remoteConnectUrl>` 清理 Worker 的本地 ADB 记录。
3. `DELETE /api/v1/user/devices/{serial}/remoteConnect` 关闭 STF 远程调试连接。
4. `DELETE /api/v1/user/devices/{serial}` 释放设备租约。

每一步都独立捕获错误，不能让前一步失败阻止后续释放。STF 官方分别提供 remote disconnect 和 release 接口；release 相当于 UI 的 “Stop using”。[remote disconnect](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md#delete-apiv1userdevicesserialremoteconnect) · [release](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md#delete-userdevicesserial)

## 3. Appium 2 安装与运行

当前 UiAutomator2 Driver 官方仓库说明：从 `5.0.0` 起只兼容 Appium 3。因此固定在 Appium 2 时不能无版本安装当前最新驱动；以下组合按 2026-09-24 官方 npm 包元数据固定为 Appium 2 最后版本和 UiAutomator2 4.x 最后版本：[UiAutomator2 README](https://github.com/appium/appium-uiautomator2-driver#readme)

```bash
npm install -g appium@2.19.0
appium driver install uiautomator2@4.2.9
appium driver doctor uiautomator2

python3 -m venv .venv
source .venv/bin/activate
python -m pip install requests Appium-Python-Client

# 本机专用 Worker 建议只监听 loopback
appium --address 127.0.0.1 --port 4723
```

Appium 2 只安装 Server，不再自动捆绑所有驱动，必须通过 Extension CLI 安装 UiAutomator2。[Appium 2 migration](https://appium.io/docs/en/2.3/guides/migrating-1-to-2/) · [UiAutomator2 install](https://appium.io/docs/en/2.15/quickstart/uiauto2-driver/)

## 4. Python 可运行示例

完整脚本位于 [stf_appium2_runner.py](./stf_appium2_runner.py)，使用方式：

```bash
export STF_URL='https://stf.example.internal'
export STF_TOKEN='<从 CI Secret 注入>'
export DEVICE_SERIAL='ABC123'
export APPIUM_URL='http://127.0.0.1:4723'

# 方案 A：安装 APK。路径必须对 Appium Server 可见。
export APP_PATH='/absolute/path/to/app-debug.apk'

# 方案 B：操作预装应用；使用时不要设置 APP_PATH。
# export APP_PACKAGE='com.example.app'
# export APP_ACTIVITY='.MainActivity'

export STF_LEASE_TIMEOUT_MS='1800000'
export APPIUM_NEW_COMMAND_TIMEOUT_SEC='300'
export SCREENSHOT_PATH='./stf-appium-smoke.png'

python stf_appium2_runner.py
```

脚本实现了完整生命周期：token 请求、设备查询、占用、`remoteConnect`、`adb connect`/状态验证、以远程地址作为 `udid` 创建 Appium 会话，以及 `finally` 中的四级清理。它不会打印 token，也不会在查询阶段把设备“可用”误当成已经成功获得租约。

## 5. 网络与端口

| 流向 | 典型端口 | 要求 |
|---|---:|---|
| Runner → STF Web/API | Compose 为 `7100`；生产通常由反向代理暴露 `443` | 使用 HTTPS + Bearer token |
| Runner/Appium Worker → STF Provider | 以 `remoteConnectUrl` 返回值为准 | 只允许测试 Worker 网段访问 |
| Client/Runner → Appium Server | 默认 `4723` | 优先 loopback 或受控内网，不直接公网暴露 |

STF Provider 默认设备 Worker 端口范围为 `7400–7700`；官方 Compose 缩为 `7400–7500`，部署示例也展示了自定义 `15000–25000`。因此防火墙不能只写死一个端口，必须与各 Provider 的 `--min-port/--max-port` 一致，且 `--public-ip` 返回的地址必须可从 Appium Worker 路由到达。[Provider CLI](https://github.com/DeviceFarmer/stf/blob/master/lib/cli/provider/index.js) · [Compose guide](https://github.com/DeviceFarmer/stf/blob/master/docker/compose/README.md) · [Deployment](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)

不要向 Runner 暴露 RethinkDB、ZeroMQ 等 STF 内部端口；API 和 Provider 设备端口已足够。

## 6. 并发设计

1. **以占用 POST 为准**：`GET device` 与 `POST reserve` 之间存在竞争窗口；POST 失败就换另一台设备或进入调度重试，不能继续 `remoteConnect`。
2. **一台设备一个活跃任务**：控制服务以 STF serial 为键持有外部租约/锁，并记录 `runId → serial → remoteConnectUrl`。
3. **始终指定 `appium:udid`**：否则 UiAutomator2 可能选择 ADB 列表中的第一台设备。
4. **同一 Appium 主机并行**：给每个会话分配唯一 `appium:systemPort`；如果测试 Chrome/WebView，再分配唯一 `appium:chromedriverPort`；使用 MJPEG 时再分配唯一 `appium:mjpegServerPort`。UiAutomator2 官方说明默认 `systemPort` 从 `8200–8299` 寻找空闲端口，但并行场景建议显式指定。[UiAutomator2 parallel tests](https://github.com/appium/appium-uiautomator2-driver#parallel-tests) · [Capabilities](https://github.com/appium/appium-uiautomator2-driver#capabilities)
5. **不要在并发 Server 上开 `--session-override`**：它会用新会话覆盖旧会话；官方仅建议在非并发场景考虑使用。
6. **避免同一 STF 用户/token 对同一 serial 并发**：STF ownership 是用户级，不是 run 级。HTTP 响应超时时，清理程序无法仅凭 ownership 判断是哪一个 run 占用的；必须由外部调度器对 serial 加锁，或为隔离域使用不同 STF 用户身份。

配套脚本允许加入以下 capability（示例）：

```python
capabilities.update({
    "appium:systemPort": 8217,
    "appium:chromedriverPort": 9517,
    "appium:mjpegServerPort": 9117,
})
```

端口应由 Worker 的端口分配器生成，而不是在所有并发任务中写同一个常量。

## 7. 超时与失败恢复

需要区分四类超时：

| 超时 | 单位 | 作用 | 建议 |
|---|---:|---|---|
| STF `timeout` | 毫秒 | 设备空闲后自动移出用户控制 | 大于正常测试上限并留清理余量 |
| `appium:newCommandTimeout` | 秒 | 客户端长时间没有发新命令时删除 Appium session；UiAutomator2 默认 60 秒 | 长步骤要调大，但不要设为无限 |
| API/ADB 命令超时 | 秒 | 防止网络请求或子进程永久阻塞 | 分别设置 connect/read/command timeout |
| CI 任务硬超时 | 分钟 | 限制完整运行时长 | 超时终止时仍执行 finally/after_script 清理 |

`appium:newCommandTimeout` 不是单条命令执行超时，也不是 STF 租约超时。[UiAutomator2 capabilities](https://github.com/appium/appium-uiautomator2-driver#capabilities)

建议控制服务增加回收器：定期对比自己的运行表、`GET /api/v1/user/devices` 与活跃 Appium sessions，回收“任务已终止但设备仍归用户”的孤儿租约。回收前必须依据 run/serial 外部记录确认归属，不能粗暴释放同一用户的所有设备。

## 8. 安全边界

- STF 官方明确警告其内部进程缺少完整安全/加密，适合可信内部网络；设备之间也不会自动彻底清理用户数据。[STF Security](https://github.com/DeviceFarmer/stf#security)
- STF API 必须经 HTTPS；Provider 远程 ADB 端口仅允许 Appium Worker 网段访问，不能公网开放。
- 为 Worker 管理专用 ADB key，提前录入 STF；不要复用官方部署文档警告的默认 Docker ADB key。[STF Deployment](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)
- Appium Server 默认只在可信 Worker 内使用；若必须远程访问，放在认证反向代理/服务网格后并限制来源。
- 不要为方便而启用 Appium `--relaxed-security`。Appium 2 官方建议只通过 `--allow-insecure` 精确开启确有需要的能力；例如 `adb_shell` 会允许会话执行任意 ADB Shell 命令。[Appium 2 server security](https://appium.io/docs/en/2.19/guides/security/)
- APK、截图、page source、Appium 日志和设备 logcat 都可能含敏感数据，应按测试制品策略控制留存与访问。
- `finally` 释放租约不能替代设备清理；多用户复用前仍需额外执行卸载、清数据、退出测试账号或恢复基线。

## 9. 上线前验收清单

- STF token 仅从 Secret 注入，日志中不可见。
- Appium Worker 能解析并访问每台 Provider 返回的 `host:port`。
- ADB key 已预授权，不需要人工点设备弹窗。
- Appium Server 与执行 `adb connect` 的进程看到相同 `adb devices -l`。
- Appium 2 与 UiAutomator2 4.x 版本已锁定，并通过 `appium driver doctor uiautomator2`。
- 两个任务争抢同一设备时只有一个 POST 成功。
- 多设备并发时 `udid`、`systemPort` 及 WebView/MJPEG 端口不冲突。
- 在占用后、remoteConnect 后、ADB 后、Appium 建连后、用例中途分别模拟失败，设备最终都能释放。
- 模拟 Runner 被强杀，外部回收器可识别并回收孤儿租约。
- 换用户前的应用/账号/文件清理已通过真机验证。

## 10. 官方资料

- [DeviceFarmer/STF API](https://github.com/DeviceFarmer/stf/blob/master/doc/API.md)
- [STF 官方 API 文档链接的 Appium 示例](https://github.com/openstf/stf-appium-example)
- [STF Deployment](https://github.com/DeviceFarmer/stf/blob/master/doc/DEPLOYMENT.md)
- [Appium 2 migration guide](https://appium.io/docs/en/2.3/guides/migrating-1-to-2/)
- [Appium 2 Python quickstart](https://appium.io/docs/en/2.7/quickstart/test-py/)
- [Appium Python Client](https://github.com/appium/python-client)
- [UiAutomator2 Driver](https://github.com/appium/appium-uiautomator2-driver)
- [UiAutomator2 capability sets](https://github.com/appium/appium-uiautomator2-driver/blob/master/docs/capability-sets.md)
- [Appium 2 server security](https://appium.io/docs/en/2.19/guides/security/)
