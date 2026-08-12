---
title: MA-Collab Query Complexity
emoji: 📐
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# MA-Collab Query Complexity Service

这是网站使用的托管 DistilBERT 六维复杂度服务。服务启动时在服务器端加载 `tripathyShaswata/QueryComplexityRouter`，访客浏览器只调用 `/classify`，不会下载模型权重。

checkpoint 原始分类头只包含 `no_llm / small_llm / large_llm`。本服务不使用该三分类结果，而是复用 DistilBERT encoder，将 Query 与六个维度的五档 rubric 锚点编码，再按相似度输出六维 `0-4` 分数及 Level 1-5。

## API

- `GET /health`
- `POST /classify`

请求示例：

```json
{ "query": "请分析两个方案并给出实施计划" }
```

## 部署

推荐部署为公开 Hugging Face Docker Space。`Dockerfile` 监听平台提供的 `PORT`（默认 `7860`），并允许通过 `ALLOWED_ORIGINS` 设置 CORS；默认 `*`，便于 GitHub Pages 直接访问。

仓库的 `.github/workflows/deploy-classifier.yml` 会把此目录同步到 Space。GitHub 仓库需配置 `HF_TOKEN` secret；可选 variables 为 `HF_USERNAME` 和 `HF_SPACE_NAME`。

## 可选本地开发

```bash
npm run classifier:setup
npm run classifier:dev
```
