import { z } from 'zod'
import { callValidatedJSON, type LLMCaller } from '../engine/llm'
import type { DeliberationReport, ReportItem } from './report'
import type { AiSlide } from './presentation'

/** LLM 输出的大纲 Schema（宽松校验 + 后处理裁剪，渲染层再做折行/分页兜底） */
const AiSlidesSchema = z.object({
  slides: z
    .array(
      z.object({
        title: z.string().min(1).max(60),
        subtitle: z.string().max(120).optional(),
        bullets: z.array(z.string().min(1).max(200)).min(2).max(10),
        notes: z.string().max(400).optional(),
      }),
    )
    .min(4)
    .max(20),
})

const SYSTEM_PROMPT = `你是一名资深演示文稿设计师。请根据给定的议事报告，输出一份结构清晰、适合演讲的演示文稿大纲。

【硬性约束（违反会导致废稿）】
1. 只输出一个 JSON 对象，不要任何解释性文字、不要 Markdown 代码块。
2. JSON 结构：{"slides":[{"title":"...","subtitle":"...","bullets":["...","..."],"notes":"..."}]}
3. slides 数量 8-12 页。
4. 每页 title 不超过 20 个汉字；bullets 3-5 条；每条 bullet 不超过 40 个汉字（可含少量数字和英文）；subtitle、notes 可选。
5. 内容必须忠实于报告，不得编造数据；突出关键结论、数据、方案、风险与行动项。
6. 每页只讲一个主题，要点简短口语化，方便演示时逐条展开。`

function summarizeItem(item: ReportItem): string {
  if (item.kind === 'list') {
    return (item.items ?? []).slice(0, 8).join('；').slice(0, 200)
  }
  if ('label' in item && item.label) {
    const text = 'text' in item && item.text ? ` ${item.text}` : ''
    return `${item.label}${text}`.slice(0, 200)
  }
  if ('text' in item && item.text) return item.text.slice(0, 200)
  return ''
}

function buildUserPrompt(report: DeliberationReport): string {
  const meta = report.meta
  const header = [
    `报告标题：${meta.title}`,
    `议题：${meta.issue}`,
    `任务类别：${meta.categoryLabel}`,
    `终止状态：${meta.terminalState}`,
    `Agent 数量：${meta.agentCount}`,
  ].join('\n')

  const body = report.sections
    .map((section) => {
      const items = section.items.map(summarizeItem).filter(Boolean).join('\n')
      return `## ${section.title}${section.subtitle ? `（${section.subtitle}）` : ''}\n${items}`
    })
    .join('\n\n')

  return `${header}\n\n【报告正文】\n${body}`
}

/** 按字符（非 code unit）截断，避免切开 emoji/代理对 */
function clip(value: string, max: number): string {
  return [...value].slice(0, max).join('')
}

/** 归一化：裁剪到渲染模板的安全范围（每页 ≤6 条、每条 ≤80 字符、标题 ≤24 字） */
function normalize(raw: z.infer<typeof AiSlidesSchema>): AiSlide[] {
  return raw.slides.map((slide) => ({
    title: clip(slide.title, 24),
    subtitle: slide.subtitle ? clip(slide.subtitle, 40) : undefined,
    bullets: slide.bullets.slice(0, 6).map((bullet) => clip(bullet, 80)).filter(Boolean),
    notes: slide.notes,
  }))
}

/** 调用 LLM 生成演示文稿大纲（内容受控，从源头避免文字溢出） */
export async function generateAISlideOutline(
  report: DeliberationReport,
  caller: LLMCaller,
): Promise<AiSlide[]> {
  const { data } = await callValidatedJSON(caller, SYSTEM_PROMPT, buildUserPrompt(report), AiSlidesSchema)
  return normalize(data)
}
