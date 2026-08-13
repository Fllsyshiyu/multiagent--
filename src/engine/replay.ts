import type { LLMCaller } from './llm'
import type { TaskProfile } from './types'
import { parseGameRequest } from './game-request'
import { createScriptedCaller, type ScriptData } from './scripted'

interface ReplayGameContext {
  action_id: string
  primitive: string
  player: { id: string; name: string; role: string; role_label: string; team: string; private_info: string }
  alive_players: { id: string; name: string }[]
  valid_targets: { id: string; name: string }[]
  proposed_team: string[]
  required_team_size: number | null
  quest_number: number
  public_log: string[]
}

function offlineProfile(userInput: string): TaskProfile {
  const request = parseGameRequest(userInput)
  if (request.gameType) {
    const defaults: Record<string, number> = { werewolf: 6, undercover: 6, mafia: 8, avalon: 8, poker: 6 }
    return {
      agent_count: request.playerCount ?? defaults[request.gameType] ?? 6,
      task_type: 'competitive',
      game_type: request.gameType,
      domain: 'game',
      time_pressure: 'sustained',
      information_asymmetry: 'high',
      agent_relations: 'adversarial',
      decision_pattern: 'sequential',
      resource_scarcity: 'high',
      verifiability: 'automatable',
      reasoning: `离线规则识别：${request.gameType}${request.playerCount ? `，${request.playerCount} 名玩家` : ''}`,
    }
  }
  return {
    agent_count: 1,
    task_type: 'single',
    game_type: null,
    domain: 'general',
    time_pressure: 'relaxed',
    information_asymmetry: 'low',
    agent_relations: 'cooperative',
    decision_pattern: 'single_shot',
    resource_scarcity: 'low',
    verifiability: 'subjective',
    reasoning: '离线模式未识别到已注册游戏，使用单 Agent 提示用户配置 Live 模式。',
  }
}

function extractContext(system: string): ReplayGameContext | null {
  const marker = '[GAME_CONTEXT]\n'
  const start = system.lastIndexOf(marker)
  if (start < 0) return null
  try {
    return JSON.parse(system.slice(start + marker.length).trim()) as ReplayGameContext
  } catch {
    return null
  }
}

function nextTarget(context: ReplayGameContext): string {
  if (!context.valid_targets.length) return ''
  const ownNumber = Number(context.player.id.replace(/\D/g, '')) || 0
  return context.valid_targets[ownNumber % context.valid_targets.length].id
}

function gameResponse(context: ReplayGameContext): Record<string, unknown> {
  switch (context.primitive) {
    case 'private_chat':
      return { content: `建议观察并针对 ${nextTarget(context)}，避免暴露同伴。`, suggest_target: nextTarget(context) }
    case 'select_target':
    case 'inspect_role':
      return { target: nextTarget(context), reason: '基于当前公开信息选择' }
    case 'decide_life':
      return { use_antidote: context.quest_number === 1, poison_target: null, reason: '首轮优先保留更多公开信息' }
    case 'public_speech':
      return {
        content: `我是${context.player.name}。目前信息有限，我会结合前序发言、组队记录和投票变化继续判断。`,
        suspect: context.valid_targets[0]?.id ?? null,
      }
    case 'vote':
      return { target: nextTarget(context), reason: '其当前行为与公开信息最不一致' }
    case 'propose_team': {
      const required = context.required_team_size ?? Math.min(2, context.alive_players.length)
      const ownIndex = Math.max(0, context.alive_players.findIndex((player) => player.id === context.player.id))
      const team: string[] = []
      for (let offset = 0; offset < context.alive_players.length && team.length < required; offset++) {
        const candidate = context.alive_players[(ownIndex + offset) % context.alive_players.length]
        if (!team.includes(candidate.id)) team.push(candidate.id)
      }
      return { team, reason: '采用轮换队长下的可追踪组队方案' }
    }
    case 'approve_team':
      return { approve: true, reason: context.proposed_team.includes(context.player.id) ? '我在队内，愿意接受检验' : '先用任务结果获取信息' }
    case 'quest_vote':
      return { quest_success: context.player.team !== 'evil', reason: context.player.team === 'evil' ? '选择破坏任务' : '好人必须提交成功票' }
    case 'assassinate':
      return { target: nextTarget(context), reason: '根据组队与投票轨迹判断关键角色' }
    default:
      return {}
  }
}

/**
 * 无 Key 时：原样预设继续使用剧本；自由输入则使用按输入解析的确定性博弈应答，
 * 避免任意文本静默套用六人狼人杀或第一个预设。
 */
export function createReplayCaller(userInput: string, script?: ScriptData | null): LLMCaller {
  if (script) return createScriptedCaller(script)
  const profile = offlineProfile(userInput)
  const result = (value: unknown, tokens = 160) => Promise.resolve({
    text: typeof value === 'string' ? value : JSON.stringify(value),
    tokens,
    invocation: { mode: 'replay' as const, model: 'adaptive-offline-replay', latency_ms: 0, result_status: 'success' as const },
  })

  return async (system: string) => {
    if (system.includes('Query Complexity 评估器')) {
      return result({
        dimensions: {
          reasoning_depth: { score: 3, confidence: 0.82 }, step_count: { score: 4, confidence: 0.82 },
          domain_expertise: { score: 2, confidence: 0.82 }, tool_dependency: { score: 0, confidence: 0.9 },
          coordination: { score: profile.task_type === 'competitive' ? 5 : 1, confidence: 0.88 },
          uncertainty: { score: profile.task_type === 'competitive' ? 4 : 2, confidence: 0.82 },
        },
        confidence: 0.84,
      }, 220)
    }
    if (system.includes('MA-Collab 编排框架的 Dispatcher')) return result(profile, 220)
    if (system.includes('直接、可靠的助手')) {
      return result('当前未配置 API Key。离线模式可直接运行已注册的博弈（如“12 个人玩狼人杀”或“8 个人玩阿瓦隆”）；其他自由任务请配置 Live 模式。', 80)
    }
    const context = extractContext(system)
    if (context) return result(gameResponse(context), 120)
    return result({}, 80)
  }
}
