import type {
  BaseStrategyId, ExperimentArmResult, ExperimentBudget, ExperimentObservation, ExperimentReport,
  ProtocolTemplateId, TransferScenario,
} from '../types'

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function normalizedDeliberationScore(observation: ExperimentObservation): number {
  const quality = clamp(observation.quality)
  const process = (clamp(observation.evidence_grounding) + clamp(observation.minority_retention)
    + clamp(observation.conflict_resolution) + clamp(observation.terminal_explainability)) / 4
  return Number((quality * 0.6 + process * 0.4).toFixed(4))
}

export function createExperimentArm(input: {
  armId: string
  kind: ExperimentArmResult['kind']
  budget: ExperimentBudget
  observation: ExperimentObservation
  protocolId?: ProtocolTemplateId
  ablatedStrategy?: BaseStrategyId
}): ExperimentArmResult {
  const budgetCompliant = input.observation.tokens <= input.budget.max_tokens
    && input.observation.model_calls <= input.budget.max_model_calls
    && input.observation.elapsed_ms <= input.budget.hard_timeout_ms
  return {
    arm_id: input.armId, kind: input.kind, protocol_id: input.protocolId,
    ablated_strategy: input.ablatedStrategy, budget: { ...input.budget }, observation: { ...input.observation },
    budget_compliant: budgetCompliant, normalized_score: normalizedDeliberationScore(input.observation),
  }
}

export function buildEqualBudgetExperiment(input: {
  experimentId: string
  scenarioId: string
  arms: ExperimentArmResult[]
}): ExperimentReport {
  const budgetKeys = new Set(input.arms.map((arm) => `${arm.budget.max_tokens}:${arm.budget.max_model_calls}:${arm.budget.hard_timeout_ms}`))
  const eligible = input.arms.filter((arm) => arm.budget_compliant)
  const baseline = eligible.find((arm) => arm.kind === 'orchestrated_multi_agent')
  const ablationEffects = Object.fromEntries(eligible.filter((arm) => arm.kind === 'strategy_ablation' && arm.ablated_strategy)
    .map((arm) => [arm.ablated_strategy!, Number(((baseline?.normalized_score ?? 0) - arm.normalized_score).toFixed(4))]))
  const winner = [...eligible].sort((left, right) => right.normalized_score - left.normalized_score)[0]
  return {
    experiment_id: input.experimentId, scenario_id: input.scenarioId,
    equal_budget_verified: budgetKeys.size === 1 && input.arms.length >= 3,
    arms: input.arms, winner_arm_id: winner?.arm_id, ablation_effects: ablationEffects,
  }
}

export async function runEqualBudgetExperiment(input: {
  experimentId: string
  scenarioId: string
  budget: ExperimentBudget
  arms: {
    armId: string
    kind: ExperimentArmResult['kind']
    protocolId?: ProtocolTemplateId
    ablatedStrategy?: BaseStrategyId
    execute: (budget: ExperimentBudget) => Promise<ExperimentObservation>
  }[]
}): Promise<ExperimentReport> {
  const arms: ExperimentArmResult[] = []
  // 顺序执行避免各实验臂争抢本机资源；传入每臂完全相同的预算副本。
  for (const arm of input.arms) {
    const observation = await arm.execute({ ...input.budget })
    arms.push(createExperimentArm({
      armId: arm.armId, kind: arm.kind, protocolId: arm.protocolId,
      ablatedStrategy: arm.ablatedStrategy, budget: input.budget, observation,
    }))
  }
  return buildEqualBudgetExperiment({ experimentId: input.experimentId, scenarioId: input.scenarioId, arms })
}

export const TRANSFER_SCENARIOS: TransferScenario[] = [
  {
    id: 'community_shared_space', domain: 'community_governance',
    prompt: '社区共享空间改造涉及老人、儿童、商户、物业和周边居民，如何形成可授权方案？',
    profile: { agent_count: 6, task_type: 'collaborative', game_type: null, domain: 'governance', time_pressure: 'relaxed', information_asymmetry: 'medium', agent_relations: 'mixed', decision_pattern: 'single_shot', resource_scarcity: 'medium', verifiability: 'partially', reasoning: '社区多方议事' },
    expected_protocols: ['fishbowl_v1', 'roberts_rules_v1'],
    required_capabilities: ['stakeholder_representation', 'governance', 'risk_review'],
    expected_terminal_states: ['HUMAN_ESCALATION', 'WAITING_FOR_EVIDENCE', 'IMPASSE'],
  },
  {
    id: 'enterprise_gpu_allocation', domain: 'enterprise_resource_allocation',
    prompt: '预算和 GPU 稀缺时，研发、销售、合规与平台团队如何分配下一季度资源？',
    profile: { agent_count: 5, task_type: 'collaborative', game_type: null, domain: 'business', time_pressure: 'sustained', information_asymmetry: 'medium', agent_relations: 'mixed', decision_pattern: 'sequential', resource_scarcity: 'high', verifiability: 'partially', reasoning: '企业稀缺资源分配' },
    expected_protocols: ['roberts_rules_v1', 'delphi_v1'],
    required_capabilities: ['resource_allocation', 'financial_review', 'risk_review'],
    expected_terminal_states: ['HUMAN_ESCALATION', 'DECIDED', 'IMPASSE'],
  },
  {
    id: 'incident_service_outage', domain: 'incident_response',
    prompt: '关键服务大面积故障且信息不完整，如何在恢复速度、安全和客户影响之间制定行动方案？',
    profile: { agent_count: 5, task_type: 'collaborative', game_type: null, domain: 'incident_response', time_pressure: 'urgent', information_asymmetry: 'high', agent_relations: 'cooperative', decision_pattern: 'sequential', resource_scarcity: 'high', verifiability: 'partially', reasoning: '事故应急响应' },
    expected_protocols: ['dialectical_review_v1', 'fishbowl_v1'],
    required_capabilities: ['incident_command', 'evidence_validation', 'risk_review'],
    expected_terminal_states: ['PROVISIONAL', 'WAITING_FOR_EVIDENCE', 'HUMAN_ESCALATION'],
  },
]

export function validateTransferScenario(scenario: TransferScenario): string[] {
  const issues: string[] = []
  if (!scenario.prompt.trim()) issues.push('missing_prompt')
  if (scenario.profile.task_type !== 'collaborative') issues.push('invalid_task_type')
  if (scenario.expected_protocols.length === 0) issues.push('missing_protocol_expectation')
  if (new Set(scenario.required_capabilities).size !== scenario.required_capabilities.length) issues.push('duplicate_capability')
  if (scenario.expected_terminal_states.length === 0) issues.push('missing_terminal_expectation')
  return issues
}
