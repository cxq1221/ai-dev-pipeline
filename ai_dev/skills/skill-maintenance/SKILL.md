---
name: skill-maintenance
description: 根据实际开发经验创建或改进共享 Skill 的说明、脚本和模板。
disable-model-invocation: true
---

# 维护共享 Skill

1. 从系统提示中的共享 Skill 目录定位目标，先读取现有 SKILL.md 和需要修改的资源。
2. 只沉淀可复用的方法，不写入密钥、用户隐私、对话全文和特定需求的业务数据。
3. 保留 YAML frontmatter，name 与目录名称一致，description 清楚说明适用场景。
4. 参考资料、脚本、模板分别放入 references、scripts、assets；使用相对路径引用。
5. 修改前再次检查当前内容，避免覆盖其他会话的修改。只修改任务涉及的 Skill。
6. 检查引用文件存在；对修改的脚本执行适当验证，不伪造运行结果。
7. 汇报修改的 Skill、理由和影响。修改在下一轮加载，不承诺改变正在运行的其他会话。
