import type { LLMCaller } from '../llm'
import type { ModelInvocation } from '../types'

function invocationId(): string {
  return `invocation_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export class InvocationAudit {
  private invocations: ModelInvocation[]
  private phaseId = 'unassigned'
  private agentId: string | undefined

  constructor(initialInvocations: ModelInvocation[] = []) {
    this.invocations = [...initialInvocations]
  }

  setContext(phaseId: string, agentId?: string): void {
    this.phaseId = phaseId
    this.agentId = agentId
  }

  wrap(caller: LLMCaller): LLMCaller {
    return async (system, user, opts) => {
      const started = performance.now()
      try {
        const result = await caller(system, user, opts)
        const meta = result.invocation ?? { mode: 'mock' as const, model: 'unknown', latency_ms: performance.now() - started, result_status: 'success' as const }
        this.invocations.push({
          id: invocationId(), version: 1, created_at: new Date().toISOString(), created_by: this.agentId ?? 'system_component',
          source_refs: [], visibility: ['audit'], status: 'valid', phase_id: this.phaseId,
          agent_id: this.agentId, mode: meta.mode, model: meta.model,
          system_prompt: system, user_prompt: user, parameters: opts ?? {}, tokens: result.tokens,
          latency_ms: meta.latency_ms, result_status: meta.result_status,
        })
        return result
      } catch (error) {
        this.invocations.push({
          id: invocationId(), version: 1, created_at: new Date().toISOString(), created_by: this.agentId ?? 'system_component',
          source_refs: [], visibility: ['audit'], status: 'rejected', phase_id: this.phaseId,
          agent_id: this.agentId, mode: 'live', model: 'unknown', system_prompt: system, user_prompt: user,
          parameters: opts ?? {}, tokens: 0, latency_ms: performance.now() - started, result_status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    }
  }

  snapshot(): ModelInvocation[] {
    return [...this.invocations]
  }
}
