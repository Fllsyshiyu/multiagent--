import type { ComplexityResult } from '../complexity'
import { COMPLEXITY_LEVELS, DIMENSION_LABELS } from '../complexity'
import { BlockHeader, Chip, SectionCard, Spinner } from './common'

const LEVEL_STYLE: Record<number, string> = {
  1: 'bg-emerald-500', 2: 'bg-lime-500', 3: 'bg-amber-500', 4: 'bg-orange-500', 5: 'bg-red-500',
}

export function ComplexityBlock({ running, result }: { running: boolean; result?: ComplexityResult; tokens?: number; source?: 'distilbert' }) {
  const meta = result ? COMPLEXITY_LEVELS[result.complexity] : null
  return (
    <SectionCard>
      <BlockHeader
        index="0"
        title="Query Complexity · 云端 DistilBERT 六维评估"
        sub={running ? '正在调用云端 DistilBERT 计算六项复杂度指标…' : meta?.description}
        right={running ? <Spinner /> : result ? (
          <Chip tone={result.model === 'fallback' ? 'amber' : 'green'}>
            {result.model === 'fallback' ? '服务降级结果' : `云端模型 · ${result.latency_ms.toFixed(1)} ms`}
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
                  ? '云端模型暂不可用，当前显示保守默认值'
                  : `六项指标均由托管 DistilBERT 编码器计算 · 综合置信度 ${Math.round(result.confidence * 100)}%`}
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
