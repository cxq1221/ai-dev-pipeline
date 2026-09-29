# 需求中心 MVP 原型

入口：[ai-dev-pipeline-mvp-v2.html](ai-dev-pipeline-mvp-v2.html)，也可打开 [index.html](index.html)。

包含统一需求池、测试用例，以及需求详情中的概览、需求开发、制品管理和测试报告。一个需求对应一个 Android 平台任务，不引入版本或人工验收。页面为自包含 HTML，所有模拟数据刷新后重置。

在本目录运行回归：

```bash
node --test tests/*.test.cjs
```

共享说明：[项目 README](../README.md)、[MVP 模块架构](../docs/MVP_MODULE_ARCHITECTURE.md)。
