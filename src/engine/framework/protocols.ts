import type {
  Phase, PhasePolicy, PolicyModifier, ProtocolTemplate, ProtocolTemplateId, ScenarioConfig, TaskProfile,
} from '../types'
import { MODIFIER_REGISTRY, policyToLegacyCombo } from './registry'

function phase(input: {
  id: string
  name: string
  purpose: string
  kind: Phase['kind']
  policy: PhasePolicy
  protocolId: ProtocolTemplateId
  dependsOn?: string[]
  transitions?: Phase['transitions']
  config?: Record<string, unknown>
  modifiers?: PolicyModifier[]
}): Phase {
  const modifiers = input.modifiers ?? []
  return {
    id: input.id, name: input.name, purpose: input.purpose, kind: input.kind,
    policy: input.policy, strategy: policyToLegacyCombo(input.policy, modifiers), modifiers,
    protocol_id: input.protocolId, config: input.config ?? {}, depends_on: input.dependsOn ?? [],
    required: true, skippable_on_deadline: false, entry_conditions: ['dependencies_satisfied'],
    exit_conditions: ['artifact_valid'], transitions: input.transitions ?? [],
  }
}

const DELPHI_POLICY: PhasePolicy = { A: 'A3', B: 'B2', C: 'C5', D: 'D3', E: 'E2' }
const DIALECTIC_POLICY: PhasePolicy = { A: 'A3', B: 'B1', C: 'C4', D: 'D2', E: 'E3' }
const ROBERT_POLICY: PhasePolicy = { A: 'A2', B: 'B1', C: 'C2', D: 'D2', E: 'E5' }

export function buildProtocolTemplate(id: ProtocolTemplateId): ProtocolTemplate {
  if (id === 'delphi_v1') {
    const modifiers = [MODIFIER_REGISTRY.anonymous_submission, MODIFIER_REGISTRY.independent_commit]
    return {
      id, name: 'Delphi v1', description: '匿名独立判断、分布聚合反馈与置信度修订',
      phases: [
        phase({ id: 'delphi_round_1', name: '匿名判断 Round 1', purpose: '独立提交判断、置信度和不确定性来源', kind: 'score', policy: DELPHI_POLICY, protocolId: id, modifiers, transitions: [{ condition: 'artifacts_valid', target: 'delphi_aggregate' }], config: { anonymous: true, round: 1 } }),
        phase({ id: 'delphi_aggregate', name: '匿名分布聚合', purpose: '仅反馈均值、离散度和理由摘要，不公开身份', kind: 'aggregate', policy: DELPHI_POLICY, protocolId: id, dependsOn: ['delphi_round_1'], modifiers, transitions: [{ condition: 'artifacts_valid', target: 'delphi_round_2' }], config: { expose_identity: false } }),
        phase({ id: 'delphi_round_2', name: '匿名修订 Round 2', purpose: '读取聚合反馈后独立修订判断', kind: 'score', policy: DELPHI_POLICY, protocolId: id, dependsOn: ['delphi_aggregate'], modifiers, transitions: [{ condition: 'converged', target: 'delphi_report' }, { condition: 'artifacts_valid', target: 'delphi_report' }], config: { anonymous: true, round: 2, convergence_threshold: 0.08 } }),
        phase({ id: 'delphi_report', name: 'Delphi 结果报告', purpose: '报告分布、置信度、离散度和未消除不确定性', kind: 'report', policy: { ...DELPHI_POLICY, E: 'E1' }, protocolId: id, dependsOn: ['delphi_round_2'] }),
      ],
    }
  }
  if (id === 'dialectical_review_v1') {
    return {
      id, name: '辩证审查 v1', description: '主张、反例、回应与综合修订的有界对抗循环',
      phases: [
        phase({ id: 'thesis', name: '主张与证据', purpose: '提交候选方案及证据链', kind: 'propose', policy: DIALECTIC_POLICY, protocolId: id, transitions: [{ condition: 'artifacts_valid', target: 'antithesis' }] }),
        phase({ id: 'antithesis', name: '反例与压力测试', purpose: '独立寻找反例、证据缺口和执行失败模式', kind: 'analyze', policy: DIALECTIC_POLICY, protocolId: id, dependsOn: ['thesis'], transitions: [{ condition: 'artifacts_valid', target: 'synthesis' }], config: { adversarial_role: 'critic' } }),
        phase({ id: 'synthesis', name: '回应与综合修订', purpose: '逐项回应反例并形成可追踪修订', kind: 'propose', policy: DIALECTIC_POLICY, protocolId: id, dependsOn: ['antithesis'], transitions: [{ condition: 'artifacts_valid', target: 'dialectical_gate' }] }),
        phase({ id: 'dialectical_gate', name: '独立审查门', purpose: '验证反例是否被处理且没有静默丢弃冲突', kind: 'evaluate', policy: { ...DIALECTIC_POLICY, E: 'E1' }, protocolId: id, dependsOn: ['synthesis'], transitions: [{ condition: 'artifacts_valid', target: 'dialectical_report' }] }),
        phase({ id: 'dialectical_report', name: '辩证审查报告', purpose: '报告主张、反例、回应、残余风险和终态', kind: 'report', policy: { ...DIALECTIC_POLICY, E: 'E1' }, protocolId: id, dependsOn: ['dialectical_gate'] }),
      ],
    }
  }
  if (id === 'roberts_rules_v1') {
    return {
      id, name: "Robert's Rules v1", description: '一次一个议题，按动议、修正、辩论和资格表决推进',
      phases: [
        phase({ id: 'motion', name: '提出动议', purpose: '形成唯一、明确且可表决的动议文本', kind: 'propose', policy: { ...ROBERT_POLICY, E: 'E1' }, protocolId: id, transitions: [{ condition: 'artifacts_valid', target: 'second_and_quorum' }] }),
        phase({ id: 'second_and_quorum', name: '附议与法定人数', purpose: '确定附议、投票资格与法定人数', kind: 'evaluate', policy: { ...ROBERT_POLICY, E: 'E1' }, protocolId: id, dependsOn: ['motion'], transitions: [{ condition: 'artifacts_valid', target: 'debate' }] }),
        phase({ id: 'debate', name: '受控辩论', purpose: '支持与反对交替陈述，一次只处理当前动议', kind: 'speak', policy: { ...ROBERT_POLICY, E: 'E1' }, protocolId: id, dependsOn: ['second_and_quorum'], transitions: [{ condition: 'artifacts_valid', target: 'amendment' }] }),
        phase({ id: 'amendment', name: '修正案处理', purpose: '对修正案逐一裁定并冻结最终表决文本', kind: 'aggregate', policy: { ...ROBERT_POLICY, E: 'E1' }, protocolId: id, dependsOn: ['debate'], transitions: [{ condition: 'artifacts_valid', target: 'motion_vote' }] }),
        phase({ id: 'motion_vote', name: '资格表决', purpose: '验证资格、法定人数和表决对象后独立投票', kind: 'vote', policy: ROBERT_POLICY, protocolId: id, dependsOn: ['amendment'], transitions: [{ condition: 'artifacts_valid', target: 'minutes' }] }),
        phase({ id: 'minutes', name: '会议纪要与终态', purpose: '记录动议、修正、票数、异议和授权边界', kind: 'report', policy: { ...ROBERT_POLICY, E: 'E1' }, protocolId: id, dependsOn: ['motion_vote'] }),
      ],
    }
  }
  throw new Error('Fishbowl 模板由主编译器构造；请使用 buildDeliberationPhases')
}

export function recommendProtocolTemplates(profile: TaskProfile): ProtocolTemplateId[] {
  if (profile.time_pressure === 'urgent' || profile.domain === 'disaster' || profile.domain === 'incident_response') {
    return ['dialectical_review_v1', 'fishbowl_v1']
  }
  if (profile.domain === 'business' && profile.resource_scarcity === 'high') {
    return ['roberts_rules_v1', 'delphi_v1']
  }
  if (profile.information_asymmetry === 'high' && profile.agent_relations === 'cooperative') {
    return ['delphi_v1', 'fishbowl_v1']
  }
  return ['fishbowl_v1', 'dialectical_review_v1', 'roberts_rules_v1']
}

export function applyProtocolTemplate(config: ScenarioConfig, id: Exclude<ProtocolTemplateId, 'fishbowl_v1'>): ScenarioConfig {
  const template = buildProtocolTemplate(id)
  return {
    ...config, phases: template.phases, phase_graph: { entry_phase_id: template.phases[0].id, phases: template.phases },
    protocol: { id, version: '1.0.0', entry_conditions: ['scenario_compiled'], default_policy: template.phases[0].policy, modifiers: template.phases[0].modifiers, events: ['new_evidence_reopen'], exit_conditions: ['terminal_report_created'] },
    compile_rationale: {
      ...config.compile_rationale, selected_protocol: id,
      reasons: [...config.compile_rationale.reasons, `应用协议模板 ${id}`],
      alternatives: [...new Set([...config.compile_rationale.alternatives, 'fishbowl_v1'])],
    },
  }
}
