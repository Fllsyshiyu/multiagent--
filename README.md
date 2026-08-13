# MA-Collab · 通用多智能体编排框架 Demo

> 一套框架，议事与博弈通用。输入任何一句话：简单任务单 Agent 直接回答；多方争议编译成两阶段鱼缸议事并附试卷评分；博弈游戏加载扩展复用同一套策略。**不为任何场景手写代码。**

纯前端 React 应用（TypeScript + Vite + Tailwind）。Query Complexity 与其余生成任务共用用户在页面中配置的 OpenAI 兼容模型 API，无需额外分类服务或模型下载。

## 核心架构

```
用户输入（一句话）
    │
    ├── Query Complexity Classifier（模型 API + 固定 Rubric）→ Level 1-5
    │
    ▼
Dispatcher（一次 LLM 调用，~300 tokens）
    ├── agent_count = 1      → 单 Agent 轨道：直接回答，跳过编排
    ├── task_type = collaborative → Scenario Compiler（六步）
    │       Step1 场景分类（LLM）→ Step2 查 30 格决策表（确定性 0 tok）
    │       → Step3 生成 Agent Pool（LLM）→ Step4 信息流设计（0 tok）
    │       → Step5 阶段序列+条件边（0 tok）→ Step6 评测试卷冻结（0 tok）
    │       └── OrchestrationEngine：Open-first Fishbowl
    │           全员独立首发 → 方案归并 → 轻量评分 → 冲突分析
    │           → 鱼缸两轮（按冲突数据选内圈 + 摘要继承 + ≥2 席轮换）
    │           → 修订方案 → 试卷阅卷（红线门 + 客观 40 + 主观 60）→ 报告
    └── task_type = competitive → 解析 game_type + player_count → GameRegistry
            内置狼人杀 / 谁是卧底 / 杀人游戏 / 阿瓦隆 GameSpec
            未注册游戏由 Live 模型生成 GameSpec，统一交给 GenericGameEngine
```

## 五级 Query 复杂度

`src/complexity/` 复用网站已配置的 OpenAI 兼容 API，要求模型按照固定 Rubric 输出六项 `0-4` 指标：推理深度、执行步骤、专业知识、工具依赖、协调复杂度和不确定性。最终 Level 1-5 仍由前端确定性规则计算。

- 不再依赖 DistilBERT、Hugging Face Space 或 Python 分类服务
- Live 模式使用用户填写的 API 配置
- 回放模式使用预录的六维评分，不产生网络调用
- API 不可用时显示保守降级结果，不阻断主流程

## 原子策略族（19 项）

| 族 | 内容 |
|---|---|
| A 发言者选择 | A1 配额 / A2 层级 / A3 全体 / A4 指定对抗 / A5 私下沟通 |
| B 信息路由 | B1 全量 / B2 摘要 / B3 角色约束 / B4 框架约束 / B5 角色权限 |
| C 思维模式 | C1 自由 / C2 立场制 / C3 六帽 / C4 对抗制 / C5 Delphi |
| D 输出格式 | D1 自由文本 / D2 结构化工件 / D3 置信度工件 |
| E 状态转换 | E1 固定轮次 / E2 收敛检测 / E3 对抗循环 / E4 时序循环 / E7 投票决议 |

组合规则：同维互斥（A2⊥A3、C2⊥C3⊥C4⊥C5）、跨维叠加（A4/A5、E3、E7 可附加）、自动推断（C2→D2、C5→D3）。

## 双模式运行

- **Live 模式**：在界面填入 OpenAI 兼容端点（Base URL + API Key + 模型），浏览器直连服务商，Dispatcher 分类、Agent 生成、每场发言、阅卷评分全部实时生成。Key 仅存于浏览器 localStorage，只发往用户自选服务商。
- **回放模式**：无 Key 时，原样点击预设会播放对应固定剧本；自由输入已注册博弈（例如“12 个人玩狼人杀”“8 个人玩阿瓦隆”）会按输入动态组装人数、角色和阶段，并使用本地确定性 Agent 应答。编辑预设文本后不会继续复用旧剧本。

## 健壮性设计

- JSON 模式双保险：自动补全 prompt 的 json 关键词要求；被服务商 400 拒绝时降级文本模式重试；
- 结构归一化：模型输出缺字段 / 多包裹 / 键名变形时自动归一，兜底降级不中断运行；
- 解析失败自动重试一次（事件流中可见）；
- 运行时适应：Observer 检测发言支配（占比 >40%）与 Grounding 率（<30%）触发动态调整。

## Observer 指标体系

发言公平性 Gini、Grounding 率、回应率、少数意见保留率、鱼缸轮换率、外圈观察吸收率、共识趋势与共识坍缩警报、TokenLedger 分阶段成本账本。

## 本地开发

```bash
npm install
npm run dev
npm run build
```

## 部署（GitHub Pages）

仓库内置 `.github/workflows/deploy.yml`：推送到 `main` 分支后自动构建并发布到 GitHub Pages。
首次使用需在仓库 Settings → Pages → Source 选择 **GitHub Actions**。

## 工程结构

```
src/
├── complexity/        # 模型 API + 固定 Rubric，输出六维指标与 Level 1-5
├── engine/            # MA-Collab 框架内核（与 UI 无关，可独立复用）
│   ├── types.ts       #   统一数据契约（TaskProfile/策略/工件/事件流）
│   ├── dispatcher.ts  #   一句话分类 + 30 格决策表 + 组合规则校验
│   ├── compiler.ts    #   Scenario Compiler 六步
│   ├── engine.ts      #   编排引擎主循环（Open-first Fishbowl）
│   ├── game-request.ts#   游戏类型与人数的确定性解析
│   ├── game-specs.ts  #   内置声明式游戏规则（含阿瓦隆）
│   ├── game-engine.ts #   通用博弈运行时与动作原语
│   ├── replay.ts      #   自由博弈输入的离线确定性应答
│   ├── werewolf.ts    #   旧版狼人杀扩展（兼容保留）
│   ├── llm.ts         #   浏览器 LLM 客户端（双保险 + 400 降级）
│   ├── normalize.ts   #   结构归一化（异常输出不中断运行）
│   ├── scripted.ts    #   剧本化应答（回放模式）
│   ├── observer.ts    #   过程指标
│   └── ledger.ts      #   Token 账本
├── data/scripts/      # 四个预录剧本
├── components/        # 视图组件（鱼缸环形图/评分矩阵/试卷/狼人杀等）
├── hooks/             # 事件流归约 Hook
```

## 边界声明

AI 议事结果仅用于辅助分析，**不替代真实公共决策与实地调研**。Demo 中的评分与指标用于展示框架机制，不构成对议题本身的结论。
