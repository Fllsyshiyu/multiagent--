import type { GuardSet, Phase, PhaseGraph, RunTraceEntry, TerminalState } from '../types'

function traceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export class RunTrace {
  readonly runId: string
  private entries: RunTraceEntry[] = []

  constructor(runId = `run_${Date.now()}`) {
    this.runId = runId
  }

  record(phaseId: string, state: RunTraceEntry['state'], transitionReason: string, inputRefs: string[] = [], outputRefs: string[] = []) {
    this.entries.push({
      id: traceId(), version: 1, created_at: new Date().toISOString(), created_by: 'graph_executor',
      source_refs: [...inputRefs, ...outputRefs], visibility: ['audit'], status: state === 'failed' ? 'rejected' : 'valid',
      run_id: this.runId, phase_id: phaseId, state, transition_reason: transitionReason,
      input_refs: inputRefs, output_refs: outputRefs,
    })
  }

  snapshot(): RunTraceEntry[] {
    return [...this.entries]
  }
}

export interface GuardUsage {
  tokens: number
  calls: number
  elapsedMs: number
}

export class RuntimeGuards {
  private readonly guards: GuardSet

  constructor(guards: GuardSet) {
    this.guards = guards
  }

  check(usage: GuardUsage, phase?: Phase): { allowed: boolean; terminal?: TerminalState; reason?: string; softLimit: boolean; reserveFinalization?: boolean } {
    const tokenRatio = usage.tokens / Math.max(1, this.guards.max_tokens)
    const callRatio = usage.calls / Math.max(1, this.guards.max_model_calls)
    const timeRatio = usage.elapsedMs / Math.max(1, this.guards.hard_timeout_ms)
    const finalizationStart = 1 - this.guards.reserved_finalization_ratio
    const budgetRatio = Math.max(tokenRatio, callRatio, timeRatio)
    const isMandatoryFinalization = phase?.kind === 'evaluate' || phase?.kind === 'report'
    if (budgetRatio >= finalizationStart && phase?.skippable_on_deadline && !isMandatoryFinalization) {
      return { allowed: false, reason: '进入最终总结预留预算，跳过可选阶段', softLimit: true, reserveFinalization: true }
    }
    if (budgetRatio >= 1) {
      return { allowed: false, terminal: 'PROVISIONAL', reason: '达到 Token、调用次数或时间硬截止', softLimit: true }
    }
    return { allowed: true, softLimit: Math.max(tokenRatio, callRatio, timeRatio) >= this.guards.soft_limit_ratio }
  }
}

export interface PhaseExecutionResult {
  condition: string
  terminal?: TerminalState
  inputRefs?: string[]
  outputRefs?: string[]
}

export class GraphExecutor {
  private readonly graph: PhaseGraph
  private readonly trace: RunTrace
  private readonly guards: RuntimeGuards

  constructor(
    graph: PhaseGraph,
    trace: RunTrace,
    guards: RuntimeGuards,
  ) {
    this.graph = graph
    this.trace = trace
    this.guards = guards
  }

  async run(
    execute: (phase: Phase, softLimit: boolean) => Promise<PhaseExecutionResult>,
    usage: () => GuardUsage,
  ): Promise<TerminalState> {
    const phases = new Map(this.graph.phases.map((phase) => [phase.id, phase]))
    const completed = new Set<string>()
    let currentId: string | undefined = this.graph.entry_phase_id
    let steps = 0
    const maxSteps = Math.max(8, this.graph.phases.length * 4)
    const retries = new Map<string, number>()

    while (currentId) {
      if (++steps > maxSteps) return 'ABORTED'
      const phase = phases.get(currentId)
      if (!phase) return 'ABORTED'
      if (phase.depends_on.some((dependency) => !completed.has(dependency))) {
        this.trace.record(phase.id, 'failed', '依赖未满足')
        return 'ABORTED'
      }
      const guard = this.guards.check(usage(), phase)
      if (!guard.allowed) {
        this.trace.record(phase.id, 'skipped', guard.reason ?? 'Guard 阻止执行')
        if (guard.reserveFinalization) {
          // 被预算预留跳过的可选阶段视作已处理，使其后的强制校验与报告仍可执行。
          completed.add(phase.id)
          currentId = phase.transitions.find((candidate) => candidate.condition === 'artifacts_valid')?.target
            ?? phase.transitions[0]?.target
          continue
        }
        return guard.terminal ?? 'PROVISIONAL'
      }
      this.trace.record(phase.id, 'running', '依赖、入口条件和 Guard 已通过')
      try {
        const result = await execute(phase, guard.softLimit)
        this.trace.record(phase.id, 'completed', result.condition, result.inputRefs, result.outputRefs)
        completed.add(phase.id)
        if (result.terminal) return result.terminal
        const transition = phase.transitions.find((candidate) => candidate.condition === result.condition)
          ?? phase.transitions.find((candidate) => candidate.condition === 'artifacts_valid')
        if (transition?.target === phase.id && transition.max_retries !== undefined) {
          const used = retries.get(phase.id) ?? 0
          if (used >= transition.max_retries) {
            this.trace.record(phase.id, 'skipped', `检查点重试次数已达上限 ${transition.max_retries}`)
            return 'PROVISIONAL'
          }
          retries.set(phase.id, used + 1)
        }
        currentId = transition?.target
      } catch (error) {
        this.trace.record(phase.id, 'failed', error instanceof Error ? error.message : String(error))
        const retryTransition = phase.transitions.find((transition) => transition.target === phase.failure_target && transition.max_retries !== undefined)
        const used = retries.get(phase.id) ?? 0
        if (phase.failure_target && retryTransition && used < (retryTransition.max_retries ?? 0)) {
          retries.set(phase.id, used + 1)
          currentId = phase.failure_target
        } else return 'ABORTED'
      }
    }
    return this.graph.phases.some((phase) => phase.kind === 'report' && completed.has(phase.id)) ? 'DECIDED' : 'PROVISIONAL'
  }
}

export interface DAGBatchExecutionResult {
  terminal?: TerminalState
  inputRefs?: string[]
  outputRefs?: string[]
}

/**
 * 面向显式 depends_on DAG 的分批执行器。每批只激活依赖已完成的节点；
 * 同批节点可并行，批次之间保持确定性拓扑顺序。
 */
export class DAGBatchExecutor {
  private readonly graph: PhaseGraph
  private readonly trace: RunTrace
  private readonly guards: RuntimeGuards

  constructor(
    graph: PhaseGraph,
    trace: RunTrace,
    guards: RuntimeGuards,
  ) {
    this.graph = graph
    this.trace = trace
    this.guards = guards
  }

  async run(
    execute: (phase: Phase, softLimit: boolean) => Promise<DAGBatchExecutionResult>,
    usage: () => GuardUsage,
    maxBatchSize = 4,
  ): Promise<TerminalState> {
    const pending = new Map(this.graph.phases.map((phase, index) => [phase.id, { phase, index }]))
    const completed = new Set<string>()
    let reportCompleted = false

    while (pending.size > 0) {
      const ready = [...pending.values()]
        .filter(({ phase }) => phase.depends_on.every((dependency) => completed.has(dependency)))
        .sort((left, right) => left.index - right.index)
        .slice(0, Math.max(1, maxBatchSize))
      if (ready.length === 0) {
        for (const { phase } of pending.values()) this.trace.record(phase.id, 'failed', 'DAG 依赖环或依赖不存在')
        return 'ABORTED'
      }

      const runnable: { phase: Phase; softLimit: boolean }[] = []
      for (const { phase } of ready) {
        const guard = this.guards.check(usage(), phase)
        pending.delete(phase.id)
        if (!guard.allowed) {
          this.trace.record(phase.id, 'skipped', guard.reason ?? 'Guard 阻止执行')
          if (guard.reserveFinalization) {
            completed.add(phase.id)
            continue
          }
          return guard.terminal ?? 'PROVISIONAL'
        }
        this.trace.record(phase.id, 'running', 'DAG 依赖和 Guard 已通过，进入当前激活批次')
        runnable.push({ phase, softLimit: guard.softLimit })
      }

      const results = await Promise.all(runnable.map(async ({ phase, softLimit }) => {
        try {
          const result = await execute(phase, softLimit)
          this.trace.record(phase.id, 'completed', 'dag_batch_completed', result.inputRefs, result.outputRefs)
          return { phase, result }
        } catch (error) {
          this.trace.record(phase.id, 'failed', error instanceof Error ? error.message : String(error))
          return { phase, error }
        }
      }))
      if (results.some((result) => 'error' in result)) return 'ABORTED'
      for (const item of results) {
        completed.add(item.phase.id)
        if (item.phase.kind === 'report') reportCompleted = true
        if (item.result?.terminal) return item.result.terminal
      }
    }
    return reportCompleted ? 'DECIDED' : 'PROVISIONAL'
  }
}
