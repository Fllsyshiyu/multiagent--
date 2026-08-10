# DistilBERT Query Complexity

输入任意任务，使用本地 DistilBERT 编码器直接计算六项指标：

- 推理深度
- 执行步骤
- 专业知识
- 工具依赖
- 协调复杂度
- 不确定性

每项输出 `0-4` 分和置信度，最终 Level 1-5 由固定序数规则从六项指标计算。

## 原则

- 只使用 DistilBERT，不调用远端 LLM。
- 不输出或使用 `no_llm / small_llm / large_llm` 三档。
- 不使用关键词经验规则补分。
- 服务不可用时明确报错，不静默切换到另一套分类逻辑。

## 实现

`services/query-complexity/app.py` 使用预训练 checkpoint 的 DistilBERT encoder，将 Query 与每个指标的 0-4 五档语义锚点编码，并按余弦相似度得到各档概率、指标分数和置信度。

## 启动

```bash
npm run classifier:setup
npm run classifier:dev
npm run dev
```
