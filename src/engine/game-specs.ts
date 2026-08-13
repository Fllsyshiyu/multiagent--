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

/** 内置游戏注册表。未知游戏不应在这里逐一追加，而应由 Dispatcher 动态生成 GameSpec。 */
export const GAME_REGISTRY: Record<string, GameSpec> = {
  werewolf: WEREWOLF_SPEC,
  undercover: UNDERCOVER_SPEC,
  mafia: MAFIA_SPEC,
  cyber_defense: CYBER_DEFENSE_SPEC,
  fraud_audit: FRAUD_AUDIT_SPEC,
}
