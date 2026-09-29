# 完整产品原型

入口：[ai-dev-pipeline-prototype.html](ai-dev-pipeline-prototype.html)，也可打开 [index.html](index.html)。

此目录包含完整原型及运行依赖：

- `test-suites.js`：测试用例集。
- `assets-model.js`、`knowledge-assets.js/css`：知识资产管理。
- `runtime-preview*`：运行预览及独立预览窗口。
- `vendor/pdfjs/`：本地 PDF 预览组件及许可证。
- `artifacts/demo/`：示例 APK 和说明。
- `licenses/`：图标许可证。
- `tests/`：回归测试及 PDF 测试夹具。

请保留目录内部的相对位置。原型不连接真实 AI、构建或测试系统，模拟数据刷新后重置。

在本目录运行回归：

```bash
node --test tests/*.test.cjs
```

共享说明：[项目 README](../README.md)、[产品说明](../docs/PRODUCT_OVERVIEW.md)。
