/**
 * 内置博弈规格与注册表。
 * 狼人杀只是其中一个数据实例，不是引擎硬编码。
 */
import type { GameSpec } from './game-types'

const POLICY = {
  setup: { A: 'A1', B: 'B3', C: 'C1', D: 'D1', E: 'E1' } as const,
  night: { A: 'A2', B: 'B3', C: 'C1', D: 'D1', E: 'E1' } as const,
  day: { A: 'A1', B: 'B3', C: 'C1', D: 'D1', E: 'E1' } as const,
  vote: { A: 'A1', B: 'B3', C: 'C1', D: 'D2', E: 'E5' } as const,
  end: { A: 'A3', B: 'B2', C: 'C1', D: 'D2', E: 'E1' } as const,
}

export const WEREWOLF_SPEC: GameSpec = {
  game_type: 'werewolf',
  name: '狼人杀',
  description: '信息不对称的阵营对抗游戏。夜晚狼人私聊并袭击，预言家查验，女巫用药；白天公开发言并投票淘汰。',
  min_players: 6,
  max_players: 18,
  teams: [{ id: 'wolf', name: '狼人阵营' }, { id: 'good', name: '好人阵营' }],
  roles: [
    { id: 'werewolf', name: '狼人', team: 'wolf', description: '夜晚与同伴私聊并选择袭击目标；白天隐藏身份。', actions: ['wolf_talk', 'wolf_kill'] },
    { id: 'seer', name: '预言家', team: 'good', description: '每晚查验一名玩家身份。', actions: ['seer_check'] },
    { id: 'witch', name: '女巫', team: 'good', description: '拥有一瓶解药和一瓶毒药。', actions: ['witch_decide'] },
    { id: 'villager', name: '平民', team: 'good', description: '无特殊能力，通过发言和投票找出狼人。', actions: [] },
  ],
  actions: [
    {
      id: 'wolf_talk', name: '狼人私聊', primitive: 'private_chat', role: 'werewolf', audience: 'team',
      prompt: '你是狼人杀玩家「{name}」（{id}），身份：狼人。同伴是 {teammates}。现在是夜晚，请在私密频道与同伴商议今晚袭击谁。',
      output_schema: '{"content":"<40字内私聊内容>","suggest_target":"<建议袭击的玩家id>"}',
    },
    {
      id: 'wolf_kill', name: '狼人袭击', primitive: 'select_target', role: 'werewolf', audience: 'team',
      prompt: '你是狼人。请给出今晚最终的袭击目标。',
      output_schema: '{"target":"<玩家id>"}',
    },
    {
      id: 'seer_check', name: '预言家查验', primitive: 'inspect_role', role: 'seer', audience: 'self',
      prompt: '你是预言家，请选择一名玩家查验身份。',
      output_schema: '{"target":"<玩家id>","reason":"<30字内>"}',
    },
    {
      id: 'witch_decide', name: '女巫用药', primitive: 'decide_life', role: 'witch', audience: 'self',
      prompt: '你是女巫。今晚 {victim} 被狼人袭击。你有一瓶解药和一瓶毒药，请决定是否用药。',
      output_schema: '{"use_antidote":<true|false>,"poison_target":"<玩家id或null>"}',
    },
    {
      id: 'day_speech', name: '白天发言', primitive: 'public_speech', role: 'all', audience: 'public',
      prompt: '你是狼人杀玩家「{name}」（{id}）。请发表白天发言。',
      output_schema: '{"content":"<80字内发言>","suspect":"<最怀疑的玩家id或null>"}',
    },
    {
      id: 'day_vote', name: '投票', primitive: 'vote', role: 'all', audience: 'public',
      prompt: '请投出你认为最像狼人的一名玩家（不能投自己）。',
      output_schema: '{"target":"<玩家id>","reason":"<25字内>"}',
    },
    {
      id: 'resolve_night', name: '结算夜晚', primitive: 'resolve_night', role: '__system', audience: 'god',
      prompt: '结算夜晚结果。',
      output_schema: '{}',
    },
    {
      id: 'resolve_vote', name: '计票淘汰', primitive: 'resolve_vote', role: '__system', audience: 'public',
      prompt: '统计投票并淘汰得票最多者。',
      output_schema: '{}',
    },
  ],
  composition: {
    fixed: [{ role: 'seer', count: 1 }, { role: 'witch', count: 1 }],
    ratio: [{ role: 'werewolf', denominator: 3, min: 2 }],
    fill_role: 'villager',
  },
  phases: [
    { id: 'setup', name: '秘密角色分派', purpose: '身份按 B3 角色路由，仅本人可见', kind: 'setup', participants: 'all', actions: [], policy: POLICY.setup, order: 'sequential' },
    { id: 'night', name: '夜晚行动', purpose: '狼人私聊与袭击、预言家查验、女巫用药', kind: 'action', participants: ['werewolf', 'seer', 'witch'], actions: ['wolf_talk', 'wolf_kill', 'seer_check', 'witch_decide'], policy: POLICY.night, order: 'sequential', round: 1 },
    { id: 'day', name: '白天发言', purpose: 'A1 全体激活 + B3 角色路由', kind: 'speak', participants: 'all_alive', actions: ['resolve_night', 'day_speech'], policy: POLICY.day, order: 'sequential', round: 1 },
    { id: 'vote', name: '投票表决', purpose: 'E5 投票决议，得票最多者出局', kind: 'vote', participants: 'all_alive', actions: ['day_vote', 'resolve_vote'], policy: POLICY.vote, order: 'simultaneous', round: 1 },
    { id: 'end', name: '复盘', purpose: '胜负判定与策略复用清单', kind: 'end', participants: 'all', actions: [], policy: POLICY.end, order: 'sequential' },
  ],
  win_conditions: [
    { id: 'good_win', description: '所有狼人被淘汰，好人阵营获胜', type: 'role_eliminated', role: 'werewolf', winner_team: 'good' },
    { id: 'wolf_win', description: '狼人数量不少于好人数量，狼人阵营获胜', type: 'team_ge', team_a: 'wolf', team_b: 'good', winner_team: 'wolf' },
  ],
  fallback_rule: '达到最大轮次仍未触发常规条件时，按存活人数判定；同数时狼人优先。',
  tiebreak: { type: 'alive_count', team_order: ['wolf', 'good'], description: '最大轮次结束，存活人数更多的阵营获胜；同数时狼人阵营获胜。' },
  game_loop: {
    cycle_phase_ids: ['night', 'day', 'vote'],
    max_rounds: 4,
    break_on_winner: true,
  },
}

export const UNDERCOVER_SPEC: GameSpec = {
  game_type: 'undercover',
  name: '谁是卧底',
  description: '所有玩家各自拿到一个词语。多数人拿到相同词，一名卧底拿到相近但不同的词。玩家轮流描述，通过发言差异投票淘汰卧底。',
  min_players: 5,
  max_players: 10,
  teams: [{ id: 'civilian', name: '平民阵营' }, { id: 'spy', name: '卧底阵营' }],
  roles: [
    { id: 'civilian', name: '平民', team: 'civilian', description: '你拿到的词是「苹果」。不要直接说出这个词，用模糊而准确的描述让其他平民认下你。', actions: [] },
    { id: 'spy', name: '卧底', team: 'spy', description: '你拿到的词是「梨」，与多数人的「苹果」相近但不同。你要伪装成知道「苹果」的平民，避免被识破。', actions: [] },
  ],
  actions: [
    {
      id: 'describe_word', name: '描述词语', primitive: 'public_speech', role: 'all', audience: 'public',
      prompt: '你是「{name}」（{id}）。请用一句话间接描述你拿到的词，不要直接说出词语本身。卧底应模仿平民的措辞。',
      output_schema: '{"content":"<30字内的间接描述>"}',
    },
    {
      id: 'vote_suspect', name: '投票指认', primitive: 'vote', role: 'all', audience: 'public',
      prompt: '根据大家的描述，投出你认为最像卧底的一名玩家（不能投自己）。',
      output_schema: '{"target":"<玩家id>","reason":"<20字内>"}',
    },
    {
      id: 'resolve_vote', name: '计票淘汰', primitive: 'resolve_vote', role: '__system', audience: 'public',
      prompt: '统计投票并淘汰得票最多者。',
      output_schema: '{}',
    },
  ],
  composition: {
    fixed: [{ role: 'spy', count: 1 }],
    ratio: [],
    fill_role: 'civilian',
  },
  phases: [
    { id: 'setup', name: '词语分派', purpose: 'B3 角色路由：卧底与平民拿到不同词语，仅本人可见', kind: 'setup', participants: 'all', actions: [], policy: POLICY.setup, order: 'sequential' },
    { id: 'describe', name: '轮流描述', purpose: 'A1 全体激活 + C1 自由描述', kind: 'speak', participants: 'all_alive', actions: ['describe_word'], policy: POLICY.day, order: 'sequential', round: 1 },
    { id: 'vote', name: '投票淘汰', purpose: 'E5 投票决议淘汰最可疑玩家', kind: 'vote', participants: 'all_alive', actions: ['vote_suspect', 'resolve_vote'], policy: POLICY.vote, order: 'simultaneous', round: 1 },
    { id: 'end', name: '复盘', purpose: '公布双方词语与胜负', kind: 'end', participants: 'all', actions: [], policy: POLICY.end, order: 'sequential' },
  ],
  win_conditions: [
    { id: 'civilian_win', description: '卧底被投票淘汰，平民阵营获胜', type: 'role_eliminated', role: 'spy', winner_team: 'civilian' },
    { id: 'spy_win', description: '场上平民数量不高于卧底数量，卧底获胜', type: 'team_ge', team_a: 'spy', team_b: 'civilian', winner_team: 'spy' },
  ],
  fallback_rule: '达到最大轮次卧底仍未被淘汰，卧底获胜。',
  tiebreak: { type: 'team_priority', team_order: ['spy'], description: '卧底成功隐藏至最大轮次，卧底阵营获胜。' },
  game_loop: {
    cycle_phase_ids: ['describe', 'vote'],
    max_rounds: 5,
    break_on_winner: true,
  },
}

export const MAFIA_SPEC: GameSpec = {
  game_type: 'mafia',
  name: '杀人游戏',
  description: '警察、杀手与平民的阵营对抗。夜晚杀手袭击，警察查验；白天发言投票淘汰嫌疑人。',
  min_players: 6,
  max_players: 16,
  teams: [{ id: 'killer', name: '杀手阵营' }, { id: 'good', name: '好人阵营' }],
  roles: [
    { id: 'killer', name: '杀手', team: 'killer', description: '夜晚与同伴私聊并选择袭击目标；白天伪装成平民。', actions: ['killer_talk', 'killer_kill'] },
    { id: 'police', name: '警察', team: 'good', description: '每晚查验一名玩家是杀手还是好人。', actions: ['police_check'] },
    { id: 'civilian', name: '平民', team: 'good', description: '无特殊能力，通过发言和投票找出杀手。', actions: [] },
  ],
  actions: [
    {
      id: 'killer_talk', name: '杀手私聊', primitive: 'private_chat', role: 'killer', audience: 'team',
      prompt: '你是杀人游戏玩家「{name}」（{id}），身份：杀手。同伴是 {teammates}。请在私密频道商议今晚袭击谁。',
      output_schema: '{"content":"<40字内私聊内容>","suggest_target":"<建议袭击的玩家id>"}',
    },
    {
      id: 'killer_kill', name: '杀手袭击', primitive: 'select_target', role: 'killer', audience: 'team',
      prompt: '你是杀手。请给出今晚最终的袭击目标。',
      output_schema: '{"target":"<玩家id>"}',
    },
    {
      id: 'police_check', name: '警察查验', primitive: 'inspect_role', role: 'police', audience: 'self',
      prompt: '你是警察，请选择一名玩家查验身份。',
      output_schema: '{"target":"<玩家id>","reason":"<30字内>"}',
    },
    {
      id: 'day_speech', name: '白天发言', primitive: 'public_speech', role: 'all', audience: 'public',
      prompt: '你是杀人游戏玩家「{name}」（{id}）。请发表白天发言。',
      output_schema: '{"content":"<80字内发言>","suspect":"<最怀疑的玩家id或null>"}',
    },
    {
      id: 'day_vote', name: '投票', primitive: 'vote', role: 'all', audience: 'public',
      prompt: '请投出你认为最像杀手的玩家（不能投自己）。',
      output_schema: '{"target":"<玩家id>","reason":"<25字内>"}',
    },
    {
      id: 'resolve_night', name: '结算夜晚', primitive: 'resolve_night', role: '__system', audience: 'god',
      prompt: '结算夜晚结果。',
      output_schema: '{}',
    },
    {
      id: 'resolve_vote', name: '计票淘汰', primitive: 'resolve_vote', role: '__system', audience: 'public',
      prompt: '统计投票并淘汰得票最多者。',
      output_schema: '{}',
    },
  ],
  composition: {
    fixed: [{ role: 'police', count: 1 }],
    ratio: [{ role: 'killer', denominator: 3, min: 1 }],
    fill_role: 'civilian',
  },
  phases: [
    { id: 'setup', name: '秘密角色分派', purpose: '身份按 B3 角色路由，仅本人可见', kind: 'setup', participants: 'all', actions: [], policy: POLICY.setup, order: 'sequential' },
    { id: 'night', name: '夜晚行动', purpose: '杀手私聊与袭击、警察查验', kind: 'action', participants: ['killer', 'police'], actions: ['killer_talk', 'killer_kill', 'police_check'], policy: POLICY.night, order: 'sequential', round: 1 },
    { id: 'day', name: '白天发言', purpose: 'A1 全体激活 + B3 角色路由', kind: 'speak', participants: 'all_alive', actions: ['resolve_night', 'day_speech'], policy: POLICY.day, order: 'sequential', round: 1 },
    { id: 'vote', name: '投票表决', purpose: 'E5 投票决议，得票最多者出局', kind: 'vote', participants: 'all_alive', actions: ['day_vote', 'resolve_vote'], policy: POLICY.vote, order: 'simultaneous', round: 1 },
    { id: 'end', name: '复盘', purpose: '胜负判定与阵营复盘', kind: 'end', participants: 'all', actions: [], policy: POLICY.end, order: 'sequential' },
  ],
  win_conditions: [
    { id: 'good_win', description: '所有杀手被淘汰，好人阵营获胜', type: 'role_eliminated', role: 'killer', winner_team: 'good' },
    { id: 'killer_win', description: '杀手数量不少于好人数量，杀手阵营获胜', type: 'team_ge', team_a: 'killer', team_b: 'good', winner_team: 'killer' },
  ],
  fallback_rule: '达到最大轮次仍未分胜负时，存活人数多的一方获胜。',
  tiebreak: { type: 'alive_count', team_order: ['killer', 'good'], description: '最大轮次结束，存活人数更多的阵营获胜；同数时杀手阵营获胜。' },
  game_loop: {
    cycle_phase_ids: ['night', 'day', 'vote'],
    max_rounds: 4,
    break_on_winner: true,
  },
}


/** 网络安全攻防演练：把狼人杀的隐藏阵营、侦查、处置与投票机制迁移到安全培训。 */
export const CYBER_DEFENSE_SPEC: GameSpec = {
  game_type: 'cyber_defense',
  name: '网络安全红蓝对抗',
  description: '红队攻击者隐藏在组织成员中，蓝队分析员通过日志查验、公开研判与隔离投票找出攻击者。',
  min_players: 6,
  max_players: 16,
  teams: [{ id: 'red', name: '红队' }, { id: 'blue', name: '蓝队' }],
  roles: [
    { id: 'attacker', name: '红队攻击者', team: 'red', description: '私下协同并选择一个蓝队目标实施模拟入侵，同时隐藏身份。', actions: ['red_chat', 'red_attack'] },
    { id: 'analyst', name: '安全分析员', team: 'blue', description: '每轮可审计一名成员，获得其真实阵营。', actions: ['audit_identity'] },
    { id: 'responder', name: '应急响应员', team: 'blue', description: '得知本轮受攻击目标，可选择阻断攻击。', actions: ['block_attack'] },
    { id: 'employee', name: '业务成员', team: 'blue', description: '通过公开研判和隔离投票协助定位攻击者。', actions: [] },
  ],
  actions: [
    { id: 'red_chat', name: '红队密议', primitive: 'private_chat', role: 'attacker', audience: 'team', prompt: '你是隐藏的红队攻击者「{name}」（{id}），同伴是 {teammates}。私下讨论本轮攻击目标。', output_schema: '{"content":"<40字内>","suggest_target":"<玩家id>"}' },
    { id: 'red_attack', name: '模拟入侵', primitive: 'select_target', role: 'attacker', audience: 'team', prompt: '选择本轮最终模拟入侵目标。', output_schema: '{"target":"<蓝队玩家id>"}' },
    { id: 'audit_identity', name: '日志溯源', primitive: 'inspect_role', role: 'analyst', audience: 'self', prompt: '选择一名存活成员进行日志溯源，查明其角色。', output_schema: '{"target":"<玩家id>","reason":"<理由>"}' },
    { id: 'block_attack', name: '应急阻断', primitive: 'decide_life', role: 'responder', audience: 'self', prompt: '本轮 {victim} 遭到模拟入侵。决定是否阻断；无需反制时 poison_target 为 null。', output_schema: '{"use_antidote":<true|false>,"poison_target":null}' },
    { id: 'security_briefing', name: '安全研判', primitive: 'public_speech', role: 'all', audience: 'public', prompt: '你是成员「{name}」（{id}）。根据公开事件进行安全研判，指出最可疑成员。', output_schema: '{"content":"<80字内>","suspect":"<玩家id或null>"}' },
    { id: 'isolation_vote', name: '隔离投票', primitive: 'vote', role: 'all', audience: 'public', prompt: '投票隔离你认为最可能是攻击者的一名成员，不能投自己。', output_schema: '{"target":"<玩家id>","reason":"<25字内>"}' },
    { id: 'resolve_attack', name: '结算攻击', primitive: 'resolve_night', role: '__system', audience: 'god', prompt: '结算本轮攻击。', output_schema: '{}' },
    { id: 'resolve_isolation', name: '执行隔离', primitive: 'resolve_vote', role: '__system', audience: 'public', prompt: '隔离得票最多者。', output_schema: '{}' },
  ],
  composition: { fixed: [{ role: 'analyst', count: 1 }, { role: 'responder', count: 1 }], ratio: [{ role: 'attacker', denominator: 3, min: 1 }], fill_role: 'employee' },
  phases: [
    { id: 'setup', name: '身份与权限分派', purpose: '红蓝身份仅本人及授权阵营可见', kind: 'setup', participants: 'all', actions: [], policy: POLICY.setup, order: 'sequential' },
    { id: 'attack', name: '攻击与检测', purpose: '红队密议攻击，蓝队溯源与阻断', kind: 'action', participants: ['attacker', 'analyst', 'responder'], actions: ['red_chat', 'red_attack', 'audit_identity', 'block_attack'], policy: POLICY.night, order: 'sequential' },
    { id: 'briefing', name: '公开安全研判', purpose: '所有存活成员交换线索', kind: 'speak', participants: 'all_alive', actions: ['resolve_attack', 'security_briefing'], policy: POLICY.day, order: 'sequential' },
    { id: 'isolation', name: '隔离决议', purpose: '投票隔离最高风险成员', kind: 'vote', participants: 'all_alive', actions: ['isolation_vote', 'resolve_isolation'], policy: POLICY.vote, order: 'simultaneous' },
    { id: 'end', name: '攻防复盘', purpose: '公布胜负、身份与关键误判', kind: 'end', participants: 'all', actions: [], policy: POLICY.end, order: 'sequential' },
  ],
  win_conditions: [
    { id: 'blue_win', description: '全部红队攻击者被隔离，蓝队获胜', type: 'role_eliminated', role: 'attacker', winner_team: 'blue' },
    { id: 'red_win', description: '红队存活人数不少于蓝队，红队突破防线获胜', type: 'team_ge', team_a: 'red', team_b: 'blue', winner_team: 'red' },
  ],
  fallback_rule: '最大轮次后按存活人数判定攻防胜负。',
  tiebreak: { type: 'alive_count', team_order: ['red', 'blue'], description: '最大轮次结束，存活人数更多的阵营获胜；同数时红队视为突破成功。' },
  game_loop: { cycle_phase_ids: ['attack', 'briefing', 'isolation'], max_rounds: 4, break_on_winner: true },
}

/** 企业反舞弊演练：隐藏内鬼、审计调查、公开质询与停职决议。 */
export const FRAUD_AUDIT_SPEC: GameSpec = {
  game_type: 'fraud_audit',
  name: '企业反舞弊调查',
  description: '少数内鬼隐藏在项目组中，审计方通过私有调查、公开质询和停职投票识别内鬼。',
  min_players: 5,
  max_players: 14,
  teams: [{ id: 'fraud', name: '舞弊阵营' }, { id: 'integrity', name: '廉正阵营' }],
  roles: [
    { id: 'insider', name: '舞弊内鬼', team: 'fraud', description: '隐藏身份并协同误导调查。', actions: ['insider_chat'] },
    { id: 'auditor', name: '审计专员', team: 'integrity', description: '每轮秘密调查一名成员的真实角色。', actions: ['audit_member'] },
    { id: 'staff', name: '项目成员', team: 'integrity', description: '依据发言与证据参与质询和停职表决。', actions: [] },
  ],
  actions: [
    { id: 'insider_chat', name: '内鬼串供', primitive: 'private_chat', role: 'insider', audience: 'team', prompt: '你是隐藏内鬼「{name}」（{id}），同伴是 {teammates}。私下商议如何误导本轮调查。', output_schema: '{"content":"<40字内>"}' },
    { id: 'audit_member', name: '秘密审计', primitive: 'inspect_role', role: 'auditor', audience: 'self', prompt: '选择一名成员执行秘密审计并查明真实角色。', output_schema: '{"target":"<玩家id>","reason":"<理由>"}' },
    { id: 'hearing', name: '公开质询', primitive: 'public_speech', role: 'all', audience: 'public', prompt: '你是项目成员「{name}」（{id}）。围绕异常线索陈述判断，并指出最可疑成员。', output_schema: '{"content":"<80字内>","suspect":"<玩家id或null>"}' },
    { id: 'suspend_vote', name: '停职表决', primitive: 'vote', role: 'all', audience: 'public', prompt: '投票停职你认为最可能参与舞弊的一名成员，不能投自己。', output_schema: '{"target":"<玩家id>","reason":"<25字内>"}' },
    { id: 'resolve_suspension', name: '执行停职', primitive: 'resolve_vote', role: '__system', audience: 'public', prompt: '停职得票最多者。', output_schema: '{}' },
  ],
  composition: { fixed: [{ role: 'auditor', count: 1 }], ratio: [{ role: 'insider', denominator: 4, min: 1 }], fill_role: 'staff' },
  phases: [
    { id: 'setup', name: '调查权限分派', purpose: '身份、阵营和调查权限私有化', kind: 'setup', participants: 'all', actions: [], policy: POLICY.setup, order: 'sequential' },
    { id: 'investigate', name: '秘密调查', purpose: '内鬼串供，审计员秘密核验', kind: 'action', participants: ['insider', 'auditor'], actions: ['insider_chat', 'audit_member'], policy: POLICY.night, order: 'sequential' },
    { id: 'hearing', name: '公开听证', purpose: '所有存活成员公开质询', kind: 'speak', participants: 'all_alive', actions: ['hearing'], policy: POLICY.day, order: 'sequential' },
    { id: 'suspension', name: '停职表决', purpose: '通过集体表决移除最高风险成员', kind: 'vote', participants: 'all_alive', actions: ['suspend_vote', 'resolve_suspension'], policy: POLICY.vote, order: 'simultaneous' },
    { id: 'end', name: '调查结案', purpose: '公布阵营胜负和调查过程', kind: 'end', participants: 'all', actions: [], policy: POLICY.end, order: 'sequential' },
  ],
  win_conditions: [
    { id: 'integrity_win', description: '全部舞弊内鬼被停职，廉正阵营获胜', type: 'role_eliminated', role: 'insider', winner_team: 'integrity' },
    { id: 'fraud_win', description: '内鬼人数不少于廉正成员，调查被架空，舞弊阵营获胜', type: 'team_ge', team_a: 'fraud', team_b: 'integrity', winner_team: 'fraud' },
  ],
  fallback_rule: '最大轮次后按存活人数判定调查胜负。',
  tiebreak: { type: 'alive_count', team_order: ['fraud', 'integrity'], description: '最大轮次结束，存活人数更多的阵营获胜；同数表示调查被内鬼拖延成功。' },
  game_loop: { cycle_phase_ids: ['investigate', 'hearing', 'suspension'], max_rounds: 4, break_on_winner: true },
}

/** 阿瓦隆：精确人数角色表、组队表决、任务票和刺客终局。 */
export const AVALON_SPEC: GameSpec = {
  game_type: 'avalon',
  name: '阿瓦隆',
  description: '好人与邪恶阵营围绕五次任务进行隐藏身份博弈：队长提名队伍、全员表决、入队者秘密执行任务；好人完成三次任务后还要躲过刺客对梅林的刺杀。',
  min_players: 5,
  max_players: 10,
  teams: [{ id: 'good', name: '亚瑟忠臣阵营' }, { id: 'evil', name: '莫德雷德爪牙阵营' }],
  roles: [
    {
      id: 'merlin', name: '梅林', team: 'good',
      description: '知道大多数邪恶玩家，但必须隐藏身份；若三次任务成功后被刺客认出，好人仍会失败。', actions: [],
      knowledge: { teams: ['evil'], except_roles: ['mordred'], label: '你看到的邪恶玩家（莫德雷德除外）' },
    },
    {
      id: 'percival', name: '派西维尔', team: 'good',
      description: '看到梅林与莫甘娜，但不知道两者谁是真梅林。', actions: [],
      knowledge: { roles: ['merlin', 'morgana'], label: '你看到的两名“梅林候选”' },
    },
    { id: 'loyal', name: '忠臣', team: 'good', description: '没有额外身份信息，通过组队和任务结果判断邪恶阵营。', actions: [] },
    {
      id: 'assassin', name: '刺客', team: 'evil',
      description: '与邪恶同伴破坏任务；若好人先完成三次任务，可以刺杀梅林实现翻盘。', actions: ['assassinate'],
      knowledge: { teams: ['evil'], except_roles: ['oberon'], label: '你知道的邪恶同伴' },
    },
    {
      id: 'morgana', name: '莫甘娜', team: 'evil',
      description: '在派西维尔视野中伪装成梅林，并协助邪恶阵营破坏任务。', actions: [],
      knowledge: { teams: ['evil'], except_roles: ['oberon'], label: '你知道的邪恶同伴' },
    },
    {
      id: 'mordred', name: '莫德雷德', team: 'evil',
      description: '梅林看不到你的邪恶身份。', actions: [],
      knowledge: { teams: ['evil'], except_roles: ['oberon'], label: '你知道的邪恶同伴' },
    },
    { id: 'oberon', name: '奥伯伦', team: 'evil', description: '不认识其他邪恶玩家，其他邪恶玩家也看不到你。', actions: [] },
  ],
  actions: [
    {
      id: 'propose_team', name: '队长提名', primitive: 'propose_team', role: '__leader', audience: 'public',
      prompt: '你是本轮队长「{name}」（{id}）。结合公开记录与自己的秘密信息，提名规定人数的任务队伍。',
      output_schema: '{"team":["<玩家id>"],"reason":"<40字内提名理由>"}',
    },
    {
      id: 'approve_team', name: '组队表决', primitive: 'approve_team', role: 'all', audience: 'public',
      prompt: '你是「{name}」（{id}）。请对当前提名队伍独立投下赞成或反对票。',
      output_schema: '{"approve":<true|false>,"reason":"<30字内理由>"}',
    },
    { id: 'resolve_team_vote', name: '组队计票', primitive: 'resolve_team_vote', role: '__system', audience: 'public', prompt: '统计组队票。', output_schema: '{}' },
    {
      id: 'quest_vote', name: '秘密执行任务', primitive: 'quest_vote', role: '__proposed_team', audience: 'self',
      prompt: '你已进入任务队伍。好人必须提交成功票；邪恶玩家可以选择成功或失败以隐藏或破坏任务。',
      output_schema: '{"quest_success":<true|false>,"reason":"<仅供自己记录的简短策略>"}',
    },
    { id: 'resolve_quest', name: '任务结算', primitive: 'resolve_quest', role: '__system', audience: 'public', prompt: '只公布成功/失败票数量并结算任务，不公开投票者。', output_schema: '{}' },
    {
      id: 'assassinate', name: '刺杀梅林', primitive: 'assassinate', role: 'assassin', audience: 'public',
      prompt: '好人已完成三次任务。你是刺客，请根据整局组队与投票选择你认为是梅林的玩家。',
      output_schema: '{"target":"<玩家id>","reason":"<40字内判断>"}',
    },
    { id: 'resolve_assassination', name: '刺杀结算', primitive: 'resolve_assassination', role: '__system', audience: 'public', prompt: '公布刺杀目标身份并结算最终胜负。', output_schema: '{}' },
  ],
  composition: {
    fixed: [], ratio: [], fill_role: 'loyal',
    by_player_count: {
      '5': ['merlin', 'percival', 'loyal', 'assassin', 'morgana'],
      '6': ['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana'],
      '7': ['merlin', 'percival', 'loyal', 'loyal', 'assassin', 'morgana', 'oberon'],
      '8': ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred'],
      '9': ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred'],
      '10': ['merlin', 'percival', 'loyal', 'loyal', 'loyal', 'loyal', 'assassin', 'morgana', 'mordred', 'oberon'],
    },
  },
  phases: [
    { id: 'setup', name: '秘密身份分派', purpose: '每名玩家仅获得自己的身份与规则允许的秘密信息', kind: 'setup', participants: 'all', actions: [], policy: POLICY.setup, order: 'sequential' },
    { id: 'proposal', name: '队长提名队伍', purpose: '轮换队长并按当前任务人数提名队伍', kind: 'action', participants: 'all_alive', actions: ['propose_team'], policy: POLICY.day, order: 'sequential' },
    { id: 'team_vote', name: '全员组队表决', purpose: '全员同时对提名队伍投赞成或反对票', kind: 'vote', participants: 'all_alive', actions: ['approve_team', 'resolve_team_vote'], policy: POLICY.vote, order: 'simultaneous' },
    { id: 'quest', name: '秘密执行任务', purpose: '仅获批队员秘密提交任务票', kind: 'action', participants: 'all_alive', actions: ['quest_vote', 'resolve_quest'], policy: POLICY.night, order: 'simultaneous' },
    { id: 'assassination', name: '刺客终局', purpose: '好人三次任务成功后由刺客尝试识别梅林', kind: 'action', participants: ['assassin'], actions: ['assassinate', 'resolve_assassination'], policy: POLICY.night, order: 'sequential' },
    { id: 'end', name: '阵营复盘', purpose: '公布身份、任务轨迹和最终胜负', kind: 'end', participants: 'all', actions: [], policy: POLICY.end, order: 'sequential' },
  ],
  win_conditions: [
    { id: 'good_quests', description: '好人完成三次任务且梅林未被刺杀', type: 'llm', winner_team: 'good' },
    { id: 'evil_quests', description: '邪恶阵营破坏三次任务、连续否决五次组队，或刺客命中梅林', type: 'llm', winner_team: 'evil' },
  ],
  fallback_rule: '达到最大提名轮次仍未结束时，邪恶阵营成功拖延并获胜。',
  tiebreak: { type: 'team_priority', team_order: ['evil'], description: '最大提名轮次后仍未完成终局，邪恶阵营获胜。' },
  game_loop: { cycle_phase_ids: ['proposal', 'team_vote', 'quest', 'assassination'], max_rounds: 25, break_on_winner: true },
  quest_rules: {
    team_sizes_by_player_count: {
      '5': [2, 3, 2, 3, 3], '6': [2, 3, 4, 3, 4], '7': [2, 3, 3, 4, 4],
      '8': [3, 4, 4, 5, 5], '9': [3, 4, 4, 5, 5], '10': [3, 4, 4, 5, 5],
    },
    fail_threshold_by_player_count: {
      '7': { '4': 2 }, '8': { '4': 2 }, '9': { '4': 2 }, '10': { '4': 2 },
    },
    successes_to_win: 3,
    failures_to_win: 3,
    max_rejected_teams: 5,
    assassin_role: 'assassin',
    protected_role: 'merlin',
    good_team: 'good',
    evil_team: 'evil',
    good_win_label: '亚瑟忠臣阵营',
    evil_win_label: '莫德雷德爪牙阵营',
  },
}

/** 内置游戏注册表。未知游戏不应在这里逐一追加，而应由 Dispatcher 动态生成 GameSpec。 */
export const GAME_REGISTRY: Record<string, GameSpec> = {
  werewolf: WEREWOLF_SPEC,
  undercover: UNDERCOVER_SPEC,
  mafia: MAFIA_SPEC,
  cyber_defense: CYBER_DEFENSE_SPEC,
  fraud_audit: FRAUD_AUDIT_SPEC,
  avalon: AVALON_SPEC,
}
