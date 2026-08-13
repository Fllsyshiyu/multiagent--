/**
 * Dispatcher · 一句话入口（《优化框架》第一节）
 * 判断三件事：agent_count / task_type / game_type，并给出十维 TaskProfile
 * 仅一次 LLM 调用（~300-500 tokens）
 */
import type { PhasePolicy, TaskProfile, StrategyCombo } from './types'
import { callJSON, type LLMCaller } from './llm'
import { policyToLegacyCombo, STRATEGY_LABELS as FINAL_STRATEGY_LABELS } from './framework/registry'
import { validatePolicy } from './framework/validation'

import type { ForceTrack } from './types'

const DISPATCH_SYSTEM = `你是 MA-Collab 编排框架的 Dispatcher。你的任务不是回答用户，而是对用户输入进行场景分类，输出一个 TaskProfile JSON。
判断规则：
1. agent_count：任务本质上需要几个智能体？简单执行类任务（写邮件、翻译、问答）=1；需要多角色协商/模拟的 >1。
2. task_type：agent_count=1 → "single"；多方协作议事、应急规划、多视角决策 → "collaborative"；明确的博弈或对抗模拟（狼人杀、谁是卧底、杀人游戏、网络安全红蓝对抗、反舞弊调查、阿瓦隆、扑克、谈判对抗、竞拍）→ "competitive"。
3. game_type：competitive 时必须给出该游戏的具体英文标识，且必须与用户描述的游戏严格对应：
   - 狼人杀 → "werewolf"
   - 谁是卧底 / 谁是卧底游戏 → "undercover"
   - 杀人游戏 / 警察杀手平民 → "mafia"
   - 网络安全红蓝对抗 / 攻防演练 → "cyber_defense"
   - 企业反舞弊 / 内鬼调查 → "fraud_audit"
   - 阿瓦隆 / 抵抗组织 → "avalon"
   - 扑克 / 德州扑克 → "poker"
   - 其他博弈用其英文名或拼音。禁止把非狼人杀游戏误判为 "werewolf"。
其余维度按场景语义判断。只输出 JSON。`

const DISPATCH_SCHEMA = `{
  "agent_count": <int>,
  "task_type": "single" | "collaborative" | "competitive",
  "game_type": "<werewolf | undercover | mafia | cyber_defense | fraud_audit | avalon | poker | 其他英文标识；非博弈任务为 null>",
  "domain": "<领域，如 governance / disaster / business / game>",
  "time_pressure": "urgent" | "sustained" | "relaxed",
  "information_asymmetry": "high" | "medium" | "low",
  "agent_relations": "cooperative" | "adversarial" | "mixed",
  "decision_pattern": "single_shot" | "sequential",
  "resource_scarcity": "high" | "medium" | "low",
  "verifiability": "automatable" | "partially" | "subjective",
  "reasoning": "<一句话分类理由>"
}`

export async function dispatch(
  caller: LLMCaller,
  userInput: string,
  onRetry?: (attempt: number) => void,
  forceTrack?: ForceTrack,
): Promise<{ profile: TaskProfile; tokens: number }> {
  const { data, tokens } = await callJSON<TaskProfile>(
    caller,
    DISPATCH_SYSTEM,
    `用户输入：${userInput}\n\n输出 JSON，格式：\n${DISPATCH_SCHEMA}`,
    onRetry,
  )
  // ForceTrack 覆盖（用户手动选择议事模式）
  if (forceTrack === 'single') {
    data.agent_count = 1
    data.task_type = 'single'
    data.game_type = null
    data.reasoning = '【用户强制单 Agent 模式】' + data.reasoning
  } else if (forceTrack === 'multi') {
    if (data.agent_count <= 1) data.agent_count = 3
    if (data.task_type === 'single') {
      data.task_type = 'collaborative'
      data.game_type = null
    } else if (data.task_type === 'collaborative') {
      data.game_type = null
    }
    // competitive 保留原 game_type，避免出现 competitive + null 的无效组合
    data.reasoning = '【用户强制多 Agent 模式】' + data.reasoning
  } else {
    if (data.agent_count <= 1) data.task_type = 'single'
    // competitive 且 game_type 缺失时保留 null，交由通用博弈规则编译器动态生成，
    // 不再把所有未知博弈默认成狼人杀。
  }
  return { profile: data, tokens }
}

// ============ 协作决策表（确定性查表，0 tokens） ============

interface TableRow {
  match: Partial<Pick<TaskProfile, 'time_pressure' | 'information_asymmetry' | 'agent_relations' | 'decision_pattern' | 'resource_scarcity'>>
  combo: StrategyCombo
}

function combo(policy: PhasePolicy, notes: string[] = []): StrategyCombo {
  return policyToLegacyCombo(policy, [], notes)
}

const DECISION_TABLE: TableRow[] = [
  {
    match: { time_pressure: 'urgent', information_asymmetry: 'high', agent_relations: 'cooperative', decision_pattern: 'single_shot', resource_scarcity: 'high' },
    combo: combo({ A: 'A3', B: 'B3', C: 'C2', D: 'D2', E: 'E1' }, ['紧急场景采用最小能力团队']),
  },
  {
    match: { time_pressure: 'sustained', agent_relations: 'adversarial', decision_pattern: 'sequential', resource_scarcity: 'high' },
    combo: combo({ A: 'A4', B: 'B3', C: 'C4', D: 'D2', E: 'E3' }, ['持续对抗场景采用动态轮换与辩证审查']),
  },
  {
    match: { time_pressure: 'relaxed', information_asymmetry: 'low', agent_relations: 'adversarial', decision_pattern: 'single_shot' },
    combo: combo({ A: 'A2', B: 'B2', C: 'C2', D: 'D2', E: 'E2' }, ['多利益主体采用代表制与条件收敛']),
  },
  {
    match: { time_pressure: 'relaxed', information_asymmetry: 'low', agent_relations: 'cooperative', decision_pattern: 'single_shot', resource_scarcity: 'low' },
    combo: combo({ A: 'A1', B: 'B1', C: 'C3', D: 'D2', E: 'E4' }),
  },
  {
    match: { time_pressure: 'relaxed', information_asymmetry: 'high', agent_relations: 'cooperative', decision_pattern: 'single_shot' },
    combo: combo({ A: 'A2', B: 'B3', C: 'C2', D: 'D2', E: 'E2' }),
  },
  {
    match: { time_pressure: 'urgent', information_asymmetry: 'low', agent_relations: 'cooperative', decision_pattern: 'single_shot', resource_scarcity: 'low' },
    combo: combo({ A: 'A3', B: 'B2', C: 'C2', D: 'D2', E: 'E1' }),
  },
  {
    match: { time_pressure: 'sustained', information_asymmetry: 'low', agent_relations: 'adversarial', decision_pattern: 'sequential', resource_scarcity: 'high' },
    combo: combo({ A: 'A4', B: 'B2', C: 'C4', D: 'D2', E: 'E3' }, ['持续对抗场景保留冲突路由']),
  },
]

/** 公共议事类场景的默认配方（两阶段 Open-first Fishbowl） */
const DEFAULT_DELIBERATION: StrategyCombo = combo(
  { A: 'A4', B: 'B2', C: 'C2', D: 'D2', E: 'E1' },
  ['采用 Fishbowl v1：动态轮换、摘要路由、立场制、结构化工件、固定两轮'],
)

function matchScore(profile: TaskProfile, row: TableRow): number {
  let score = 0
  for (const [k, v] of Object.entries(row.match)) {
    const key = k as keyof typeof row.match
    if ((profile[key] as string) === v) score += 1
    else return -1 // 任一不匹配即淘汰（严格格匹配）
  }
  return score
}

export function lookupDecisionTable(profile: TaskProfile): { combo: StrategyCombo; hit: string } {
  let best: TableRow | null = null
  let bestScore = 0
  for (const row of DECISION_TABLE) {
    const s = matchScore(profile, row)
    if (s > bestScore) {
      best = row
      bestScore = s
    }
  }
  if (best && bestScore >= 3) {
    return { combo: best.combo, hit: `命中决策表（${bestScore} 维匹配）` }
  }
  return { combo: DEFAULT_DELIBERATION, hit: '未命中特定格 → 采用公共议事默认配方（Open-first Fishbowl）' }
}

/** 组合规则校验（《优化框架》第三节）：同维互斥 + 自动推断 */
export function validateCombo(c: StrategyCombo): string[] {
  if (c.A.length !== 1 || c.E.length !== 1) return ['每个阶段的 A/E 槽位必须且只能有一个 Base Strategy']
  const result = validatePolicy({ A: c.A[0] as PhasePolicy['A'], B: c.B as PhasePolicy['B'], C: c.C as PhasePolicy['C'], D: c.D as PhasePolicy['D'], E: c.E[0] as PhasePolicy['E'] })
  return result.issues.map((entry) => entry.message)
}

export const STRATEGY_LABELS: Record<string, string> = FINAL_STRATEGY_LABELS
