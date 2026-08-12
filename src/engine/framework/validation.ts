import type { AgentContract, PhaseGraph, PhasePolicy, ScenarioConfig } from '../types'
import { PROTOCOL_REGISTRY, STRATEGY_REGISTRY } from './registry'

export interface ValidationIssue {
  code: string
  message: string
  path: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

function issue(code: string, message: string, path: string): ValidationIssue {
  return { code, message, path }
}

export function validatePolicy(policy: PhasePolicy): ValidationResult {
  const issues: ValidationIssue[] = []
  for (const [slot, id] of Object.entries(policy)) {
    const definition = STRATEGY_REGISTRY[id as keyof typeof STRATEGY_REGISTRY]
    if (!definition || definition.family !== slot) issues.push(issue('INVALID_BASE_SLOT', `${id} 不是 ${slot} 槽位的合法 Base Strategy`, `policy.${slot}`))
  }
  if (policy.C === 'C5' && policy.D !== 'D3') issues.push(issue('C5_REQUIRES_D3', 'Delphi 必须使用置信度工件 D3', 'policy.D'))
  if ((policy.C === 'C2' || policy.C === 'C3' || policy.C === 'C4') && policy.D === 'D1') {
    issues.push(issue('STRUCTURED_THINKING_REQUIRES_SCHEMA', 'C2/C3/C4 必须使用 D2 或 D3', 'policy.D'))
  }
  if (policy.C === 'C3' && policy.E !== 'E4') issues.push(issue('SIX_HATS_REQUIRES_SEQUENCE', '六帽思考应由时序循环 E4 驱动', 'policy.E'))
  if (policy.C === 'C4' && policy.E !== 'E3' && policy.E !== 'E1') issues.push(issue('ADVERSARIAL_TRANSITION_MISMATCH', '对抗制应使用 E3，或在有严格预算时使用 E1', 'policy.E'))
  return { ok: issues.length === 0, issues }
}

export function validateGraph(graph: PhaseGraph): ValidationResult {
  const issues: ValidationIssue[] = []
  const ids = new Set(graph.phases.map((phase) => phase.id))
  if (!ids.has(graph.entry_phase_id)) issues.push(issue('MISSING_ENTRY', '入口阶段不存在', 'phase_graph.entry_phase_id'))
  if (ids.size !== graph.phases.length) issues.push(issue('DUPLICATE_PHASE_ID', 'Phase id 必须唯一', 'phase_graph.phases'))
  for (const phase of graph.phases) {
    for (const dependency of phase.depends_on) if (!ids.has(dependency)) issues.push(issue('UNKNOWN_DEPENDENCY', `依赖阶段 ${dependency} 不存在`, `phase_graph.${phase.id}.depends_on`))
    for (const transition of phase.transitions) if (!ids.has(transition.target)) issues.push(issue('UNKNOWN_TRANSITION_TARGET', `目标阶段 ${transition.target} 不存在`, `phase_graph.${phase.id}.transitions`))
    for (const transition of phase.transitions) {
      if (transition.target === phase.id && (!transition.max_retries || transition.max_retries < 1)) {
        issues.push(issue('UNBOUNDED_LOOP', '阶段自循环必须声明正整数 max_retries', `phase_graph.${phase.id}.transitions`))
      }
    }
    if (!phase.entry_conditions.length) issues.push(issue('MISSING_ENTRY_CONDITION', '阶段必须有进入条件', `phase_graph.${phase.id}.entry_conditions`))
    if (!phase.exit_conditions.length && phase.kind !== 'report') issues.push(issue('MISSING_EXIT_CONDITION', '非终局阶段必须有退出条件', `phase_graph.${phase.id}.exit_conditions`))
    const policyResult = validatePolicy(phase.policy)
    issues.push(...policyResult.issues.map((entry) => ({ ...entry, path: `phase_graph.${phase.id}.${entry.path}` })))
    if (!PROTOCOL_REGISTRY[phase.protocol_id]) issues.push(issue('UNKNOWN_PROTOCOL', `协议 ${phase.protocol_id} 未注册`, `phase_graph.${phase.id}.protocol_id`))
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const deps = new Map(graph.phases.map((phase) => [phase.id, phase.depends_on]))
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const dependency of deps.get(id) ?? []) if (visit(dependency)) return true
    visiting.delete(id)
    visited.add(id)
    return false
  }
  if (graph.phases.some((phase) => visit(phase.id))) issues.push(issue('ILLEGAL_GRAPH_CYCLE', 'PhaseGraph 依赖存在非法环', 'phase_graph'))
  const reachable = new Set<string>()
  const walk = (id: string) => {
    if (reachable.has(id)) return
    reachable.add(id)
    const phase = graph.phases.find((candidate) => candidate.id === id)
    for (const transition of phase?.transitions ?? []) walk(transition.target)
  }
  walk(graph.entry_phase_id)
  for (const phase of graph.phases) if (!reachable.has(phase.id)) issues.push(issue('UNREACHABLE_PHASE', `阶段 ${phase.id} 从入口不可达`, `phase_graph.${phase.id}`))
  return { ok: issues.length === 0, issues }
}

export function validateVote(input: {
  eligibleVoterIds: string[]
  candidateIds: string[]
  votes: { agent_id: string; vote: string }[]
  quorumRatio?: number
}): ValidationResult {
  const issues: ValidationIssue[] = []
  const eligible = new Set(input.eligibleVoterIds)
  const candidates = new Set(input.candidateIds)
  const voters = new Set<string>()
  for (const vote of input.votes) {
    if (!eligible.has(vote.agent_id)) issues.push(issue('INELIGIBLE_VOTER', `${vote.agent_id} 不具备投票资格`, 'vote.agent_id'))
    if (voters.has(vote.agent_id)) issues.push(issue('DUPLICATE_VOTE', `${vote.agent_id} 重复投票`, 'vote.agent_id'))
    if (!candidates.has(vote.vote)) issues.push(issue('INVALID_CANDIDATE', `${vote.vote} 不是合法表决对象`, 'vote.vote'))
    voters.add(vote.agent_id)
  }
  const quorum = Math.ceil(input.eligibleVoterIds.length * (input.quorumRatio ?? 0.5))
  if (voters.size < quorum) issues.push(issue('QUORUM_NOT_MET', `有效投票人数 ${voters.size} 未达到法定人数 ${quorum}`, 'vote.quorum'))
  return { ok: issues.length === 0, issues }
}

export function validateAgentCoverage(contracts: AgentContract[], requiredCapabilities: string[], humanAuthorityRequired: boolean): ValidationResult {
  const issues: ValidationIssue[] = []
  const capabilities = new Set(contracts.flatMap((contract) => contract.capabilities))
  for (const capability of requiredCapabilities) if (!capabilities.has(capability)) issues.push(issue('MISSING_CAPABILITY', `缺少必要能力 ${capability}`, 'agent_contracts'))
  if (humanAuthorityRequired && contracts.some((contract) => contract.authority.can_approve)) {
    issues.push(issue('AGENT_CANNOT_HOLD_HUMAN_AUTHORITY', '需要人类最终授权时，Agent 不得拥有最终批准权', 'agent_contracts.authority'))
  }
  return { ok: issues.length === 0, issues }
}

export function validateScenarioConfig(config: ScenarioConfig): ValidationResult {
  const results = [
    validateGraph(config.phase_graph),
    validateAgentCoverage(config.agent_contracts, config.scenario_spec.required_capabilities, config.guards.human_authority_required),
  ]
  const issues = results.flatMap((result) => result.issues)
  if (config.phase_graph.phases !== config.phases && config.phase_graph.phases.length !== config.phases.length) {
    issues.push(issue('PHASE_PROJECTION_MISMATCH', '兼容 phases 与 phase_graph 不一致', 'phases'))
  }
  return { ok: issues.length === 0, issues }
}
