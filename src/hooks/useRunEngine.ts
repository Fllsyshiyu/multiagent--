/**
 * useRunEngine · 把引擎事件流归约为 UI 结构化时间线
 * UI 只读这里派生的 blocks，不直接处理引擎事件
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import type {
  AgentLLMConfig, Artifact, EngineEvent, ExamBlueprint, ExamResult, FinalProposal, LLMConfig,
  EventRuleEvaluation, ImpasseReport, MetricsSnapshot, ModelInvocation, RunTraceEntry, StrategyCombo, TaskType, TerminalReport, TerminalState,
} from '../engine/types'
import { createLLMCaller } from '../engine/llm'
import { createScriptedCaller, type ScriptData } from '../engine/scripted'
import { analyzeInput, runInput, type PreparedRun } from '../engine/runner'
import type { ForceTrack, ScenarioConfig, TaskProfile } from '../engine/types'

export interface PhaseItem {
  kind: 'agent_start' | 'artifact' | 'speech' | 'fishbowl_plan' | 'adaptation' | 'retry' | 'game_event' | 'game_state' | 'vote' | 'exam_frozen' | 'exam_result' | 'final_proposal'
  data: EngineEvent
}

export interface PhaseBlock {
  id: string
  name: string
  purpose: string
  strategy: StrategyCombo
  done: boolean
  items: PhaseItem[]
}

export type Block =
  | { kind: 'complexity'; running: boolean; result?: import('../complexity').ComplexityResult; tokens?: number; source?: 'distilbert' }
  | { kind: 'dispatch'; running: boolean; profile?: TaskProfile; tokens?: number }
  | { kind: 'track'; track: TaskType; reason: string }
  | { kind: 'compile'; steps: { step: number; name: string; detail: string; tokens: number }[]; config?: ScenarioConfig }
  | { kind: 'phase'; phase: PhaseBlock }
  | { kind: 'adaptation'; trigger: string; action: string; scope: string }
  | { kind: 'report'; markdown: string }
  | { kind: 'error'; message: string }

export interface RunState {
  status: 'idle' | 'running' | 'done' | 'error'
  blocks: Block[]
  /** 分析阶段产出的暂存配置（用户确认后才真正启动引擎） */
  stagedConfig: ScenarioConfig | null
  stagedProfile: TaskProfile | null
  metrics: MetricsSnapshot | null
  ledger: { total_tokens: number; calls: number; by_phase: Record<string, number> }
  examBlueprint: ExamBlueprint | null
  examResult: ExamResult | null
  finalProposal: FinalProposal | null
  artifactFeed: { artifact: Artifact; agent_id?: string }[]
  modelInvocations: ModelInvocation[]
  runTrace: RunTraceEntry[]
  terminalState: TerminalState | null
  terminalReport: TerminalReport | null
  impasseReport: ImpasseReport | null
  eventEvaluations: EventRuleEvaluation[]
}

const initialState: RunState = {
  status: 'idle',
  blocks: [],
  stagedConfig: null,
  stagedProfile: null,
  metrics: null,
  ledger: { total_tokens: 0, calls: 0, by_phase: {} },
  examBlueprint: null,
  examResult: null,
  finalProposal: null,
  artifactFeed: [],
  modelInvocations: [],
  runTrace: [],
  terminalState: null,
  terminalReport: null,
  impasseReport: null,
  eventEvaluations: [],
}

export function useRunEngine() {
  const [state, setState] = useState<RunState>(initialState)
  const [delibMode, setDelibMode] = useState<ForceTrack>('auto')
  const runIdRef = useRef(0)

  const apply = useCallback((e: EngineEvent) => {
    setState((prev) => reduceEvent(prev, e))
  }, [])

  /** 分析阶段：仅运行 Dispatcher + Compiler，编译出 Agent Pool 但不启动引擎 */
  const analyze = useCallback(
    async (input: string, opts: { llm?: LLMConfig | null; script?: ScriptData | null; forceTrack?: ForceTrack }) => {
      const runId = ++runIdRef.current
      setState({ ...initialState, status: 'running' })
      const caller = opts.llm
        ? createLLMCaller(opts.llm)
        : createScriptedCaller(opts.script!)
      const guardedApply = (e: EngineEvent) => {
        if (runId === runIdRef.current) apply(e)
      }
      try {
        const result = await analyzeInput(input, caller, guardedApply, opts.forceTrack)
        if (runId === runIdRef.current) {
          setState((prev) => ({
            ...prev,
            status: 'idle',
            stagedConfig: result.config ?? null,
            stagedProfile: result.profile ?? null,
          }))
        }
      } catch (err) {
        guardedApply({ t: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    },
    [apply],
  )

  const start = useCallback(
    async (input: string, opts: {
      llm?: LLMConfig | null
      agentLLM?: AgentLLMConfig
      script?: ScriptData | null
      forceTrack?: ForceTrack
      prepared?: PreparedRun
    }) => {
      const runId = ++runIdRef.current
      const preparedInvocations = opts.prepared?.modelInvocations ?? []
      setState({ ...initialState, status: 'running', modelInvocations: preparedInvocations })
      const caller = opts.llm
        ? createLLMCaller(opts.llm)
        : createScriptedCaller(opts.script!)
      const perAgentCallers = new Map<string, ReturnType<typeof createLLMCaller>>()
      if (opts.agentLLM?.mode === 'per_agent') {
        for (const [agentId, config] of Object.entries(opts.agentLLM.per_agent ?? {})) {
          perAgentCallers.set(agentId, createLLMCaller(config))
        }
      }
      const sharedCaller = opts.agentLLM?.shared ? createLLMCaller(opts.agentLLM.shared) : undefined
      const callerForAgent = opts.llm
        ? (agentId?: string) => (agentId ? perAgentCallers.get(agentId) : undefined) ?? sharedCaller
        : undefined
      const guardedApply = (e: EngineEvent) => {
        if (runId === runIdRef.current) apply(e)
      }
      try {
        await runInput(input, caller, guardedApply, { forceTrack: opts.forceTrack, prepared: opts.prepared, callerForAgent })
      } catch (err) {
        guardedApply({ t: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    },
    [apply],
  )

  /** 清空暂存的分析结果 */
  const clearStaged = useCallback(() => {
    setState((prev) => ({ ...prev, stagedConfig: null, stagedProfile: null, blocks: [], status: 'idle' }))
  }, [])

  const reset = useCallback(() => {
    runIdRef.current += 1
    setState(initialState)
  }, [])

  return useMemo(() => ({ state, start, reset, analyze, clearStaged, delibMode, setDelibMode }), [state, start, reset, analyze, clearStaged, delibMode])
}

function reduceEvent(prev: RunState, e: EngineEvent): RunState {
  const blocks = [...prev.blocks]
  const lastPhase = (): PhaseBlock | null => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i]
      if (b.kind === 'phase') return b.phase
    }
    return null
  }
  const updateLastPhase = (update: (phase: PhaseBlock) => PhaseBlock) => {
    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i]
      if (block.kind === 'phase') {
        blocks[i] = { kind: 'phase', phase: update(block.phase) }
        return
      }
    }
  }
  const pushPhaseItem = (item: PhaseItem) => {
    updateLastPhase((phase) => ({ ...phase, items: [...phase.items, item] }))
  }

  switch (e.t) {
    case 'complexity_start':
      blocks.push({ kind: 'complexity', running: true })
      break
    case 'complexity_done': {
      const i = blocks.findIndex((b) => b.kind === 'complexity')
      if (i >= 0) blocks[i] = { kind: 'complexity', running: false, result: e.result, tokens: e.tokens, source: e.source }
      break
    }
    case 'dispatch_start':
      blocks.push({ kind: 'dispatch', running: true })
      break
    case 'dispatch_done': {
      const i = blocks.findIndex((b) => b.kind === 'dispatch')
      if (i >= 0) blocks[i] = { kind: 'dispatch', running: false, profile: e.profile, tokens: e.tokens }
      break
    }
    case 'track_decided':
      blocks.push({ kind: 'track', track: e.track, reason: e.reason })
      break
    case 'compile_step': {
      const i = blocks.findIndex((block) => block.kind === 'compile')
      if (i < 0) {
        blocks.push({ kind: 'compile', steps: [{ step: e.step, name: e.name, detail: e.detail, tokens: e.tokens }] })
      } else {
        const block = blocks[i]
        if (block.kind === 'compile' && !block.steps.some((step) => step.step === e.step && step.name === e.name)) {
          blocks[i] = { ...block, steps: [...block.steps, { step: e.step, name: e.name, detail: e.detail, tokens: e.tokens }] }
        }
      }
      break
    }
    case 'compile_done': {
      const i = blocks.findIndex((block) => block.kind === 'compile')
      const block = blocks[i]
      if (block?.kind === 'compile') blocks[i] = { ...block, config: e.config }
      break
    }
    case 'phase_start':
      blocks.push({ kind: 'phase', phase: { id: e.phase_id, name: e.name, purpose: e.purpose, strategy: e.strategy, done: false, items: [] } })
      break
    case 'phase_done': {
      const phase = lastPhase()
      if (phase?.id === e.phase_id) updateLastPhase((current) => ({ ...current, done: true }))
      break
    }
    case 'agent_start':
      pushPhaseItem({ kind: 'agent_start', data: e })
      break
    case 'artifact':
      pushPhaseItem({ kind: 'artifact', data: e })
      return { ...prev, blocks, artifactFeed: [...prev.artifactFeed, { artifact: e.artifact, agent_id: e.agent_id }] }
    case 'speech':
      pushPhaseItem({ kind: 'speech', data: e })
      break
    case 'fishbowl_plan':
      pushPhaseItem({ kind: 'fishbowl_plan', data: e })
      break
    case 'adaptation':
      blocks.push({ kind: 'adaptation', trigger: e.trigger, action: e.action, scope: e.scope })
      break
    case 'retry':
      pushPhaseItem({ kind: 'retry', data: e })
      break
    case 'metrics':
      return { ...prev, blocks, metrics: e.snapshot }
    case 'ledger':
      return { ...prev, blocks, ledger: { total_tokens: e.total_tokens, calls: e.calls, by_phase: e.by_phase } }
    case 'audit_snapshot':
      return {
        ...prev,
        blocks,
        modelInvocations: e.model_invocations,
        runTrace: e.run_trace ?? prev.runTrace,
      }
    case 'event_rule_fired':
      return { ...prev, blocks, eventEvaluations: [...prev.eventEvaluations, e.evaluation] }
    case 'impasse_report':
      return { ...prev, blocks, impasseReport: e.report }
    case 'terminal_report':
      return { ...prev, blocks, terminalReport: e.report }
    case 'exam_frozen':
      pushPhaseItem({ kind: 'exam_frozen', data: e })
      return { ...prev, blocks, examBlueprint: e.blueprint }
    case 'exam_result':
      pushPhaseItem({ kind: 'exam_result', data: e })
      return { ...prev, blocks, examResult: e.result }
    case 'final_proposal':
      pushPhaseItem({ kind: 'final_proposal', data: e })
      return { ...prev, blocks, finalProposal: e.proposal }
    case 'game_event':
    case 'game_state':
    case 'vote':
      pushPhaseItem({ kind: e.t, data: e } as PhaseItem)
      break
    case 'report':
      blocks.push({ kind: 'report', markdown: e.markdown })
      break
    case 'error':
      blocks.push({ kind: 'error', message: e.message })
      return { ...prev, blocks, status: 'error' }
    case 'run_done':
      return { ...prev, blocks, status: 'done', terminalState: e.terminal_state ?? 'PROVISIONAL' }
  }
  return { ...prev, blocks }
}
