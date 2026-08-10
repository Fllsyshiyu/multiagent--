# DistilBERT Six-Dimension Complexity Service

本地 FastAPI 服务，使用 `tripathyShaswata/QueryComplexityRouter` checkpoint 的 DistilBERT encoder 计算六项任务复杂度指标。

输出仅包含：

- `reasoning_depth`
- `step_count`
- `domain_expertise`
- `tool_dependency`
- `coordination`
- `uncertainty`
- 综合 Level 1-5

不输出、不使用原 checkpoint 的 `no_llm / small_llm / large_llm` 分类头结果。六维分数来自 Query 与五档语义锚点的 DistilBERT embedding 相似度。

```bash
npm run classifier:setup
npm run classifier:dev
```

接口：

```bash
curl http://127.0.0.1:8787/health
curl -X POST http://127.0.0.1:8787/classify \
  -H 'Content-Type: application/json' \
  -d '{"query":"Read a codebase, fix a concurrency bug and add tests"}'
```
