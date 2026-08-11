/**
 * Runner · 顶层运行器：用户输入 → Dispatcher → 三轨道
 * Live 模式与回放模式共用此运行器，区别仅在于 LLMCaller 的实现
 */
import { dispatch } from './dispatcher'
import { compileScenario } from './compiler'
import { OrchestrationEngine, type Emit } from './engine'
import { WerewolfGame } from './werewolf'
import { TokenLedger } from './ledger'
import type { LLMCaller } from './llm'
import type { ForceTrack, ScenarioConfig, TaskProfile } from './types'
import type { ComplexityClassification, ComplexityResult, ComplexityLevel, ComplexityDimensions, DimensionScore } from '../complexity'
import { classifyComplexity } from '../complexity'

/** classifyComplexity 服务不可用时的降级默认值 */
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
    method: 'distilbert_anchor_similarity_v1',
    rubric_version: 'v3',
  }
  return { result, tokens: 0, source: 'distilbert' }
}

async function safeClassify(query: string): Promise<ComplexityClassification> {
  try {
    return await classifyComplexity(query)
  } catch (e) {
    console.warn('Complexity service unavailable, using fallback:', e instanceof Error ? e.message : String(e))
    return emptyComplexity()
  }
}

export async function analyzeInput(
  userInput: string,
  caller: LLMCaller,
  emit: Emit,
  forceTrack?: ForceTrack,
): Promise<{ profile: TaskProfile; config?: ScenarioConfig }> {
  const ledger = new TokenLedger()
  emit({ t: 'complexity_start', user_input: userInput })
  const complexity = await safeClassify(userInput)
  ledger.record(complexity.tokens)
  emit({ t: 'complexity_done', result: complexity.result, tokens: complexity.tokens, source: complexity.source })
  emit({ t: 'dispatch_start', user_input: userInput })
  const { profile, tokens } = await dispatch(caller, userInput, (n) =>
    emit({ t: 'retry', reason: 'Dispatcher 分类 JSON 解析失败，自动重试', attempt: n }),
    forceTrack,
  )
  ledger.record(tokens)
  emit({ t: 'dispatch_done', profile, tokens })
  if (profile.task_type === 'single' || profile.agent_count <= 1) {
    emit({ t: 'track_decided', track: 'single', reason: forceTrack === 'single' ? '用户选择单 Agent 模式' : 'agent_count=1' })
    return { profile }
  }
  if (profile.task_type === 'competitive') {
    emit({ t: 'track_decided', track: 'competitive', reason: `博弈任务（game_type=${profile.game_type}）` })
    return { profile }
  }
  emit({ t: 'track_decided', track: 'collaborative', reason: forceTrack === 'multi' ? '用户选择多 Agent 议事模式' : '多方协作任务' })
  const config = await compileScenario(
    caller, userInput, profile,
    (step, name, detail, tk) => emit({ t: 'compile_step', step, name, detail, tokens: tk }),
    (n) => emit({ t: 'retry', reason: 'Agent 生成 JSON 解析失败，自动重试', attempt: n }),
  )
  emit({ t: 'compile_done', config })
  return { profile, config }
}

export interface PreparedRun {
  complexity?: ComplexityClassification
  profile?: TaskProfile
  config?: ScenarioConfig
}

export async function runInput(
  userInput: string,
  caller: LLMCaller,
  emit: Emit,
  options: { forceTrack?: ForceTrack; prepared?: PreparedRun } = {},
): Promise<void> {
  const ledger = new TokenLedger()
  emit({ t: 'complexity_start', user_input: userInput })
  const complexity = options.prepared?.complexity ?? await safeClassify(userInput)
  ledger.record(complexity.tokens)
  emit({ t: 'complexity_done', result: complexity.result, tokens: complexity.tokens, source: complexity.source })
  emit({ t: 'dispatch_start', user_input: userInput })

  const dispatched = options.prepared?.profile
    ? { profile: options.prepared.profile, tokens: 0 }
    : await dispatch(caller, userInput, (n) =>
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
    const { text, tokens: t2 } = await caller(
      '你是一个直接、可靠的助手，简明回答用户问题。',
      userInput,
    )
    ledger.record(t2)
    emit({ t: 'speech', agent_id: '__assistant', name: 'Assistant', content: text, audience: 'public', tokens: t2 })
    emit({ t: 'phase_done', phase_id: 'direct', name: '单 Agent 直接回答' })
    emit({ t: 'ledger', ...ledger.snapshot() })
    emit({
      t: 'report',
      markdown: `## 运行记录\n\n**输入**：${userInput}\n\n**路由**：单 Agent 轨道（Dispatcher 判定 agent_count=1）\n\n**成本**：仅 ${ledger.total} tokens / ${ledger.calls} 次调用——对比协作轨道的数十次调用，这就是 Dispatcher 存在的意义：不是所有问题都值得启动多智能体。`,
    })
    emit({ t: 'run_done', elapsed_ms: 0 })
    return
  }

  // ---- 轨道二：博弈扩展 ----
  if (profile.task_type === 'competitive') {
    emit({ t: 'track_decided', track: 'competitive', reason: `检测到博弈任务（game_type=${profile.game_type}）→ GameRegistry 加载扩展，复用通用策略，核心框架零改动` })
    const game = new WerewolfGame(caller, emit)
    await game.run(userInput)
    return
  }

  // ---- 轨道三：协作编排 ----
  emit({ t: 'track_decided', track: 'collaborative', reason: `判定为多方协作任务 → Scenario Compiler 编译场景配置` })
  const config = options.prepared?.config ?? await compileScenario(
    caller,
    userInput,
    profile,
    (step, name, detail, tk) => emit({ t: 'compile_step', step, name, detail, tokens: tk }),
    (n) => emit({ t: 'retry', reason: 'Agent 生成 JSON 解析失败，自动重试', attempt: n }),
  )
  if (options.prepared?.config) {
    emit({ t: 'compile_step', step: 3, name: '复用已确认配置', detail: '复用分析阶段生成的 Agent Pool、策略与阶段配置，避免重复调用与结果漂移', tokens: 0 })
  }
  emit({ t: 'compile_done', config })
  const engine = new OrchestrationEngine(caller, emit)
  await engine.runCollaborative(config)
}
