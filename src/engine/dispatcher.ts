/**
 * Dispatcher · 一句话入口（《优化框架》第一节）
 * 判断三件事：agent_count / task_type / game_type，并给出十维 TaskProfile
 * 仅一次 LLM 调用（~300-500 tokens）
 */
import type { TaskProfile, StrategyCombo } from './types'
import { callJSON, type LLMCaller } from './llm'

import type { ForceTrack } from './types'

const DISPATCH_SYSTEM = `你是 MA-Collab 编排框架的 Dispatcher。你的任务不是回答用户，而是对用户输入进行场景分类，输出一个 TaskProfile JSON。
判断规则：
1. agent_count：任务本质上需要几个智能体？简单执行类任务（写邮件、翻译、问答）=1；需要多角色协商/模拟的 >1。
2. task_type：agent_count=1 → "single"；多方协作议事、应急规划、多视角决策 → "collaborative"；明确的博弈游戏（狼人杀、扑克、谈判对抗、竞拍）→ "competitive"。
3. game_type：competitive 时给出 "werewolf" | "poker" 等，否则 null。
其余维度按场景语义判断。只输出 JSON。`

const DISPATCH_SCHEMA = `{
  "agent_count": <int>,
  "task_type": "single" | "collaborative" | "competitive",
  "game_type": "werewolf" | "poker" | null,
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
    if (data.task_type !== 'competitive') data.task_type = 'collaborative'
    data.game_type = null
    data.reasoning = '【用户强制多 Agent 模式】' + data.reasoning
  } else {
    if (data.agent_count <= 1) data.task_type = 'single'
    if (data.task_type === 'competitive' && !data.game_type) data.game_type = 'werewolf'
  }
  return { profile: data, tokens }
}

// ============ 协作决策表（确定性查表，0 tokens） ============

interface TableRow {
  match: Partial<Pick<TaskProfile, 'time_pressure' | 'information_asymmetry' | 'agent_relations' | 'decision_pattern' | 'resource_scarcity'>>
  combo: StrategyCombo
}

function combo(A: string[], B: string, C: string, D: string, E: string[], notes: string[] = []): StrategyCombo {
  return { A, B, C, D, E, notes }
}

const DECISION_TABLE: TableRow[] = [
  {
    match: { time_pressure: 'urgent', information_asymmetry: 'high', agent_relations: 'cooperative', decision_pattern: 'single_shot', resource_scarcity: 'high' },
    combo: combo(['A2'], 'B3', 'C2', 'D2', ['E1'], ['+ A4 C4 E3（对抗审查附加通道）']),
  },
  {
    match: { time_pressure: 'sustained', agent_relations: 'adversarial', decision_pattern: 'sequential', resource_scarcity: 'high' },
    combo: combo(['A2'], 'B3', 'C2', 'D2', ['E4'], ['+ A4 C4 E3', '+ A3 C5 D3（Delphi 校准）']),
  },
  {
    match: { time_pressure: 'relaxed', information_asymmetry: 'low', agent_relations: 'adversarial', decision_pattern: 'single_shot' },
    combo: combo(['A1'], 'B2', 'C2', 'D2', ['E2'], ['+ A4 C4 E3']),
  },
  {
    match: { time_pressure: 'relaxed', information_asymmetry: 'low', agent_relations: 'cooperative', decision_pattern: 'single_shot', resource_scarcity: 'low' },
    combo: combo(['A3'], 'B4', 'C3', 'D2', ['E2'], []),
  },
  {
    match: { time_pressure: 'relaxed', information_asymmetry: 'high', agent_relations: 'cooperative', decision_pattern: 'single_shot' },
    combo: combo(['A1'], 'B2', 'C2', 'D2', ['E2'], []),
  },
  {
    match: { time_pressure: 'urgent', information_asymmetry: 'low', agent_relations: 'cooperative', decision_pattern: 'single_shot', resource_scarcity: 'low' },
    combo: combo(['A3'], 'B1', 'C2', 'D1', ['E1'], []),
  },
  {
    match: { time_pressure: 'sustained', information_asymmetry: 'low', agent_relations: 'adversarial', decision_pattern: 'sequential', resource_scarcity: 'high' },
    combo: combo(['A1'], 'B2', 'C2', 'D2', ['E4'], ['+ A4 C4 E3']),
  },
]

/** 公共议事类场景的默认配方（两阶段 Open-first Fishbowl） */
const DEFAULT_DELIBERATION: StrategyCombo = combo(
  ['A3', 'A1'],
  'B3',
  'C2',
  'D2',
  ['E1', 'E2', 'E7'],
  [
    'A3→第一阶段全员独立首发（防锚定）',
    'A1→第二阶段按冲突数据选内圈',
    '+ A4 C4 E3（对抗审查循环）',
    'C2 → 自动要求 D2 结构化工件',
    'E7 投票决议叠加于收敛之后',
  ],
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
  const errors: string[] = []
  if (c.A.includes('A2') && c.A.includes('A3') && !c.A.includes('A1')) {
    // A2⊥A3 互斥，但 Open-first Fishbowl 中 A3 用于阶段一、A1 用于阶段二，视为分阶段使用，合法
    if (!c.A.includes('A1')) errors.push('A2 ⊥ A3：层级制与全体参与不可同阶段共存')
  }
  const cModes = ['C2', 'C3', 'C4', 'C5'].filter((m) => c.C === m)
  if (cModes.length > 1) errors.push('C2 ⊥ C3 ⊥ C4 ⊥ C5：同轮只能一种思考框架')
  const eExclusive = ['E1', 'E2', 'E4'].filter((m) => c.E.includes(m))
  if (eExclusive.length > 2) errors.push('E1 ⊥ E2 ⊥ E4：同层只能一种主终止条件')
  // 自动推断
  if (c.C === 'C5' && c.D !== 'D3') errors.push('C5 Delphi 强制 D3 置信度工件')
  if (['C2', 'C3', 'C4'].includes(c.C) && c.D === 'D1') errors.push('结构化思考强制 D2 以上工件')
  return errors
}

export const STRATEGY_LABELS: Record<string, string> = {
  A1: '配额制', A2: '层级制', A3: '全体参与', A4: '指定对抗', A5: '私下沟通',
  B1: '全量路由', B2: '摘要路由', B3: '角色约束路由', B4: '框架约束路由', B5: '角色权限信息',
  C1: '自由思考', C2: '立场制', C3: '六帽思考', C4: '对抗制', C5: 'Delphi',
  D1: '自由文本', D2: '结构化工件', D3: '置信度工件',
  E1: '固定轮次', E2: '收敛检测', E3: '对抗循环', E4: '时序循环', E7: '投票决议',
}
