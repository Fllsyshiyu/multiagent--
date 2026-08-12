import type { ComplexityResult } from '../complexity'
import { COMPLEXITY_LEVELS, DIMENSION_LABELS } from '../complexity'
import { BlockHeader, Chip, SectionCard, Spinner } from './common'

const LEVEL_STYLE: Record<number, string> = {
  1: 'bg-emerald-500', 2: 'bg-lime-500', 3: 'bg-amber-500', 4: 'bg-orange-500', 5: 'bg-red-500',
}

export function ComplexityBlock({ running, result, tokens }: { running: boolean; result?: ComplexityResult; tokens?: number; source?: 'api' }) {
  const meta = result ? COMPLEXITY_LEVELS[result.complexity] : null
  return (
    <SectionCard>
      <BlockHeader
        index="0"
        title="Query Complexity · API Rubric 六维评估"
        sub={running ? '正在调用配置的模型 API 按固定 Rubric 评估复杂度…' : meta?.description}
        right={running ? <Spinner /> : result ? (
          <Chip tone={result.model === 'fallback' ? 'amber' : 'green'}>
            {result.model === 'fallback' ? 'API 降级结果' : `${tokens?.toLocaleString() ?? 0} tokens · ${result.latency_ms.toFixed(0)} ms`}
          </Chip>
        ) : undefined}
      />
      {result && meta && (
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl font-bold text-white ${LEVEL_STYLE[result.complexity]}`}>{result.complexity}</div>
            <div>
              <div className="text-[16px] font-bold text-neutral-900">Level {result.complexity} · {meta.name}</div>
              <div className="mt-1 text-[12px] text-neutral-500">
                {result.model === 'fallback'
                  ? '模型 API 暂不可用，当前显示保守默认值'
                  : `模型依据固定六维 Rubric 分析 · 综合置信度 ${Math.round(result.confidence * 100)}%`}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {Object.entries(result.dimensions).map(([key, value]) => {
              const typedKey = key as keyof typeof result.dimensions
              return (
                <div key={key} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12.5px] font-medium text-neutral-700">{DIMENSION_LABELS[typedKey]}</span>
                    <span className="font-mono text-[12px] text-neutral-500">{value} / 4 · {Math.round(result.dimension_confidence[typedKey] * 100)}%</span>
                  </div>
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4].map((n) => <span key={n} className={`h-2 flex-1 rounded-full ${n <= value ? LEVEL_STYLE[Math.min(5, value + 1)] : 'bg-neutral-200'}`} />)}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-3 font-mono text-[10.5px] text-neutral-400">
            {result.model} · {result.method} · {result.rubric_version}
          </div>
        </div>
      )}
    </SectionCard>
  )
}
