/**
 * Runner · 顶层运行器：用户输入 → Dispatcher → 三轨道
 * Live 模式与回放模式共用此运行器，区别仅在于 LLMCaller 的实现
 */
import { dispatch } from './dispatcher'
import { compileScenario } from './compiler'
import { OrchestrationEngine, type Emit } from './engine'
import { GAME_REGISTRY } from './game-specs'
import { GenericGameEngine, generateGameSpec, searchGameRules } from './game-engine'
import { TokenLedger } from './ledger'
import type { LLMCaller } from './llm'
import type { ForceTrack, ModelInvocation, ScenarioConfig, TaskProfile } from './types'
import type { ComplexityClassification, ComplexityResult, ComplexityLevel, ComplexityDimensions, DimensionScore } from '../complexity'
import { classifyComplexity } from '../complexity'
import { InvocationAudit } from './framework/audit'
import { createTerminalReport } from './framework/events'
import { attachmentContext, type Attachment } from '../lib/attachments'

/** 中文游戏名到 GameSpec key 的输入规范化；只负责路由，不写死游戏规则。 */
function resolveGameTypeAlias(userInput: string, dispatcherGameType: string): string {
  const aliases: [RegExp, string][] = [
    [/谁是卧底|卧底游戏/, 'undercover'],
    [/杀人游戏|警察.*杀手|杀手.*警察/, 'mafia'],
    [/狼人杀/, 'werewolf'],
    [/阿瓦隆|抵抗组织/, 'avalon'],
    [/德州扑克|扑克/, 'poker'],
  ]
  for (const [pattern, gameType] of aliases) {
    if (pattern.test(userInput)) return gameType
  }
  return dispatcherGameType
}

/** Complexity API 不可用时的保守降级值 */
function emptyComplexity(): ComplexityClassification {
  const dims: ComplexityDimensions = {
    reasoning_depth: 3 as DimensionScore,
    step_count: 2 as DimensionScore,
    domain_expertise: 3 as DimensionScore,
    tool_dependency: 1 as DimensionScore,
    coordination: 2 as DimensionScore,
    uncertainty: 2 as DimensionScore,
  }
  const result: ComplexityResult = {
    complexity: 3 as ComplexityLevel,
    dimensions: dims,
    dimension_confidence: { reasoning_depth: 0, step_count: 0, domain_expertise: 0, tool_dependency: 0, coordination: 0, uncertainty: 0 },
    confidence: 0,
    model: 'fallback',
    latency_ms: 0,
    method: 'rubric_llm_api_v1',
    rubric_version: 'ma-collab-complexity-v3-api-rubric',
  }
  return { result, tokens: 0, source: 'api' }
}

async function safeClassify(query: string, caller: LLMCaller): Promise<ComplexityClassification> {
  try {
    return await classifyComplexity(query, caller)
  } catch (e) {
    console.warn('Complexity API unavailable, using fallback:', e instanceof Error ? e.message : String(e))
    return emptyComplexity()
  }
}

export async function analyzeInput(
  userInput: string,
  caller: LLMCaller,
  emit: Emit,
  forceTrack?: ForceTrack,
  attachments: Attachment[] = [],
): Promise<{ profile: TaskProfile; config?: ScenarioConfig }> {
  const ledger = new TokenLedger()
  const invocationAudit = new InvocationAudit()
  const auditedCaller = invocationAudit.wrap(caller)
  emit({ t: 'complexity_start', user_input: userInput })
  const complexity = await safeClassify(userInput, caller)
  ledger.record(complexity.tokens)
  emit({ t: 'complexity_done', result: complexity.result, tokens: complexity.tokens, source: complexity.source })
  emit({ t: 'dispatch_start', user_input: userInput })
  invocationAudit.setContext('dispatch')
  const { profile, tokens } = await dispatch(auditedCaller, userInput, (n) =>
    emit({ t: 'retry', reason: 'Dispatcher 分类 JSON 解析失败，自动重试', attempt: n }),
    forceTrack,
  )
  ledger.record(tokens)
  emit({ t: 'dispatch_done', profile, tokens })
  if (profile.task_type === 'single' || profile.agent_count <= 1) {
    emit({ t: 'track_decided', track: 'single', reason: forceTrack === 'single' ? '用户选择单 Agent 模式' : 'agent_count=1' })
    emit({ t: 'audit_snapshot', model_invocations: invocationAudit.snapshot() })
    return { profile }
  }
  if (profile.task_type === 'competitive') {
    emit({ t: 'track_decided', track: 'competitive', reason: `博弈任务（game_type=${profile.game_type}）` })
    emit({ t: 'audit_snapshot', model_invocations: invocationAudit.snapshot() })
    return { profile }
  }
  emit({ t: 'track_decided', track: 'collaborative', reason: forceTrack === 'multi' ? '用户选择多 Agent 议事模式' : '多方协作任务' })
  invocationAudit.setContext('compile')
  const config = await compileScenario(
    auditedCaller, userInput, profile,
    (step, name, detail, tk) => emit({ t: 'compile_step', step, name, detail, tokens: tk }),
    (n) => emit({ t: 'retry', reason: 'Agent 生成 JSON 解析失败，自动重试', attempt: n }),
    attachmentContext(attachments),
  )
  emit({ t: 'compile_done', config })
  emit({ t: 'audit_snapshot', model_invocations: invocationAudit.snapshot() })
  return { profile, config }
}

export interface PreparedRun {
  complexity?: ComplexityClassification
  profile?: TaskProfile
  config?: ScenarioConfig
  modelInvocations?: ModelInvocation[]
}

export async function runInput(
  userInput: string,
  caller: LLMCaller,
  emit: Emit,
  options: { forceTrack?: ForceTrack; prepared?: PreparedRun; callerForAgent?: (agentId?: string) => LLMCaller | undefined; attachments?: Attachment[] } = {},
): Promise<void> {
  const ledger = new TokenLedger()
  const invocationAudit = new InvocationAudit(options.prepared?.modelInvocations)
  const auditedCaller = invocationAudit.wrap(caller)
  emit({ t: 'complexity_start', user_input: userInput })
  const complexity = options.prepared?.complexity ?? await safeClassify(userInput, caller)
  ledger.record(complexity.tokens)
  emit({ t: 'complexity_done', result: complexity.result, tokens: complexity.tokens, source: complexity.source })
  emit({ t: 'dispatch_start', user_input: userInput })

  invocationAudit.setContext('dispatch')
  const dispatched = options.prepared?.profile
    ? { profile: options.prepared.profile, tokens: 0 }
    : await dispatch(auditedCaller, userInput, (n) =>
      emit({ t: 'retry', reason: 'Dispatcher 分类 JSON 解析失败，自动重试', attempt: n }),
      options.forceTrack,
    )
  const { profile, tokens } = dispatched
  ledger.record(tokens)
  emit({ t: 'dispatch_done', profile, tokens })

  // ---- 轨道一：单 Agent 直接回答（跳过编排） ----
  if (profile.task_type === 'single' || profile.agent_count <= 1) {
    emit({ t: 'track_decided', track: 'single', reason: `agent_count=1：任务无需多智能体协作，直接回答（跳过编排，省下整套编译与议事成本）` })
    emit({
      t: 'phase_start', phase_id: 'direct', name: '单 Agent 直接回答', purpose: '不进入编排引擎',
      strategy: { A: [], B: 'B1', C: 'C1', D: 'D1', E: [], notes: ['无策略配方：单 Agent 轨道不使用原子策略'] },
    })
    invocationAudit.setContext('direct', '__assistant')
    const evidenceText = attachmentContext(options.attachments ?? [])
    const { text, tokens: t2 } = await auditedCaller(
      '你是一个直接、可靠的助手，简明回答用户问题。若用户提供附件证据，回答必须明确引用并基于附件内容。',
      evidenceText ? `${userInput}\n\n【议事证据材料】\n${evidenceText}` : userInput,
    )
    ledger.record(t2)
    emit({ t: 'speech', agent_id: '__assistant', name: 'Assistant', content: text, audience: 'public', tokens: t2 })
    emit({ t: 'phase_done', phase_id: 'direct', name: '单 Agent 直接回答' })
    emit({ t: 'ledger', ...ledger.snapshot() })
    emit({
      t: 'report',
      markdown: `## 运行记录\n\n**输入**：${userInput}\n\n**路由**：单 Agent 轨道（Dispatcher 判定 agent_count=1）\n\n**成本**：仅 ${ledger.total} tokens / ${ledger.calls} 次调用——对比协作轨道的数十次调用，这就是 Dispatcher 存在的意义：不是所有问题都值得启动多智能体。`,
    })
    emit({ t: 'terminal_report', report: createTerminalReport({ terminalState: 'DECIDED', trace: [{ phase_id: 'direct', state: 'completed' }], reasonCodes: ['terminal:DECIDED', 'single_agent_direct'], unresolvedItems: [], missingEvidence: [], minorityPositions: [], recommendedNextActions: [] }) })
    emit({ t: 'audit_snapshot', model_invocations: invocationAudit.snapshot() })
    emit({ t: 'run_done', elapsed_ms: 0, terminal_state: 'DECIDED' })
    return
  }

  // ---- 轨道二：博弈扩展 ----
  if (profile.task_type === 'competitive') {
    const gameType = resolveGameTypeAlias(userInput, profile.game_type ?? 'unknown')
    emit({ t: 'track_decided', track: 'competitive', reason: `检测到博弈任务（game_type=${gameType}）→ GameSpec 动态装配，复用通用原子策略，不再枚举硬编码游戏` })
    let gameSpec = GAME_REGISTRY[gameType]
    if (!gameSpec) {
      try {
        const ruleContext = await searchGameRules(gameType, userInput)
        gameSpec = await generateGameSpec(auditedCaller, userInput, ruleContext)
        emit({ t: 'adaptation', trigger: `未在注册表找到博弈「${gameType}」`, action: '由通用规则编译器动态生成 GameSpec', scope: '博弈轨道' })
      } catch (error) {
        throw new Error(`无法为博弈「${gameType}」生成可执行规则：${error instanceof Error ? error.message : String(error)}`)
      }
    }
    invocationAudit.setContext('competitive_game')
    const game = new GenericGameEngine(auditedCaller, (event) => {
      if (event.t === 'run_done') {
        const terminal = event.terminal_state ?? 'PROVISIONAL'
        emit({ t: 'terminal_report', report: createTerminalReport({ terminalState: terminal, trace: [{ phase_id: 'competitive_game', state: 'completed' }], reasonCodes: [`terminal:${terminal}`, 'competitive_game_complete'], unresolvedItems: [], missingEvidence: [], minorityPositions: [], recommendedNextActions: [] }) })
        emit({ t: 'audit_snapshot', model_invocations: invocationAudit.snapshot() })
      }
      emit(event)
    })
    await game.run(gameSpec, userInput, { playerCount: profile.agent_count })
    return
  }

  // ---- 轨道三：协作编排 ----
  emit({ t: 'track_decided', track: 'collaborative', reason: `判定为多方协作任务 → Scenario Compiler 编译场景配置` })
  invocationAudit.setContext('compile')
  const config = options.prepared?.config ?? await compileScenario(
    auditedCaller,
    userInput,
    profile,
    (step, name, detail, tk) => emit({ t: 'compile_step', step, name, detail, tokens: tk }),
    (n) => emit({ t: 'retry', reason: 'Agent 生成 JSON 解析失败，自动重试', attempt: n }),
    attachmentContext(options.attachments ?? []),
  )
  if (options.prepared?.config) {
    emit({ t: 'compile_step', step: 3, name: '复用已确认配置', detail: '复用分析阶段生成的 Agent Pool、策略与阶段配置，避免重复调用与结果漂移', tokens: 0 })
  }
  emit({ t: 'compile_done', config })
  const engine = new OrchestrationEngine(caller, emit, { invocationAudit, callerForAgent: options.callerForAgent })
  await engine.runCollaborative(config)
}
