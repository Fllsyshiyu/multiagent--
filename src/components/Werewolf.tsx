/**
 * 狼人杀视图 · 上帝视角（观众可见全部身份与私聊）
 */
import type { GameActionEvent, GameSpeechEvent, WerewolfAction, WerewolfRosterEntry, WerewolfSpeech } from '../engine/types'
import { Chip } from './common'

export const WEREWOLF_PLAYERS: WerewolfRosterEntry[] = [
  { id: 'p1', name: '沈默', role: 'werewolf', role_label: '狼人', team: 'wolf' },
  { id: 'p2', name: '阿岚', role: 'werewolf', role_label: '狼人', team: 'wolf' },
  { id: 'p3', name: '陆一', role: 'seer', role_label: '预言家', team: 'good' },
  { id: 'p4', name: '苏叶', role: 'witch', role_label: '女巫', team: 'good' },
  { id: 'p5', name: '老周', role: 'villager', role_label: '平民', team: 'good' },
  { id: 'p6', name: '小满', role: 'villager', role_label: '平民', team: 'good' },
]

function resolveRoster(roster?: WerewolfRosterEntry[]) {
  return roster?.length ? roster : WEREWOLF_PLAYERS
}

export function WerewolfRoster({ dead = [], roster }: { dead?: string[]; roster?: WerewolfRosterEntry[] }) {
  const players = resolveRoster(roster)
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-neutral-900">玩家 · 上帝视角</span>
        <Chip tone="black">初始信息仅本人可见</Chip>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {players.map((p) => {
          const isDead = dead.includes(p.id)
          return (
            <div key={p.id} className={`rounded-lg border p-2.5 text-center transition-all ${isDead ? 'border-neutral-200 bg-neutral-100 opacity-40' : p.team === 'wolf' ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white'}`}>
              <div className={`text-[14px] font-bold ${isDead ? 'line-through' : ''}`}>{p.name}</div>
              <div className={`mt-0.5 text-[11px] ${p.team === 'wolf' && !isDead ? 'text-neutral-300' : 'text-neutral-400'}`}>{p.role_label}</div>
              <div className={`mt-1 font-mono text-[10px] ${p.team === 'wolf' && !isDead ? 'text-neutral-500' : 'text-neutral-300'}`}>{p.id}</div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 text-[11px] text-neutral-400">深色 = 特殊阵营（观众视角揭示；对局中其他玩家不可见）</div>
    </div>
  )
}

export function WerewolfSpeechBubble({ speech, roster }: { speech: WerewolfSpeech; roster?: WerewolfRosterEntry[] }) {
  const players = resolveRoster(roster)
  const p = players.find((player) => player.id === speech.agent_id)
  const isPrivate = speech.audience === 'private'
  return (
    <div className={`flex gap-2.5 ${isPrivate ? 'opacity-95' : ''}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${p?.team === 'wolf' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
        {p?.name.slice(0, 1) ?? '?'}
      </span>
      <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${isPrivate ? 'border border-dashed border-neutral-900 bg-neutral-900 text-white' : 'border border-neutral-200 bg-white'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-[12.5px] font-bold ${isPrivate ? 'text-white' : 'text-neutral-900'}`}>{p?.name}</span>
          {isPrivate ? (
            <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium text-neutral-200">私密通信 · 仅同阵营可见（观众上帝视角）</span>
          ) : (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">公开发言</span>
          )}
        </div>
        <div className={`mt-1 text-[13px] leading-relaxed ${isPrivate ? 'text-neutral-100' : 'text-neutral-800'}`}>{speech.content}</div>
      </div>
    </div>
  )
}

export function GameSpeechBubble({ speech, roster }: { speech: GameSpeechEvent; roster?: WerewolfRosterEntry[] }) {
  const players = resolveRoster(roster)
  const p = players.find((player) => player.id === speech.agent_id)
  const isPrivate = speech.audience === 'private'
  return (
    <div className={`flex gap-2.5 ${isPrivate ? 'opacity-95' : ''}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${p?.team === 'wolf' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
        {p?.name.slice(0, 1) ?? '?'}
      </span>
      <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${isPrivate ? 'border border-dashed border-neutral-900 bg-neutral-900 text-white' : 'border border-neutral-200 bg-white'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-[12.5px] font-bold ${isPrivate ? 'text-white' : 'text-neutral-900'}`}>{p?.name}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${isPrivate ? 'bg-white/15 text-neutral-200' : 'bg-neutral-100 text-neutral-500'}`}>
            {speech.phase_label} · {isPrivate ? '私密' : '公开'}
          </span>
        </div>
        <div className={`mt-1 text-[13px] leading-relaxed ${isPrivate ? 'text-neutral-100' : 'text-neutral-800'}`}>{speech.content}</div>
      </div>
    </div>
  )
}

export function GameActionLine({ action, roster }: { action: GameActionEvent; roster?: WerewolfRosterEntry[] }) {
  const players = resolveRoster(roster)
  const p = players.find((player) => player.id === action.actor)
  return (
    <div className="flex items-start gap-2.5 rounded-md bg-neutral-50 px-3 py-2">
      <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded bg-neutral-900 px-1 text-[10.5px] font-bold text-white">{action.action_label.slice(0, 1)}</span>
      <div className="flex-1">
        <div className="text-[13px] leading-relaxed text-neutral-800">{action.result}</div>
        <div className="mt-0.5 font-mono text-[10.5px] text-neutral-400">{p ? `${p.name}(${p.id})` : action.actor} · {action.phase_label} · {action.action_label}</div>
      </div>
    </div>
  )
}

export function WerewolfActionLine({ action, roster }: { action: WerewolfAction; roster?: WerewolfRosterEntry[] }) {
  const players = resolveRoster(roster)
  const p = players.find((player) => player.id === action.actor)
  const label = { kill: '刀', check: '验', save: '救', poison: '毒', vote: '投', eliminate: '出局', reveal: '公告' }[action.action] ?? '·'
  const audience = action.visible_to.includes('all') ? '全员可见' : `权限路由：${action.visible_to.filter((v) => v !== 'god').map((v) => players.find((player) => player.id === v)?.name ?? v).join('、') || '系统'} 可见`
  return (
    <div className="flex items-start gap-2.5 rounded-md bg-neutral-50 px-3 py-2">
      <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded bg-neutral-900 px-1 text-[10.5px] font-bold text-white">{label}</span>
      <div className="flex-1">
        <div className="text-[13px] leading-relaxed text-neutral-800">{action.result}</div>
        <div className="mt-0.5 font-mono text-[10.5px] text-neutral-400">{p ? `${p.name}(${p.id})` : action.actor} · B3 {audience}</div>
      </div>
    </div>
  )
}

export function VoteTable({ votes, result, roster }: { votes: { agent_id: string; vote: string; reason: string }[]; result?: string; roster?: WerewolfRosterEntry[] }) {
  const players = resolveRoster(roster)
  const tally: Record<string, number> = {}
  votes.forEach((v) => (tally[v.vote] = (tally[v.vote] ?? 0) + 1))
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-bold text-neutral-900">投票结果</span>
        <Chip tone="black">E5 投票决议</Chip>
      </div>
      <div className="mt-3 space-y-1.5">
        {votes.map((v, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px]">
            <span className="w-16 font-medium text-neutral-800">{players.find((p) => p.id === v.agent_id)?.name}</span>
            <span className="text-neutral-400">→</span>
            <span className={`font-semibold ${players.find((p) => p.id === v.vote)?.team === 'wolf' ? 'text-neutral-900 underline decoration-2' : 'text-neutral-700'}`}>{players.find((p) => p.id === v.vote)?.name}</span>
            <span className="truncate text-[12px] text-neutral-400">{v.reason}</span>
          </div>
        ))}
      </div>
      {result && (
        <div className="mt-3 rounded-md bg-neutral-900 px-3.5 py-2.5 text-[13px] font-medium leading-relaxed text-white">{result}</div>
      )}
    </div>
  )
}
