import { strict as assert } from 'node:assert'
import type { AgentContract, Phase, PhaseGraph } from '../src/engine/types'
import { StructuredBlackboard } from '../src/engine/framework/memory'
import { policyToLegacyCombo, PROTOCOL_REGISTRY, STRATEGY_REGISTRY } from '../src/engine/framework/registry'
import { DAGBatchExecutor, GraphExecutor, RunTrace, RuntimeGuards } from '../src/engine/framework/runtime'
import { createImpasseReport, createTerminalReport, EventRuleEngine } from '../src/engine/framework/events'
import { applyProtocolTemplate, buildProtocolTemplate, recommendProtocolTemplates } from '../src/engine/framework/protocols'
import { aggregateDelphiRound, delphiConverged, evaluateDialecticalReview, executeProtocolRuntime, executeRobertsVote } from '../src/engine/framework/protocol-runtime'
import { processNewEvidence } from '../src/engine/framework/evidence'
import { buildEqualBudgetExperiment, createExperimentArm, runEqualBudgetExperiment, TRANSFER_SCENARIOS, validateTransferScenario } from '../src/engine/framework/experiments'
import { createTaskCheckpoint } from '../src/engine/framework/checkpoints'
import { validateAgentCoverage, validateGraph, validatePolicy, validateVote } from '../src/engine/framework/validation'
import { compileScenario } from '../src/engine/compiler'
import { OrchestrationEngine } from '../src/engine/engine'
import { createScriptedCaller } from '../src/engine/scripted'
import { elevatorScript } from '../src/data/scripts/elevator'
import { GenericGameEngine, buildRoleList, normalizeGameSpec } from '../src/engine/game-engine'
import { AVALON_SPEC, CYBER_DEFENSE_SPEC, FRAUD_AUDIT_SPEC, GAME_REGISTRY, UNDERCOVER_SPEC, WEREWOLF_SPEC } from '../src/engine/game-specs'
import { parseGameRequest } from '../src/engine/game-request'
import { createReplayCaller, offlineProfile } from '../src/engine/replay'
import { buildReportPresentation } from '../src/lib/presentation'
import { buildPresentationDeck } from '../src/lib/presentation-production'
import { compilePresentationScenario } from '../src/engine/presentation/compiler'
import { dispatch, isPresentationProductionRequest } from '../src/engine/dispatcher'
import { PresentationProductionEngine } from '../src/engine/presentation/engine'
import { InvocationAudit } from '../src/engine/framework/audit'

function testPhase(input: Partial<Phase> & Pick<Phase, 'id' | 'kind'>): Phase {
  const policy = input.policy ?? { A: 'A1', B: 'B2', C: 'C1', D: 'D1', E: 'E1' }
  const value: Phase = {
    id: input.id, name: input.name ?? input.id, purpose: input.purpose ?? input.id, policy,
    strategy: policyToLegacyCombo(policy), modifiers: [], protocol_id: 'structured_synthesis_v1',
    kind: input.kind, config: {}, depends_on: [], required: true, skippable_on_deadline: false,
    entry_conditions: ['dependencies_satisfied'], exit_conditions: ['artifact_valid'], transitions: [],
  }
  return { ...value, ...input }
}

export async function run() {
  assert.equal(Object.keys(STRATEGY_REGISTRY).length, 20)
  assert.deepEqual(Object.keys(STRATEGY_REGISTRY).filter((id) => id.startsWith('A')), ['A1', 'A2', 'A3', 'A4'])
  assert.ok(!('A5' in STRATEGY_REGISTRY))
  assert.ok(!('B5' in STRATEGY_REGISTRY))
  assert.ok(!('E7' in STRATEGY_REGISTRY))
  assert.ok(PROTOCOL_REGISTRY.fishbowl_v1)
  assert.ok(PROTOCOL_REGISTRY.delphi_v1)
  assert.ok(PROTOCOL_REGISTRY.roberts_rules_v1)

  assert.equal(validatePolicy({ A: 'A1', B: 'B2', C: 'C5', D: 'D2', E: 'E2' }).ok, false)
  assert.equal(validatePolicy({ A: 'A1', B: 'B2', C: 'C3', D: 'D2', E: 'E2' }).ok, false)
  assert.equal(validatePolicy({ A: 'A4', B: 'B2', C: 'C4', D: 'D2', E: 'E3' }).ok, true)

  const a = testPhase({ id: 'a', kind: 'speak', transitions: [{ condition: 'artifacts_valid', target: 'b' }] })
  const b = testPhase({ id: 'b', kind: 'report', depends_on: ['a'], exit_conditions: ['terminal_report_created'] })
  const graph: PhaseGraph = { entry_phase_id: 'a', phases: [a, b] }
  assert.equal(validateGraph(graph).ok, true)
  const badGraph: PhaseGraph = { entry_phase_id: 'a', phases: [{ ...a, depends_on: ['b'] }, { ...b, depends_on: ['a'] }] }
  assert.ok(validateGraph(badGraph).issues.some((entry) => entry.code === 'ILLEGAL_GRAPH_CYCLE'))
  assert.ok(validateVote({ eligibleVoterIds: ['a', 'b'], candidateIds: ['x', 'y'], votes: [{ agent_id: 'a', vote: 'x' }, { agent_id: 'b', vote: 'y' }] }).ok)
  assert.ok(!validateVote({ eligibleVoterIds: ['a', 'b'], candidateIds: ['x'], votes: [{ agent_id: 'a', vote: 'bad' }] }).ok)

  const contract: AgentContract = {
    id: 'reviewer', name: 'Reviewer', archetype: '专业观察者', relationship: 'review', interests: [], stance: 'neutral',
    can_say: [], cannot_say: [], capabilities: ['risk_review'], tools: [],
    authority: { can_recommend: true, can_approve: false, can_block_on_violation: true },
    sop: ['read_assigned_artifacts'], visibility: ['public'],
  }
  assert.ok(validateAgentCoverage([contract], ['risk_review'], true).ok)
  assert.ok(!validateAgentCoverage([contract], ['evidence_validation'], true).ok)

  const board = new StructuredBlackboard()
  board.writeArtifact({ artifact: { kind: 'InitialAssessmentCard', agent_id: 'a', initial_stance: '支持', main_concerns: [], proposal_sketch: [], non_negotiables: [], possible_concessions: [], content: 'x' }, issueId: 'i', phaseId: 'p', createdBy: 'a', visibility: ['a'] })
  assert.equal(board.query({ visibleTo: 'a' }).length, 1)
  assert.equal(board.query({ visibleTo: 'b' }).length, 0)

  const guard = new RuntimeGuards({ max_tokens: 100, max_model_calls: 10, hard_timeout_ms: 1000, soft_limit_ratio: 0.8, reserved_finalization_ratio: 0.1, human_authority_required: true, minority_report_required: true, mock_fallback_forbidden: false, mandatory_gates: [] })
  assert.equal(guard.check({ tokens: 81, calls: 1, elapsedMs: 10 }).softLimit, true)
  assert.equal(guard.check({ tokens: 101, calls: 1, elapsedMs: 10 }).terminal, 'PROVISIONAL')

  const optional = testPhase({ id: 'optional', kind: 'fishbowl', skippable_on_deadline: true, transitions: [{ condition: 'artifacts_valid', target: 'mandatory' }] })
  const mandatory = testPhase({ id: 'mandatory', kind: 'report', depends_on: ['optional'], exit_conditions: ['terminal_report_created'] })
  const reserveTrace = new RunTrace('reserve')
  const reserveExecutor = new GraphExecutor({ entry_phase_id: 'optional', phases: [optional, mandatory] }, reserveTrace, guard)
  const reserveVisited: string[] = []
  assert.equal(await reserveExecutor.run(async (phase) => {
    reserveVisited.push(phase.id)
    return { condition: phase.transitions[0]?.condition ?? 'terminal_report_created' }
  }, () => ({ tokens: 91, calls: 1, elapsedMs: 10 })), 'DECIDED')
  assert.deepEqual(reserveVisited, ['mandatory'])
  assert.equal(reserveTrace.snapshot().some((entry) => entry.phase_id === 'optional' && entry.state === 'skipped'), true)

  const visited: string[] = []
  const executor = new GraphExecutor(graph, new RunTrace('test'), guard)
  const terminal = await executor.run(async (current) => {
    visited.push(current.id)
    return { condition: current.transitions[0]?.condition ?? 'terminal_report_created' }
  }, () => ({ tokens: 1, calls: 1, elapsedMs: 1 }))
  assert.deepEqual(visited, ['a', 'b'])
  assert.equal(terminal, 'DECIDED')

  for (const protocolId of ['delphi_v1', 'dialectical_review_v1', 'roberts_rules_v1'] as const) {
    const template = buildProtocolTemplate(protocolId)
    const templateGraph = { entry_phase_id: template.phases[0].id, phases: template.phases }
    assert.equal(validateGraph(templateGraph).ok, true, `${protocolId} graph must be valid`)
    const protocolVisited: string[] = []
    const protocolTerminal = await new GraphExecutor(templateGraph, new RunTrace(`protocol_${protocolId}`), guard).run(async (current) => {
      protocolVisited.push(current.id)
      return { condition: current.transitions[0]?.condition ?? 'terminal_report_created' }
    }, () => ({ tokens: 1, calls: 1, elapsedMs: 1 }))
    assert.equal(protocolTerminal, 'DECIDED')
    assert.equal(protocolVisited.length, template.phases.length)
  }
  assert.deepEqual(recommendProtocolTemplates({
    agent_count: 5, task_type: 'collaborative', game_type: null, domain: 'business', time_pressure: 'sustained',
    information_asymmetry: 'medium', agent_relations: 'mixed', decision_pattern: 'sequential', resource_scarcity: 'high',
    verifiability: 'partially', reasoning: 'test',
  }).slice(0, 2), ['roberts_rules_v1', 'delphi_v1'])
  const delphiR1 = aggregateDelphiRound([
    { round: 1, agent_id: 'a', value: 0.4, confidence: 0.7, rationale: '成本', uncertainty_sources: ['需求'] },
    { round: 1, agent_id: 'b', value: 0.8, confidence: 0.8, rationale: '收益', uncertainty_sources: ['价格'] },
  ])
  const delphiR2 = aggregateDelphiRound([
    { round: 2, agent_id: 'a', value: 0.58, confidence: 0.8, rationale: '成本修订', uncertainty_sources: ['需求'] },
    { round: 2, agent_id: 'b', value: 0.62, confidence: 0.85, rationale: '收益修订', uncertainty_sources: ['价格'] },
  ])
  assert.equal(delphiR1.identity_exposed, false)
  assert.equal(delphiConverged([delphiR1, delphiR2], 1, 0.08, 0.15), true)
  assert.equal(evaluateDialecticalReview(
    [{ id: 'c1', claim: '可执行', counterexample: '峰值失败', evidence_gap: '压测', severity: 0.9 }],
    [{ challenge_id: 'c1', response: '增加降级', revision: '峰值降级开关', evidence_refs: [] }],
  ).passed, true)
  const parliamentary = executeRobertsVote({
    motion: { id: 'm1', text: '采用方案 A', mover_id: 'a', seconder_id: 'b', eligible_voter_ids: ['a', 'b', 'c'], quorum_ratio: 2 / 3 },
    votes: [{ agent_id: 'a', vote: 'yes', reason: '支持' }, { agent_id: 'b', vote: 'yes', reason: '支持' }, { agent_id: 'c', vote: 'no', reason: '反对' }],
    amendments: [{ id: 'am1', text: '三个月复评', adopted: true }],
  })
  assert.equal(parliamentary.valid, true)
  assert.equal(parliamentary.adopted, true)
  assert.ok(parliamentary.final_motion_text.includes('三个月复评'))
  const delphiExecution = executeProtocolRuntime({ protocol_id: 'delphi_v1', rounds: [
    [{ round: 1, agent_id: 'a', value: 0.4, confidence: 0.7, rationale: '成本', uncertainty_sources: [] }, { round: 1, agent_id: 'b', value: 0.8, confidence: 0.8, rationale: '收益', uncertainty_sources: [] }],
    [{ round: 2, agent_id: 'a', value: 0.58, confidence: 0.8, rationale: '修订', uncertainty_sources: [] }, { round: 2, agent_id: 'b', value: 0.62, confidence: 0.85, rationale: '修订', uncertainty_sources: [] }],
  ] })
  assert.equal(delphiExecution.terminal, 'DECIDED')

  const dagA = testPhase({ id: 'dag_a', kind: 'analyze' })
  const dagB = testPhase({ id: 'dag_b', kind: 'fishbowl', depends_on: ['dag_a'] })
  const dagC = testPhase({ id: 'dag_c', kind: 'score', depends_on: ['dag_a'] })
  const dagReport = testPhase({ id: 'dag_report', kind: 'report', depends_on: ['dag_b', 'dag_c'] })
  const dagExecutor = new DAGBatchExecutor({ entry_phase_id: 'dag_a', phases: [dagA, dagB, dagC, dagReport] }, new RunTrace('dag'), guard)
  const dagStarts: string[] = []
  assert.equal(await dagExecutor.run(async (phase) => {
    dagStarts.push(phase.id)
    return {}
  }, () => ({ tokens: 1, calls: 1, elapsedMs: 1 }), 2), 'DECIDED')
  assert.equal(dagStarts[0], 'dag_a')
  assert.deepEqual(new Set(dagStarts.slice(1, 3)), new Set(['dag_b', 'dag_c']))
  assert.equal(dagStarts[3], 'dag_report')

  const eventConflict = board.registerConflict({ issue_id: 'i', conflict_type: 'fact', severity: 0.9, decision_relevant: true, claim_refs: ['claim_a'], resolution_status: 'open' })
  const impasseRule = {
    id: 'impasse_test', event: 'low_change_high_disagreement', conditions: { no_new_evidence: true, retry_limit_reached: true },
    actions: ['classify_impasse', 'create_impasse_report'], retry_limit: 0, on_unresolved: 'IMPASSE',
  }
  const eventEngine = new EventRuleEngine([impasseRule])
  const baseEventState = { conflicts: [eventConflict], lowChange: true, highResidualDisagreement: true, noNewEvidence: true, retryLimitReached: true, authorityRequired: false }
  assert.equal(eventEngine.evaluate('low_change_high_disagreement', baseEventState)[0].terminal_state, 'IMPASSE')
  assert.equal(eventEngine.evaluate('low_change_high_disagreement', { ...baseEventState, noNewEvidence: false })[0].matched, false)
  assert.equal(eventEngine.evaluate('low_change_high_disagreement', { ...baseEventState, highResidualDisagreement: false })[0].matched, false)
  const impasse = createImpasseReport({ issueId: 'i', conflicts: [eventConflict], agreedItems: ['共同目标'], unresolvedClaims: ['事实断言'], minorityPositions: ['保留意见'], missingEvidence: ['独立数据'], attemptedResolutions: ['交叉质询'] })
  assert.equal(impasse.impasse_type, 'fact')
  assert.ok(impasse.recommended_next_actions.some((action) => action.includes('证据')))
  const terminalArtifact = createTerminalReport({ terminalState: 'IMPASSE', trace: [{ phase_id: 'a', state: 'completed' }, { phase_id: 'b', state: 'skipped' }], reasonCodes: ['impasse:fact'], unresolvedItems: ['事实断言'], missingEvidence: ['独立数据'], minorityPositions: ['保留意见'], recommendedNextActions: impasse.recommended_next_actions, impasseReport: impasse })
  assert.deepEqual(terminalArtifact.completed_phase_ids, ['a'])
  assert.deepEqual(terminalArtifact.skipped_phase_ids, ['b'])

  const evidenceBoard = new StructuredBlackboard()
  evidenceBoard.writeArtifact({ artifact: { kind: 'InitialAssessmentCard', agent_id: 'a', initial_stance: '支持', main_concerns: [], proposal_sketch: [], non_negotiables: [], possible_concessions: [], content: 'old' }, issueId: compiledIssueId(), phaseId: 'first_round', createdBy: 'a' })

  const budget = { max_tokens: 10_000, max_model_calls: 20, hard_timeout_ms: 60_000 }
  const observation = (quality: number, tokens = 8_000) => ({ quality, evidence_grounding: quality, minority_retention: quality, conflict_resolution: quality, terminal_explainability: quality, tokens, model_calls: 15, elapsed_ms: 30_000 })
  const experiment = buildEqualBudgetExperiment({ experimentId: 'exp_1', scenarioId: 'transfer', arms: [
    createExperimentArm({ armId: 'single', kind: 'single_agent', budget, observation: observation(0.55) }),
    createExperimentArm({ armId: 'fixed', kind: 'fixed_multi_agent', budget, observation: observation(0.62) }),
    createExperimentArm({ armId: 'orchestrated', kind: 'orchestrated_multi_agent', protocolId: 'fishbowl_v1', budget, observation: observation(0.8) }),
    createExperimentArm({ armId: 'ablate_c4', kind: 'strategy_ablation', ablatedStrategy: 'C4', budget, observation: observation(0.68) }),
  ] })
  assert.equal(experiment.equal_budget_verified, true)
  assert.equal(experiment.winner_arm_id, 'orchestrated')
  assert.ok(experiment.ablation_effects.C4 > 0)
  const executedExperiment = await runEqualBudgetExperiment({ experimentId: 'exp_execute', scenarioId: 'transfer', budget, arms: [
    { armId: 'single', kind: 'single_agent', execute: async (receivedBudget) => ({ ...observation(0.55), tokens: receivedBudget.max_tokens - 2_000 }) },
    { armId: 'fixed', kind: 'fixed_multi_agent', execute: async () => observation(0.62) },
    { armId: 'orchestrated', kind: 'orchestrated_multi_agent', protocolId: 'fishbowl_v1', execute: async () => observation(0.8) },
  ] })
  assert.equal(executedExperiment.equal_budget_verified, true)
  assert.equal(executedExperiment.arms.length, 3)
  assert.equal(TRANSFER_SCENARIOS.length, 3)
  assert.equal(new Set(TRANSFER_SCENARIOS.map((scenario) => scenario.domain)).size, 3)
  assert.equal(TRANSFER_SCENARIOS.every((scenario) => validateTransferScenario(scenario).length === 0), true)
  for (const transfer of TRANSFER_SCENARIOS) {
    const recommendations = recommendProtocolTemplates(transfer.profile)
    assert.ok(transfer.expected_protocols.some((protocol) => recommendations.includes(protocol)), `${transfer.id} should match a transfer protocol`)
  }

  // 通用阵营对抗：狼人杀只是一个 GameSpec，应用预设共享同一运行时与明确胜负语义。
  assert.ok(GAME_REGISTRY.cyber_defense === CYBER_DEFENSE_SPEC)
  assert.ok(GAME_REGISTRY.fraud_audit === FRAUD_AUDIT_SPEC)
  assert.equal(buildRoleList(CYBER_DEFENSE_SPEC, 6).length, 6)
  const normalizedGame = normalizeGameSpec({ ...WEREWOLF_SPEC, tiebreak: undefined })
  assert.equal(normalizedGame.tiebreak?.type, 'alive_count')
  const gameEvents: import('../src/engine/types').EngineEvent[] = []
  const gameCaller: import('../src/engine/llm').LLMCaller = async (system) => {
    const id = system.match(/（(p\d+)）/)?.[1] ?? ''
    if (system.includes('最终的袭击目标')) return { text: JSON.stringify({ target: 'p6' }), tokens: 1 }
    if (system.includes('查验身份')) return { text: JSON.stringify({ target: 'p1', reason: '测试' }), tokens: 1 }
    if (system.includes('女巫')) return { text: JSON.stringify({ use_antidote: false, poison_target: null }), tokens: 1 }
    if (system.includes('投出你认为最像狼人')) return { text: JSON.stringify({ target: id === 'p1' ? 'p2' : 'p1', reason: '测试票' }), tokens: 1 }
    return { text: JSON.stringify({ content: '测试发言', suggest_target: 'p6' }), tokens: 1 }
  }
  await new GenericGameEngine(gameCaller, (event) => gameEvents.push(event), { fast: true }).run(WEREWOLF_SPEC, '6人狼人杀', { playerCount: 6 })
  const gameResult = gameEvents.find((event) => event.t === 'game_result')
  assert.ok(gameResult?.t === 'game_result')
  assert.equal(gameResult?.t === 'game_result' ? gameResult.result.winner_team : undefined, 'good')
  assert.ok(gameEvents.findIndex((event) => event.t === 'game_result') < gameEvents.findIndex((event) => event.t === 'run_done'))

  // 自由输入必须确定性识别游戏与人数，不能被旧预设或六人狼人杀覆盖。
  assert.deepEqual(parseGameRequest('十二位玩家玩狼人杀'), { gameType: 'werewolf', playerCount: 12 })
  assert.deepEqual(parseGameRequest('8个人玩阿瓦隆'), { gameType: 'avalon', playerCount: 8 })
  assert.equal(offlineProfile('12个人玩狼人杀').agent_count, 12)
  assert.equal(offlineProfile('8个人玩阿瓦隆').game_type, 'avalon')
  assert.equal(buildRoleList(WEREWOLF_SPEC, 12).filter((role) => role === 'werewolf').length, 4)
  assert.deepEqual(buildRoleList(AVALON_SPEC, 8), ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred'])

  const twelvePlayerEvents: import('../src/engine/types').EngineEvent[] = []
  await new GenericGameEngine(createReplayCaller('12个人玩狼人杀'), (event) => twelvePlayerEvents.push(event), { fast: true })
    .run(WEREWOLF_SPEC, '12个人玩狼人杀', { playerCount: 12 })
  const twelveRoster = twelvePlayerEvents.find((event) => event.t === 'game_state' && event.roster?.length === 12)
  assert.ok(twelveRoster)
  for (let index = 0; index < twelvePlayerEvents.length; index++) {
    if (twelvePlayerEvents[index].t !== 'phase_start') continue
    const phaseEnd = twelvePlayerEvents.findIndex((event, candidateIndex) => candidateIndex > index && event.t === 'phase_start')
    const sliceEnd = phaseEnd < 0 ? twelvePlayerEvents.length : phaseEnd
    assert.ok(twelvePlayerEvents.slice(index + 1, sliceEnd).some((event) => event.t === 'game_state' && event.roster?.length === 12), '每个狼人杀阶段都必须广播完整 roster')
  }

  const avalonEvents: import('../src/engine/types').EngineEvent[] = []
  await new GenericGameEngine(createReplayCaller('8个人玩阿瓦隆'), (event) => avalonEvents.push(event), { fast: true })
    .run(AVALON_SPEC, '8个人玩阿瓦隆', { playerCount: 8 })
  const avalonResult = avalonEvents.find((event) => event.t === 'game_result')
  assert.ok(avalonResult?.t === 'game_result')
  assert.equal(avalonResult?.t === 'game_result' ? avalonResult.result.game_type : undefined, 'avalon')
  assert.ok(avalonResult?.t === 'game_result' && ['good', 'evil'].includes(avalonResult.result.winner_team))
  assert.ok(avalonEvents.some((event) => event.t === 'game_event' && event.event.kind === 'GameAction' && event.event.action === 'resolve_quest'))
  assert.ok(avalonEvents.some((event) => event.t === 'game_state' && event.roster?.length === 8))

  const undercoverEvents: import('../src/engine/types').EngineEvent[] = []
  await new GenericGameEngine(createReplayCaller('6个人玩谁是卧底'), (event) => undercoverEvents.push(event), { fast: true })
    .run(UNDERCOVER_SPEC, '6个人玩谁是卧底', { playerCount: 6 })
  const undercoverSpeeches = undercoverEvents
    .filter((event) => event.t === 'game_event' && event.event.kind === 'GameSpeech')
    .map((event) => event.t === 'game_event' && event.event.kind === 'GameSpeech' ? event.event.content : '')
  const undercoverResult = undercoverEvents.find((event) => event.t === 'game_result')
  assert.ok(undercoverSpeeches.length >= 6)
  assert.ok(new Set(undercoverSpeeches).size > 3)
  assert.ok(undercoverSpeeches.every((speech) => !speech.includes('目前信息有限')))
  assert.equal(undercoverResult?.t === 'game_result' ? undercoverResult.result.winner_team : undefined, 'civilian')
  assert.ok(undercoverEvents.some((event) => event.t === 'vote' && event.result.includes('玩家1') && event.result.includes('出局')))

  const caller = createScriptedCaller(elevatorScript)
  const compiled = await compileScenario(caller, '电梯议事端到端自测', elevatorScript.dispatch, () => {})
  assert.equal(compiled.phase_graph.phases.length, 9)
  assert.equal(compiled.protocol.id, 'fishbowl_v1')
  assert.ok(compiled.event_rules.some((rule) => rule.id === 'new_evidence_reopen_v1'))
  const delphiConfig = applyProtocolTemplate(compiled, 'delphi_v1')
  assert.equal(delphiConfig.protocol.id, 'delphi_v1')
  assert.equal(validateGraph(delphiConfig.phase_graph).ok, true)
  const evidence = { id: 'ev_new_1', issue_id: compiled.issue_graph.root_issue_id, claim: '新增结构安全检测结果', source: '独立检测机构报告', observed_at: new Date().toISOString(), scope: '根议题', confidence: 0.95, verified: true }
  const reopenBoard = new StructuredBlackboard()
  reopenBoard.writeArtifact({ artifact: { kind: 'InitialAssessmentCard', agent_id: 'a', initial_stance: '支持', main_concerns: [], proposal_sketch: [], non_negotiables: [], possible_concessions: [], content: '旧工件' }, issueId: compiled.issue_graph.root_issue_id, phaseId: 'first_round', createdBy: 'a' })
  const reopened = processNewEvidence({ config: compiled, blackboard: reopenBoard, evidence, affectedIssueIds: [compiled.issue_graph.root_issue_id], decisionRelevant: true })
  assert.equal(reopened.accepted, true)
  assert.equal(reopened.recompile.inserted_phase_ids.length, 1)
  assert.equal(validateGraph(reopened.config.phase_graph).ok, true)
  assert.equal(reopenBoard.snapshot().entries.some((entry) => entry.status === 'superseded'), true)
  const unverified = processNewEvidence({ config: compiled, blackboard: reopenBoard, evidence: { ...evidence, id: 'ev_unverified', verified: false }, affectedIssueIds: [compiled.issue_graph.root_issue_id], decisionRelevant: true })
  assert.equal(unverified.accepted, false)
  const checkpointPhase = compiled.phase_graph.phases.find((phase) => phase.id === 'propose')!
  const missingArtifactCheckpoint = createTaskCheckpoint({ config: compiled, phase: checkpointPhase, trigger: 'PHASE_EXIT', sequence: 1, entries: [], conflicts: [], minorityPositions: [] })
  assert.equal(missingArtifactCheckpoint.checkpoint_decision, 'RETRY_PHASE')
  assert.ok(missingArtifactCheckpoint.drift_flags.includes('REQUIRED_ARTIFACT_MISSING'))
  const semanticDriftCheckpoint = createTaskCheckpoint({
    config: compiled, phase: checkpointPhase, trigger: 'PHASE_EXIT', sequence: 2,
    entries: [{ id: 'a', version: 1, created_at: new Date().toISOString(), created_by: 'test', source_refs: [], visibility: ['public'], status: 'valid', register: 'artifacts', issue_id: compiled.issue_graph.root_issue_id, phase_id: 'propose', payload: { kind: 'FinalProposal' } }],
    conflicts: [], minorityPositions: [], semanticReview: { aligned: false, current_focus: '讨论无关的团建活动', drift_flags: ['OBJECTIVE_DRIFT'], rationale: '当前焦点不再回答原始目标' },
  })
  assert.equal(semanticDriftCheckpoint.checkpoint_decision, 'HUMAN_ESCALATION')
  const checkpointBoard = new StructuredBlackboard()
  checkpointBoard.writeRecord({ register: 'unknowns', issueId: compiled.issue_graph.root_issue_id, phaseId: 'conflict', payload: { kind: 'EvidenceGap', claim: '采光实测数据' }, createdBy: 'test' })
  checkpointBoard.writeRecord({ register: 'facts', issueId: compiled.issue_graph.root_issue_id, phaseId: 'conflict', payload: '采光实测数据', createdBy: 'test' })
  const unknownAsFactCheckpoint = createTaskCheckpoint({ config: compiled, phase: compiled.phase_graph.phases.find((phase) => phase.id === 'conflict')!, trigger: 'PHASE_EXIT', sequence: 3, entries: checkpointBoard.snapshot().entries, conflicts: [], minorityPositions: [] })
  assert.ok(unknownAsFactCheckpoint.drift_flags.includes('UNKNOWN_PROMOTED_TO_FACT'))
  assert.equal(unknownAsFactCheckpoint.checkpoint_decision, 'RETRY_PHASE')
  const factConflict = checkpointBoard.registerConflict({ issue_id: compiled.issue_graph.root_issue_id, conflict_type: 'fact', severity: 0.9, decision_relevant: true, claim_refs: ['claim'], resolution_status: 'open' })
  const waitingCheckpoint = createTaskCheckpoint({ config: compiled, phase: compiled.phase_graph.phases.find((phase) => phase.id === 'report')!, trigger: 'PRE_TERMINAL', sequence: 4, entries: checkpointBoard.snapshot().entries, conflicts: [factConflict], minorityPositions: [] })
  assert.equal(waitingCheckpoint.checkpoint_decision, 'WAITING_FOR_EVIDENCE')
  assert.equal(compiled.agent_contracts.every((agent) => agent.sop.length > 0), true)
  const events: import('../src/engine/types').EngineEvent[] = []
  const routedAgentId = compiled.agents[0].id
  const routedCaller: typeof caller = async (system, user, options) => {
    const result = await caller(system, user, options)
    return { ...result, invocation: { ...result.invocation!, model: 'agent-specialist-model' } }
  }
  const orchestration = new OrchestrationEngine(caller, (event) => events.push(event), {
    fast: true,
    callerForAgent: (agentId) => agentId === routedAgentId ? routedCaller : undefined,
  })
  await orchestration.runCollaborative(compiled)
  assert.equal(events.filter((event) => event.t === 'phase_start').length, 9)
  assert.ok(events.some((event) => event.t === 'report'))
  const terminalReportIndex = events.findIndex((event) => event.t === 'terminal_report')
  const auditEventIndex = events.findIndex((event) => event.t === 'audit_snapshot')
  const doneEventIndex = events.findIndex((event) => event.t === 'run_done')
  assert.ok(auditEventIndex >= 0)
  assert.ok(terminalReportIndex >= 0 && terminalReportIndex < auditEventIndex)
  assert.ok(auditEventIndex < doneEventIndex)
  const auditEvent = events[auditEventIndex]
  assert.ok(auditEvent.t === 'audit_snapshot' && auditEvent.model_invocations.every((invocation) => invocation.phase_id !== 'unassigned'))
  const done = events.find((event) => event.t === 'run_done')
  assert.equal(done?.t === 'run_done' ? done.terminal_state : undefined, 'HUMAN_ESCALATION')
  const audit = orchestration.getAuditSnapshot()
  assert.ok(audit.run_trace.length >= 18)
  assert.ok(audit.blackboard.entries.length > 0)
  assert.ok(audit.blackboard.conflicts.length > 0)
  assert.ok(audit.blackboard.revisions.length > 0)
  assert.ok(audit.blackboard.checkpoints.length >= 6)
  assert.ok(events.some((event) => event.t === 'checkpoint_created'))
  assert.ok(audit.model_invocations.length > 0)
  assert.equal(audit.model_invocations.every((invocation) => invocation.mode === 'replay'), true)
  assert.ok(audit.model_invocations.some((invocation) => invocation.agent_id === routedAgentId && invocation.model === 'agent-specialist-model'))
  const continuation = await orchestration.submitEvidence(compiled, { id: 'ev_runtime', issue_id: compiled.issue_graph.root_issue_id, claim: '运行后补充核验材料', source: '审计机构', observed_at: new Date().toISOString(), scope: '根议题', confidence: 0.9, verified: true }, [compiled.issue_graph.root_issue_id])
  assert.ok(continuation.phase_graph.phases.some((phase) => phase.id.startsWith('evidence_review_')))
  assert.ok(events.some((event) => event.t === 'event_rule_fired' && event.evaluation.rule_id === 'new_evidence_reopen_v1'))

  const samplePresentation = buildReportPresentation({
    meta: {
      title: '议事报告',
      issue: '老旧小区加装电梯问题 **测试**',
      category: 'collaborative',
      categoryLabel: '多智能体协作议事',
      terminalState: 'DECIDED',
      generatedAt: '2026-08-15',
      tokens: 1000,
      calls: 20,
      agentCount: 3,
    },
    sections: [
      { id: 'summary', title: '执行摘要', items: [{ kind: 'metric', label: '议题', text: '老旧小区加装电梯问题' }, { kind: 'status', label: '结论', text: '有条件推进', tone: 'success' }] },
      { id: 'long', title: '长文本分页', items: [{ kind: 'text', label: '完整讨论', text: Array.from({ length: 30 }, (_, index) => `第 ${index + 1} 条：**加装电梯**需要明确责任主体、资金来源、施工方案和复评机制。`).join('\n') }] },
      { id: 'final', title: '最终方案', items: [{ kind: 'list', items: ['明确责任主体', '设置退出机制', '建立复评机制'] }] },
    ],
  })
  const presentationBuffer = await samplePresentation.write({ outputType: 'arraybuffer' })
  assert.ok(presentationBuffer.byteLength > 5000)

  assert.equal(isPresentationProductionRequest('请基于附件制作一份 10 页汇报 PPT'), true)
  assert.equal(isPresentationProductionRequest('请分析这份已有 PPT 的问题'), false)
  const forcedPresentation = await dispatch(createReplayCaller('请给出地下车库管理方案'), '请给出地下车库管理方案', undefined, 'auto', 'presentation')
  assert.equal(forcedPresentation.profile.deliverable, 'presentation')
  assert.equal(forcedPresentation.profile.task_type, 'collaborative')
  assert.equal(forcedPresentation.profile.agent_count, 5)
  const presentationProfile = offlineProfile('请基于附件制作一份 8 页汇报 PPT')
  assert.equal(presentationProfile.deliverable, 'presentation')
  const presentationConfig = await compilePresentationScenario(
    '请基于附件制作一份 8 页汇报 PPT', presentationProfile, () => {}, '附件示例：项目计划分为调研、试点和复盘三步。',
  )
  assert.equal(presentationConfig.agents.length, 5)
  assert.equal(presentationConfig.phases.length, 7)
  assert.equal(presentationConfig.presentation_brief?.slide_count, 8)
  const pipelineEvents: import('../src/engine/types').EngineEvent[] = []
  const presentationMockCaller: import('../src/engine/llm').LLMCaller = async () => ({
    text: '{}', tokens: 64, invocation: { mode: 'mock', model: 'presentation-mock', latency_ms: 0, result_status: 'success' },
  })
  const presentationEngine = new PresentationProductionEngine(presentationMockCaller, (event) => pipelineEvents.push(event), { invocationAudit: new InvocationAudit() })
  await presentationEngine.run(presentationConfig)
  assert.equal(pipelineEvents.filter((event) => event.t === 'phase_start').length, 7)
  assert.equal(pipelineEvents.filter((event) => event.t === 'checkpoint_created').length, 7)
  assert.ok(pipelineEvents.some((event) => event.t === 'artifact' && event.artifact.kind === 'PresentationDeck'))
  assert.ok(pipelineEvents.some((event) => event.t === 'run_done'))

  const longProfile = offlineProfile('请制作一份 12 页汇报 PPT')
  const longConfig = await compilePresentationScenario('请制作一份 12 页汇报 PPT', longProfile, () => {})
  const longEvents: import('../src/engine/types').EngineEvent[] = []
  const observedBudgets: number[] = []
  const truncatedRevisionCaller: import('../src/engine/llm').LLMCaller = async (system, _user, options) => {
    if (/生成逐页 slides/.test(system)) observedBudgets.push(options?.max_tokens ?? 0)
    if (/只返回需要修改的页面/.test(system)) {
      observedBudgets.push(options?.max_tokens ?? 0)
      return { text: '{"modified_slides":[', tokens: 4096, finish_reason: 'length', invocation: { mode: 'mock', model: 'truncated-mock', latency_ms: 0, result_status: 'success' } }
    }
    if (/独立演示审校 Agent/.test(system)) {
      return { text: JSON.stringify({ passed: false, score: 70, strengths: ['结构完整'], issues: ['个别页面需精简'], revision_instructions: ['精简 S3'] }), tokens: 128, invocation: { mode: 'mock', model: 'review-mock', latency_ms: 0, result_status: 'success' } }
    }
    return { text: '{}', tokens: 64, invocation: { mode: 'mock', model: 'presentation-mock', latency_ms: 0, result_status: 'success' } }
  }
  await new PresentationProductionEngine(truncatedRevisionCaller, (event) => longEvents.push(event), { invocationAudit: new InvocationAudit() }).run(longConfig)
  const longDeckEvent = longEvents.find((event) => event.t === 'artifact' && event.artifact.kind === 'PresentationDeck')
  assert.ok(longDeckEvent?.t === 'artifact' && longDeckEvent.artifact.kind === 'PresentationDeck')
  assert.equal(longDeckEvent?.t === 'artifact' && longDeckEvent.artifact.kind === 'PresentationDeck' ? longDeckEvent.artifact.slides.length : 0, 12)
  assert.ok(longEvents.some((event) => event.t === 'adaptation' && /保留已生成的初版/.test(event.action)))
  assert.ok(longEvents.some((event) => event.t === 'run_done'))
  assert.ok(observedBudgets.includes(8192))
  assert.ok(observedBudgets.includes(4096))

  const maxConfig = await compilePresentationScenario('请制作一份 20 页汇报 PPT', offlineProfile('请制作一份 20 页汇报 PPT'), () => {})
  const maxEvents: import('../src/engine/types').EngineEvent[] = []
  await new PresentationProductionEngine(presentationMockCaller, (event) => maxEvents.push(event), { invocationAudit: new InvocationAudit() }).run(maxConfig)
  const maxDeckEvent = maxEvents.find((event) => event.t === 'artifact' && event.artifact.kind === 'PresentationDeck')
  assert.equal(maxDeckEvent?.t === 'artifact' && maxDeckEvent.artifact.kind === 'PresentationDeck' ? maxDeckEvent.artifact.slides.length : 0, 20)
  if (maxDeckEvent?.t === 'artifact' && maxDeckEvent.artifact.kind === 'PresentationDeck') {
    const maxDeck = buildPresentationDeck(maxDeckEvent.artifact)
    const maxDeckBuffer = await maxDeck.write({ outputType: 'arraybuffer' })
    assert.ok(maxDeckBuffer.byteLength > 20000)
    await maxDeck.writeFile({ fileName: 'node_modules/.tmp/presentation-20-preview.pptx', compression: true })
  }
  const editableDeck = buildPresentationDeck({
    kind: 'PresentationDeck', title: '项目汇报', subtitle: '多智能体协作生成', brief: presentationConfig.presentation_brief!,
    slides: [
      { slide_id: 'S1', type: 'cover', title: '项目汇报', subtitle: '多智能体协作生成', key_message: '从资料到可执行方案', bullets: [], source_refs: [], speaker_notes: '开场。' },
      { slide_id: 'S2', type: 'agenda', title: '议程', key_message: '三部分', bullets: ['背景', '路径', '下一步'], source_refs: [], speaker_notes: '介绍议程。' },
      { slide_id: 'S3', type: 'key_message', title: '背景与目标', key_message: '先明确目标', bullets: ['用户目标', '受众需求'], source_refs: ['E1'], speaker_notes: '说明目标。' },
      { slide_id: 'S4', type: 'comparison', title: '方案比较', key_message: '比较不同路径', bullets: [], columns: [{ title: '方案 A', points: ['速度快'] }, { title: '方案 B', points: ['风险低'] }], source_refs: ['E1'], speaker_notes: '比较方案。' },
      { slide_id: 'S5', type: 'process', title: '实施路径', key_message: '分阶段推进', bullets: [], steps: [{ title: '调研', detail: '确认事实' }, { title: '试点', detail: '验证假设' }, { title: '复盘', detail: '评估效果' }], source_refs: ['E1'], speaker_notes: '说明步骤。' },
      { slide_id: 'S6', type: 'evidence', title: '证据边界', key_message: '区分事实和缺口', bullets: ['附件事实', '待核验数据'], source_refs: ['E1'], speaker_notes: '说明边界。' },
      { slide_id: 'S7', type: 'key_message', title: '风险控制', key_message: '保留退出机制', bullets: ['设置检查点', '记录异常'], source_refs: [], speaker_notes: '说明风险。' },
      { slide_id: 'S8', type: 'conclusion', title: '结论与下一步', key_message: '完成核验后进入试点', bullets: ['补齐证据', '启动试点'], source_refs: [], speaker_notes: '收束。' },
    ],
    sources: [{ id: 'E1', label: '用户附件', verified: true }], qa: { passed: true, checks: ['结构完整'], warnings: [] },
  })
  const editableBuffer = await editableDeck.write({ outputType: 'arraybuffer' })
  assert.ok(editableBuffer.byteLength > 10000)
  await editableDeck.writeFile({ fileName: 'node_modules/.tmp/presentation-preview.pptx', compression: true })

  console.log('engine framework self-tests passed')
}

function compiledIssueId() {
  return 'issue_test'
}
