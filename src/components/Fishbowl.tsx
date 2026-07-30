/**
 * Fishbowl 鱼缸可视化 · 内圈发言 / 外圈观察的环形布局
 */
import type { ScenarioConfig } from '../engine/types'

export function FishbowlCircle({
  config,
  inner,
  outer,
  prevInner = [],
}: {
  config?: ScenarioConfig
  inner: string[]
  outer: string[]
  prevInner?: string[]
}) {
  const size = 400
  const cx = size / 2
  const cy = size / 2 - 6
  const rInner = 72
  const rOuter = 140

  const pos = (i: number, n: number, r: number, offset = -90) => {
    const angle = ((360 / n) * i + offset) * (Math.PI / 180)
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), angle }
  }

  const name = (id: string) => config?.agents.find((a) => a.id === id)?.name ?? id
  const isNew = (id: string) => prevInner.length > 0 && !prevInner.includes(id)
  const isKept = (id: string) => prevInner.length > 0 && prevInner.includes(id)

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full">
        {/* 鱼缸水体 */}
        <circle cx={cx} cy={cy} r={rInner + 52} fill="#fafafa" stroke="#171717" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={rInner + 40} fill="none" stroke="#e5e5e5" strokeWidth="1" strokeDasharray="3 4" />
        <text x={cx} y={cy - rInner - 26} textAnchor="middle" className="fill-neutral-900" fontSize="12" fontWeight="700">内圈 · 发言</text>
        <text x={cx} y={cy + rOuter + 22} textAnchor="middle" className="fill-neutral-400" fontSize="11">外圈 · 观察（提交观察卡 / 申请进入内圈）</text>

        {/* 外圈 Agent */}
        {outer.map((id, i) => {
          const p = pos(i, outer.length, rOuter)
          return (
            <g key={id}>
              <circle cx={p.x} cy={p.y} r="20" fill="#fff" stroke="#d4d4d4" strokeWidth="1.5" strokeDasharray="3 2" />
              <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize="11" fontWeight="600" className="fill-neutral-400">
                {name(id).slice(0, 2)}
              </text>
              <text x={p.x} y={p.y + 34} textAnchor="middle" fontSize="10" className="fill-neutral-400">{name(id)}</text>
            </g>
          )
        })}

        {/* 内圈 Agent */}
        {inner.map((id, i) => {
          const p = pos(i, inner.length, rInner)
          return (
            <g key={id}>
              <circle cx={p.x} cy={p.y} r="24" fill="#171717" />
              {isNew(id) && <circle cx={p.x} cy={p.y} r="28" fill="none" stroke="#171717" strokeWidth="1" strokeDasharray="2 3" />}
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
                {name(id).slice(0, 2)}
              </text>
              <text x={p.x} y={p.y + 40} textAnchor="middle" fontSize="10.5" fontWeight="600" className="fill-neutral-800">
                {name(id)}{isNew(id) ? ' ↢换入' : isKept(id) ? ' ·留任' : ''}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex items-center gap-4 text-[11px] text-neutral-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full bg-neutral-900" />内圈 4 席</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-neutral-400" />外圈观察</span>
        {prevInner.length > 0 && <span>虚线圈 = 本轮新换入（≥2 席轮换）</span>}
      </div>
    </div>
  )
}
