export interface ParsedGameRequest {
  gameType: string | null
  playerCount: number | null
}

const GAME_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/谁是卧底|卧底游戏/, 'undercover'],
  [/杀人游戏|警察.*杀手|杀手.*警察/, 'mafia'],
  [/网络安全|红蓝对抗|攻防演练|入侵检测/, 'cyber_defense'],
  [/反舞弊|舞弊调查|内鬼调查|企业审计/, 'fraud_audit'],
  [/狼人杀/, 'werewolf'],
  [/阿瓦隆|抵抗组织/, 'avalon'],
  [/德州扑克|扑克/, 'poker'],
]

const CHINESE_DIGITS: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
}

function parseChineseNumber(value: string): number | null {
  if (value === '十') return 10
  if (value.includes('十')) {
    const [tens, ones] = value.split('十')
    const tensValue = tens ? CHINESE_DIGITS[tens] : 1
    const onesValue = ones ? CHINESE_DIGITS[ones] : 0
    return tensValue === undefined || onesValue === undefined ? null : tensValue * 10 + onesValue
  }
  return CHINESE_DIGITS[value] ?? null
}

/** 从自由文本中识别明确的游戏名称；不命中时保留 Dispatcher 的判断。 */
export function parseGameType(userInput: string): string | null {
  for (const [pattern, gameType] of GAME_ALIASES) {
    if (pattern.test(userInput)) return gameType
  }
  return null
}

/** 支持“12人 / 12 个人 / 十二位玩家”等常见人数表达。 */
export function parsePlayerCount(userInput: string): number | null {
  const arabic = userInput.match(/(\d{1,3})\s*(?:个|名|位)?\s*(?:人|玩家)/)
  if (arabic) return Number(arabic[1])

  const chinese = userInput.match(/([一二两三四五六七八九]十[一二三四五六七八九]?|十[一二三四五六七八九]?|[一二两三四五六七八九])\s*(?:个|名|位)?\s*(?:人|玩家)/)
  return chinese ? parseChineseNumber(chinese[1]) : null
}

export function parseGameRequest(userInput: string): ParsedGameRequest {
  return { gameType: parseGameType(userInput), playerCount: parsePlayerCount(userInput) }
}

export function resolveGameType(userInput: string, dispatcherGameType?: string | null): string {
  return parseGameType(userInput) ?? dispatcherGameType ?? 'unknown'
}
