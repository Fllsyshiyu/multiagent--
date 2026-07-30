/**
 * ScriptedCaller · 剧本化 LLM 应答（回放模式）
 * 回放 = 真实引擎 + 剧本应答：引擎代码照常执行、事件照常流动，
 * 只是 LLM 调用被替换为预录应答。与 Live 模式共用同一条数据契约。
 */
import type { LLMCaller } from './llm'
import type {
  AgentCard, CandidateProposal, ConflictMap, ExamBlueprint, FinalProposal,
  FishbowlSummaryCard, InitialAssessmentCard, ObjectionCard, OuterObservationCard,
  PlanScoreCard, TaskProfile,
} from './types'

export interface ScriptData {
  dispatch: TaskProfile
  single_answer?: string
  agents?: AgentCard[]
  first_round?: Record<string, InitialAssessmentCard>
  proposals?: CandidateProposal[]
  scores?: Record<string, PlanScoreCard[]>
  conflict?: ConflictMap
  objections?: Record<string, ObjectionCard> // key: `${round}:${agentId}`
  outer?: Record<string, OuterObservationCard> // key: `${round}:${agentId}`
  summaries?: Record<string, FishbowlSummaryCard> // key: round
  final_proposal?: FinalProposal
  exam_objective?: {
    red_line_gate: 'pass' | 'revise' | 'reject'
    red_line_notes: string[]
    objective_scores: { module: string; score: number; comment: string }[]
  }
  exam_subjective?: {
    subjective_scores: { module: string; score: number; comment: string }[]
    grade_comment: string
  }
  werewolf?: {
    wolf_talk: Record<string, { content: string; suggest_target: string }>
    seer_check: { target: string; reasoning: string }
    witch: { use_antidote: boolean; poison_target: string | null; reasoning: string }
    day_speech: Record<string, { content: string; suspect: string | null }>
    vote: Record<string, { target: string; reason: string }>
  }
}

export const DEMO_EXAM: ExamBlueprint | null = null

export function createScriptedCaller(script: ScriptData): LLMCaller {
  const json = (obj: unknown, base = 420) =>
    Promise.resolve({ text: JSON.stringify(obj), tokens: base + Math.ceil(JSON.stringify(obj).length / 6) })

  return async (system: string, user: string): Promise<{ text: string; tokens: number }> => {
    const nameMatch = system.match(/「(.+?)」/)
    const name = nameMatch?.[1] ?? ''
    const idInSystem = system.match(/「.+?」（(p\d)）/)?.[1]
    const agentId = script.agents?.find((a) => a.name === name)?.id ?? idInSystem ?? ''

    // Dispatcher
    if (system.includes('MA-Collab 编排框架的 Dispatcher')) return json(script.dispatch, 380)
    // Agent Factory
    if (system.includes('Agent Factory')) return json(script.agents ?? [], 900)
    // 首发
    if (system.includes('全员独立首发')) {
      const card = script.first_round?.[agentId]
      if (card) return json(card)
    }
    // Aggregator
    if (system.includes('Proposal Aggregator')) return json({ proposals: script.proposals ?? [] }, 600)
    // 评分
    if (system.includes('轻量评分')) {
      const s = script.scores?.[agentId]
      if (s) return json({ scores: s })
    }
    // 冲突分析
    if (system.includes('冲突分析器')) return json(script.conflict ?? {}, 500)
    // 鱼缸内圈
    const roundMatch = system.match(/鱼缸内圈第 (\d) 轮/)
    if (roundMatch) {
      const o = script.objections?.[`${roundMatch[1]}:${agentId}`]
      if (o) return json(o)
      // 兜底：剧本缺该席位时合成最小异议卡
      const first = script.first_round?.[agentId]
      return json({
        kind: 'ObjectionCard', round: Number(roundMatch[1]), agent_id: agentId, objection_type: '利益受损反驳',
        objection: first ? `我依然坚持首发时的核心关切：${first.main_concerns[0] ?? '需要被回应'}。这一点在领先方案中还没有被充分回应。` : '我的核心关切尚未被充分回应。',
        required_revision: first ? first.non_negotiables.slice(0, 2) : ['需要明确回应我的核心关切'],
        support_condition: first?.possible_concessions[0] ?? '核心关切被回应后可支持', reply_to: null,
      })
    }
    // 外圈
    if (system.includes('外圈观察')) {
      const r = user.match(/"round":(\d)/)?.[1] ?? '1'
      const card = script.outer?.[`${r}:${agentId}`]
      if (card) return json(card)
      const first = script.first_round?.[agentId]
      return json({
        kind: 'OuterObservationCard', round: Number(r), agent_id: agentId,
        missed_issue: first ? `${first.main_concerns[0] ?? '相关问题'}的讨论仍不充分` : '仍有遗漏问题',
        objection: first ? first.content.slice(0, 60) : '需要补充讨论',
        evidence_needed: first ? first.main_concerns.slice(0, 1) : [],
        request_to_enter_inner_circle: false, absorbed: false,
      })
    }
    // 主持人摘要
    const sumRound = system.match(/生成第 (\d) 轮鱼缸摘要卡/)
    if (sumRound) {
      const s = script.summaries?.[sumRound[1]]
      if (s) return json(s, 550)
    }
    // Proposal Agent
    if (system.includes('Proposal Agent')) return json(script.final_proposal ?? {}, 700)
    // 阅卷
    if (system.includes('客观题阅卷官')) return json(script.exam_objective ?? {}, 650)
    if (system.includes('主观题阅卷官')) return json(script.exam_subjective ?? {}, 650)
    // 单 Agent
    if (system.includes('直接、可靠的助手')) {
      return Promise.resolve({ text: script.single_answer ?? '好的。', tokens: 260 })
    }
    // ---- 狼人杀 ----
    const ww = script.werewolf
    if (ww) {
      // 先匹配 user 特征分支（白天发言/投票），避免被身份关键词劫持
      if (user.includes('白天发言')) {
        const s = ww.day_speech[agentId]
        if (s) return json(s, 360)
      }
      if (user.includes('投出你认为最像狼人')) {
        const v = ww.vote[agentId]
        if (v) return json(v, 300)
      }
      if (system.includes('狼人私聊频道')) {
        const w = ww.wolf_talk[agentId]
        if (w) return json(w, 320)
      }
      if (system.includes('预言家')) return json(ww.seer_check, 300)
      if (system.includes('女巫')) return json(ww.witch, 300)
    }
    // 兜底
    return json({}, 200)
  }
}
