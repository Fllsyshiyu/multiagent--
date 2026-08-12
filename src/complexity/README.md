# API Rubric Query Complexity

输入任意任务后，分类器复用网站已有的 OpenAI 兼容模型 API，按照固定 Rubric 计算六项指标：

- 推理深度
- 执行步骤
- 专业知识
- 工具依赖
- 协调复杂度
- 不确定性

每项输出 `0-4` 分和置信度，最终 Level 1-5 由本地固定序数规则根据六项分数计算。

## 原则

- 不依赖 DistilBERT、Hugging Face Space、Python 服务或额外模型下载。
- Live 模式复用用户在页面中配置的 OpenAI 兼容 API。
- 回放模式使用随剧本冻结的六维结果，不发出网络请求。
- 模型只负责按明确 Rubric 给六维分数，最终 Level 由确定性代码计算。
- API 不可用时显示保守降级结果，不阻断后续流程。
