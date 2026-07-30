/**
 * 共享 UI 小组件 · Kimi 风格：白底黑字、细灰边框、克制圆角
 */
import type { ReactNode } from 'react'
import type { StrategyCombo } from '../engine/types'
import { STRATEGY_LABELS } from '../engine/dispatcher'

export function Chip({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'black' | 'green' | 'red' | 'amber' }) {
  const cls = {
    gray: 'bg-neutral-100 text-neutral-600 border-neutral-200',
    black: 'bg-neutral-900 text-white border-neutral-900',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-600 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  }[tone]
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>
}

export function SectionCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-neutral-200 bg-white ${className}`}>{children}</div>
}

export function BlockHeader({ index, title, sub, right }: { index?: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-4">
      <div className="flex items-start gap-3">
        {index && <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">{index}</span>}
        <div>
          <div className="text-[15px] font-semibold text-neutral-900">{title}</div>
          {sub && <div className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">{sub}</div>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

export function StrategyChips({ combo, compact = false }: { combo: StrategyCombo; compact?: boolean }) {
  const parts: { code: string; family: string }[] = [
    ...combo.A.map((c) => ({ code: c, family: 'A' })),
    ...(combo.B ? [{ code: combo.B, family: 'B' }] : []),
    ...(combo.C ? [{ code: combo.C, family: 'C' }] : []),
    ...(combo.D ? [{ code: combo.D, family: 'D' }] : []),
    ...combo.E.map((c) => ({ code: c, family: 'E' })),
  ]
  if (parts.length === 0) return null
  const familyColor: Record<string, string> = {
    A: 'bg-sky-50 text-sky-700 border-sky-200',
    B: 'bg-violet-50 text-violet-700 border-violet-200',
    C: 'bg-amber-50 text-amber-700 border-amber-200',
    D: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    E: 'bg-rose-50 text-rose-700 border-rose-200',
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {parts.map((p, i) => (
        <span
          key={i}
          title={`${p.family} 族策略 · ${STRATEGY_LABELS[p.code] ?? p.code}`}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-mono font-medium ${familyColor[p.family]}`}
        >
          {p.code}
          {!compact && <span className="font-sans opacity-70">{STRATEGY_LABELS[p.code] ?? ''}</span>}
        </span>
      ))}
    </span>
  )
}

export function Spinner() {
  return (
    <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800" />
  )
}

export function AgentAvatar({ name, small = false, dim = false }: { name: string; small?: boolean; dim?: boolean }) {
  const size = small ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-[13px]'
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full border font-semibold ${size} ${dim ? 'border-neutral-200 bg-neutral-100 text-neutral-400' : 'border-neutral-300 bg-neutral-900 text-white'}`}>
      {name.slice(0, 1)}
    </span>
  )
}

export function TokenBadge({ tokens }: { tokens: number }) {
  return <span className="font-mono text-[11px] text-neutral-400">{tokens.toLocaleString()} tok</span>
}
