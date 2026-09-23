# 产品说明配图与检查记录

配图使用 Archify 生成，静态图片已嵌入 `../PRODUCT_OVERVIEW.md`，HTML 为可独立打开的交互版本。PNG 是已交付 HTML 的浅色大屏截图，不是重新绘制的另一份拓扑。

## 产品结构

- diagram_type: architecture
- output: product-structure.html
- specification_sha256: 075150cf95e75020272a4a24d32da224e8e5124d5c247420614ee23d36c7e68e
- artifact_sha256: cec0bf845e9e1581b5ffcf4e8cd3c51b07e364dc0e00591b260d627736e6d206
- validation: 9/9 showcase, 0 errors, 0 warnings
- visual_review: passed
- correction_rounds: 1
- 已检查浅色大屏与深色小屏截图；1440×900、1600×1000、1920×1080、2048×1320 均无页面溢出。
- API 覆盖：不适用。本图是产品模块关系，不是应用服务或部署架构；没有编造 API 清单。

## 交付流程

- diagram_type: workflow
- output: delivery-flow.html
- specification_sha256: 0c0a0c4f64b3bb0ff3b65c39c16f659a507ed6d5477fe96bd2513b0fdb0d8bbe
- artifact_sha256: b653788872222aa7214bb54118910d465af0e61029caf8430a194df0dd829226
- validation: 9/9 showcase, 0 errors, 0 warnings
- visual_review: failed
- correction_rounds: 2
- 已检查最终浅色和深色大屏截图，节点与流程完整可读；2048×1320 无溢出。
- 未通过独立查看器的全尺寸首屏检查：1440×900、1600×1000、1920×1080 存在纵向滚动，无横向溢出。没有通过裁切、隐藏内容或缩小字体掩盖问题。正文使用完整大屏截图，交互链接明确提示滚动限制。

各 `.visual-check.json` 文件保留自动检测结果；其中 `visualReview: pending` 为自动工具的固定声明，不替代上述人工截图审阅记录。
