/**
 * useRunEngine · 把引擎事件流归约为 UI 结构化时间线
 * UI 只读这里派生的 blocks，不直接处理引擎事件
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import type {
  Artifact, EngineEvent, ExamBlueprint, ExamResult, FinalProposal, LLMConfig,
  MetricsSnapshot, ScenarioConfig, StrategyCombo, TaskProfile, TaskType,
} from '../engine/types'
import { createLLMCaller } from '../engine/llm'
import { createScriptedCaller, type ScriptData } from '../engine/scripted'
import { runInput } from '../engine/runner'

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
  metrics: MetricsSnapshot | null
  ledger: { total_tokens: number; calls: number; by_phase: Record<string, number> }
  examBlueprint: ExamBlueprint | null
  examResult: ExamResult | null
  finalProposal: FinalProposal | null
  artifactFeed: { artifact: Artifact; agent_id?: string }[]
}

const initialState: RunState = {
  status: 'idle',
  blocks: [],
  metrics: null,
  ledger: { total_tokens: 0, calls: 0, by_phase: {} },
  examBlueprint: null,
  examResult: null,
  finalProposal: null,
  artifactFeed: [],
}

export function useRunEngine() {
  const [state, setState] = useState<RunState>(initialState)
  const runIdRef = useRef(0)

  const apply = useCallback((e: EngineEvent) => {
    setState((prev) => reduceEvent(prev, e))
  }, [])

  const start = useCallback(
    async (input: string, opts: { llm?: LLMConfig | null; script?: ScriptData | null }) => {
      const runId = ++runIdRef.current
      setState({ ...initialState, status: 'running' })
      const caller = opts.llm
        ? createLLMCaller(opts.llm)
        : createScriptedCaller(opts.script!)
      const guardedApply = (e: EngineEvent) => {
        if (runId === runIdRef.current) apply(e)
      }
      try {
        await runInput(input, caller, guardedApply)
      } catch (err) {
        guardedApply({ t: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    },
    [apply],
  )

  const reset = useCallback(() => {
    runIdRef.current += 1
    setState(initialState)
  }, [])

  return useMemo(() => ({ state, start, reset }), [state, start, reset])
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
  const pushPhaseItem = (item: PhaseItem) => {
    const p = lastPhase()
    if (p) p.items = [...p.items, item]
  }

  switch (e.t) {
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
      let b = blocks.find((x) => x.kind === 'compile') as Extract<Block, { kind: 'compile' }> | undefined
      if (!b) {
        b = { kind: 'compile', steps: [] }
        blocks.push(b)
      }
      if (!b.steps.some((s) => s.step === e.step && s.name === e.name)) {
        b.steps = [...b.steps, { step: e.step, name: e.name, detail: e.detail, tokens: e.tokens }]
      }
      break
    }
    case 'compile_done': {
      const b = blocks.find((x) => x.kind === 'compile') as Extract<Block, { kind: 'compile' }> | undefined
      if (b) b.config = e.config
      break
    }
    case 'phase_start':
      blocks.push({ kind: 'phase', phase: { id: e.phase_id, name: e.name, purpose: e.purpose, strategy: e.strategy, done: false, items: [] } })
      break
    case 'phase_done': {
      const p = lastPhase()
      if (p && p.id === e.phase_id) p.done = true
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
      return { ...prev, blocks, status: 'done' }
  }
  return { ...prev, blocks }
}
