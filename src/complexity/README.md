# Hosted DistilBERT Query Complexity

输入任意任务，前端通过 HTTPS 调用托管的 DistilBERT 服务，计算六项指标：

- 推理深度
- 执行步骤
- 专业知识
- 工具依赖
- 协调复杂度
- 不确定性

每项输出 `0-4` 分和置信度，最终 Level 1-5 由固定序数规则从六项指标计算。

## 原则

- 使用专用 DistilBERT 编码器，不调用生成式 LLM。
- 模型运行在服务端；网站访客无需下载权重、Python 或 PyTorch。
- 不输出或使用 checkpoint 原始的 `no_llm / small_llm / large_llm` 分类头结果。
- 不使用关键词经验规则补分。

## 调用

前端读取 `VITE_COMPLEXITY_ROUTER_URL`。未设置时使用项目默认的公开 Hugging Face Space：

```env
VITE_COMPLEXITY_ROUTER_URL=https://fllsyshiyu-query-complexity.hf.space
```

本地开发前端同样默认调用云端服务。只有开发分类服务本身时，才需要把变量改为 `http://127.0.0.1:8787` 并运行 `npm run classifier:setup`、`npm run classifier:dev`。
