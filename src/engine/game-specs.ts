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
    { id: 'good_win', description: '所有狼人被淘汰，好人阵营获胜', type: 'role_eliminated', role: 'werewolf' },
    { id: 'wolf_win', description: '狼人数量不少于好人数量，狼人阵营获胜', type: 'team_ge', team_a: 'wolf', team_b: 'good' },
  ],
  fallback_rule: '若胜负尚不明确，则本局作为一个完整昼夜循环的演示，继续追踪存活玩家与阵营。',
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
    { id: 'civilian_win', description: '卧底被投票淘汰，平民阵营获胜', type: 'role_eliminated', role: 'spy' },
    { id: 'spy_win', description: '场上平民数量不高于卧底数量，卧底获胜', type: 'team_ge', team_a: 'spy', team_b: 'civilian' },
  ],
  fallback_rule: '达到最大轮次仍未分胜负时，公布词语并判定卧底成功隐藏。',
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
    { id: 'good_win', description: '所有杀手被淘汰，好人阵营获胜', type: 'role_eliminated', role: 'killer' },
    { id: 'killer_win', description: '杀手数量不少于好人数量，杀手阵营获胜', type: 'team_ge', team_a: 'killer', team_b: 'good' },
  ],
  fallback_rule: '达到最大轮次仍未分胜负时，判定剩余人数多的一方获胜。',
  game_loop: {
    cycle_phase_ids: ['night', 'day', 'vote'],
    max_rounds: 4,
    break_on_winner: true,
  },
}

/** 内置游戏注册表。未知游戏不应在这里逐一追加，而应由 Dispatcher 动态生成 GameSpec。 */
export const GAME_REGISTRY: Record<string, GameSpec> = {
  werewolf: WEREWOLF_SPEC,
  undercover: UNDERCOVER_SPEC,
  mafia: MAFIA_SPEC,
}
