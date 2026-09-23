# Sonic 通过 AI Agent 调用 API 创建用例可行性

> 核对日期：2026-09-22  
> 依据：SonicCloudOrg 官方归档源码 `sonic-server` 与 `sonic-client-web`。

## 结论

可以。Sonic 前端本身就是通过 HTTP 接口创建用例、步骤和控件，因此 AI Agent 可以复用这些接口，把自然语言测试需求转换为 Sonic 的结构化用例。

但这些接口主要是 Sonic Web UI 使用的内部业务接口，不是有兼容性承诺的独立开放 API。官方仓库已于 2025-03-25 归档；生产接入应锁定 Sonic 版本，并在 Agent 与 Sonic 之间增加一个适配层。

## 关键接口

部署默认经网关访问时，前端基地址为 `/server/api`，业务接口再加 `/controller`。实际前缀可能被反向代理改写。

| 操作 | 方法与路径 | 说明 |
| --- | --- | --- |
| 登录 | `POST /server/api/controller/users/login` | 返回 JWT Token |
| 生成长期 Token | `GET /server/api/controller/users/generateToken?day=N` | 需要已有 `SonicToken` |
| 创建或更新用例 | `PUT /server/api/controller/testCases` | `id` 为空时创建；有 `id` 时更新 |
| 查询用例列表 | `GET /server/api/controller/testCases/list` | 按项目、平台、名称等查询 |
| 查询用例详情 | `GET /server/api/controller/testCases?id=...` | 获取用例元数据 |
| 创建或更新步骤 | `PUT /server/api/controller/steps` | `id` 为空时创建；需提供 `caseId` |
| 查询用例步骤 | `GET /server/api/controller/steps/listAll?caseId=...` | 返回父子步骤和元素引用 |
| 创建或更新控件 | `PUT /server/api/controller/elements` | 定位型步骤通常先创建/复用控件 |
| 查询控件 | `GET /server/api/controller/elements/list` | 可按项目、名称、定位类型和值搜索 |

除登录等白名单接口外，请求应携带：

```http
SonicToken: <token>
Content-Type: application/json
```

权限管理开启时，还需要给 Agent 使用的账号授予相应方法和路径权限。

## 核心数据结构

用例至少需要：

```json
{
  "name": "登录成功",
  "platform": 1,
  "projectId": 1,
  "moduleId": 0,
  "version": "v1.0",
  "des": "验证正确账号密码可以登录"
}
```

`platform` 官方前端使用 `1 = Android`、`2 = iOS`。

步骤至少需要 `projectId`、`platform`、`caseId`、`stepType`、`error`；建议始终显式传入 `parentId`、`conditionType`、`disabled` 和 `elements`。即使步骤不使用控件，也应传 `"elements": []`，因为服务端保存逻辑会直接遍历该集合。

定位型步骤的 `elements` 不是任意内嵌定位表达式，而是已存在控件记录的引用。Agent 应先查询并复用控件；不存在时创建控件，再获得其 ID 后创建步骤。

## 推荐创建流程

1. 使用专用低权限账号取得 `SonicToken`。
2. 查询项目、模块、版本和已有控件，建立可选值及 ID 映射。
3. LLM 先生成中立的 `CaseDraft`，不要直接生成 HTTP 请求。
4. 用 JSON Schema 和确定性规则校验平台、步骤类型、必填字段、父子结构和元素引用。
5. 人工预览并批准高风险操作，例如安装应用、Shell、脚本、删除数据或外部请求。
6. 调用 `PUT /controller/testCases` 创建用例。
7. 获得 `caseId` 后按父子关系依次创建步骤；条件父步骤需要先创建，子步骤才能引用 `parentId`。
8. 回读用例和步骤，比较名称、数量、顺序、元素及条件树，确认落库结果。
9. 可选地把用例加入测试套件，但默认不自动执行。

## 必须处理的接口缺陷

### 创建接口不返回新 ID

`PUT /testCases` 只返回通用成功响应，没有返回新建用例 ID；`PUT /steps` 和 `PUT /elements` 也采用类似模式。这对 Web UI 尚可，但不适合可靠的 Agent 编排。

短期可以给名称加唯一请求标识，再调用列表接口查询最新记录；这仍存在并发歧义。更可靠的方案是给自有 Sonic 分支增加专用集成接口，在响应中返回 `caseId`、`stepId` 和 `elementId`。

### 不是稳定公开契约

这些路由带有 OpenAPI 注解并可被 Swagger 展示，但官方前端直接调用它们，仓库中没有发现独立的版本化公共 API 或兼容性承诺。升级、分支改造和白标平台都可能改变字段、路径或权限资源。

### 非原子创建

用例、控件和步骤分别写入。如果中途失败，会留下只有元数据、缺少步骤的半成品。适配层应提供补偿删除、草稿状态或服务端事务化批量创建接口。

## 推荐架构

```text
需求/Jira/自然语言
        ↓
AI Agent 生成 CaseDraft
        ↓
Schema 校验 + 步骤白名单 + 元素解析
        ↓
人工审批（建议默认开启）
        ↓
Sonic Adapter
  - Token 与最小权限
  - 幂等键和去重
  - ID 回填
  - 补偿/回滚
  - 回读校验和审计
        ↓
Sonic testCases / elements / steps API
```

不建议让 LLM 直接持有管理员 Token 或直接写 Sonic 数据库。LLM 只负责产出受限结构，所有实际写入由确定性的 Adapter 执行。

## 一手来源

- [Sonic server 官方仓库](https://github.com/SonicCloudOrg/sonic-server)
- [TestCasesController](https://github.com/SonicCloudOrg/sonic-server/blob/main/sonic-server-controller/src/main/java/org/cloud/sonic/controller/controller/TestCasesController.java)
- [StepsController](https://github.com/SonicCloudOrg/sonic-server/blob/main/sonic-server-controller/src/main/java/org/cloud/sonic/controller/controller/StepsController.java)
- [ElementsController](https://github.com/SonicCloudOrg/sonic-server/blob/main/sonic-server-controller/src/main/java/org/cloud/sonic/controller/controller/ElementsController.java)
- [UsersController](https://github.com/SonicCloudOrg/sonic-server/blob/main/sonic-server-controller/src/main/java/org/cloud/sonic/controller/controller/UsersController.java)
- [PermissionFilter](https://github.com/SonicCloudOrg/sonic-server/blob/main/sonic-server-controller/src/main/java/org/cloud/sonic/controller/config/PermissionFilter.java)
- [TestCasesDTO](https://github.com/SonicCloudOrg/sonic-server/blob/main/sonic-server-controller/src/main/java/org/cloud/sonic/controller/models/dto/TestCasesDTO.java)
- [StepsDTO](https://github.com/SonicCloudOrg/sonic-server/blob/main/sonic-server-controller/src/main/java/org/cloud/sonic/controller/models/dto/StepsDTO.java)
- [StepsServiceImpl](https://github.com/SonicCloudOrg/sonic-server/blob/main/sonic-server-controller/src/main/java/org/cloud/sonic/controller/services/impl/StepsServiceImpl.java)
- [Sonic Web Axios 配置](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/http/axios.js)
- [Sonic Web 用例编辑实现](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/components/TestCaseUpdate.vue)
- [Sonic Web 步骤编辑实现](https://github.com/SonicCloudOrg/sonic-client-web/blob/main/src/components/StepUpdate.vue)
