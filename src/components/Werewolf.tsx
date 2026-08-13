/**
 * 通用博弈视图。所有文案、角色、阶段与动作均来自 GameSpec 事件，
 * 不包含任何特定游戏的硬编码。
 */
import type { GameActionEvent, GameSpeechEvent, GameRosterEntry } from '../engine/types'
import { Chip } from './common'

function resolveRoster(roster?: GameRosterEntry[]) {
  return roster ?? []
}

export function GameRoster({ dead = [], roster }: { dead?: string[]; roster?: GameRosterEntry[] }) {
  const players = resolveRoster(roster)
  if (players.length === 0) return null
  const teams = [...new Set(players.map((player) => player.team).filter(Boolean))]
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-neutral-900">玩家 · 上帝视角</span>
        <Chip tone="black">初始信息仅本人可见</Chip>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {players.map((player) => {
          const isDead = dead.includes(player.id)
          const highlighted = player.team !== 'good' && player.team !== 'civilian'
          return (
            <div key={player.id} className={`rounded-lg border p-2.5 text-center transition-all ${isDead ? 'border-neutral-200 bg-neutral-100 opacity-40' : highlighted ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 bg-white'}`}>
              <div className={`text-[14px] font-bold ${isDead ? 'line-through' : ''}`}>{player.name}</div>
              <div className={`mt-0.5 text-[11px] ${highlighted && !isDead ? 'text-neutral-300' : 'text-neutral-400'}`}>{player.role_label}</div>
              <div className={`mt-1 font-mono text-[10px] ${highlighted && !isDead ? 'text-neutral-500' : 'text-neutral-300'}`}>{player.id}</div>
            </div>
          )
        })}
      </div>
      {teams.length > 1 && (
        <div className="mt-2 text-[11px] text-neutral-400">深色 = 特殊阵营（观众视角揭示；对局中其他玩家不可见）</div>
      )}
    </div>
  )
}

export function GameSpeechBubble({ speech, roster }: { speech: GameSpeechEvent; roster?: GameRosterEntry[] }) {
  const players = resolveRoster(roster)
  const player = players.find((item) => item.id === speech.agent_id)
  const isPrivate = speech.audience === 'private'
  return (
    <div className={`flex gap-2.5 ${isPrivate ? 'opacity-95' : ''}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${player?.team && player.team !== 'good' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
        {player?.name.slice(0, 1) ?? '?'}
      </span>
      <div className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${isPrivate ? 'border border-dashed border-neutral-900 bg-neutral-900 text-white' : 'border border-neutral-200 bg-white'}`}>
        <div className="flex items-center gap-2">
          <span className={`text-[12.5px] font-bold ${isPrivate ? 'text-white' : 'text-neutral-900'}`}>{player?.name}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${isPrivate ? 'bg-white/15 text-neutral-200' : 'bg-neutral-100 text-neutral-500'}`}>
            {speech.phase_label} · {isPrivate ? '私密' : '公开'}
          </span>
        </div>
        <div className={`mt-1 text-[13px] leading-relaxed ${isPrivate ? 'text-neutral-100' : 'text-neutral-800'}`}>{speech.content}</div>
      </div>
    </div>
  )
}

export function GameActionLine({ action, roster }: { action: GameActionEvent; roster?: GameRosterEntry[] }) {
  const players = resolveRoster(roster)
  const player = players.find((item) => item.id === action.actor)
  const label = action.action_label.slice(0, 2)
  return (
    <div className="flex items-start gap-2.5 rounded-md bg-neutral-50 px-3 py-2">
      <span className="mt-0.5 flex h-5 min-w-5 items-center justify-center rounded bg-neutral-900 px-1 text-[10.5px] font-bold text-white">{label}</span>
      <div className="flex-1">
        <div className="text-[13px] leading-relaxed text-neutral-800">{action.result}</div>
        <div className="mt-0.5 font-mono text-[10.5px] text-neutral-400">{player ? `${player.name}(${player.id})` : action.actor} · {action.phase_label} · {action.action_label}</div>
      </div>
    </div>
  )
}

export function VoteTable({ votes, result, roster }: { votes: { agent_id: string; vote: string; reason: string }[]; result?: string; roster?: GameRosterEntry[] }) {
  const players = resolveRoster(roster)
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-bold text-neutral-900">投票结果</span>
        <Chip tone="black">E5 投票决议</Chip>
      </div>
      <div className="mt-3 space-y-1.5">
        {votes.map((vote, index) => (
          <div key={index} className="flex items-center gap-2 text-[13px]">
            <span className="w-20 font-medium text-neutral-800">{players.find((player) => player.id === vote.agent_id)?.name}</span>
            <span className="text-neutral-400">→</span>
            <span className="font-semibold text-neutral-700">{players.find((player) => player.id === vote.vote)?.name}</span>
            <span className="truncate text-[12px] text-neutral-400">{vote.reason}</span>
          </div>
        ))}
      </div>
      {result && (
        <div className="mt-3 rounded-md bg-neutral-900 px-3.5 py-2.5 text-[13px] font-medium leading-relaxed text-white">{result}</div>
      )}
    </div>
  )
}
