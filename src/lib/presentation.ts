import PptxGenJS from 'pptxgenjs'
import type { DeliberationReport, ReportItem } from './report'

const SLIDE_WIDTH = 13.333
const SLIDE_HEIGHT = 7.5
const FONT = 'Microsoft YaHei'

const PALETTE = {
  ink: '111827',
  muted: '6B7280',
  faint: '9CA3AF',
  canvas: 'FFFFFF',
  soft: 'F3F4F6',
  line: 'E5E7EB',
  white: 'FFFFFF',
  dark: '111827',
  darkSoft: '1F2937',
}

function accentFor(category: DeliberationReport['meta']['category']): string {
  if (category === 'single') return '0EA5E9'
  if (category === 'collaborative') return '10B981'
  if (category === 'competitive') return 'F59E0B'
  return '64748B'
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim() || '议事报告'
}

function cleanText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const CONTENT_BOX_W = 11.5
const CONTENT_FONT = 11.5
const AGENDA_FONT = 12
const CONTENT_MAX_LINES = 14

/** 字符视觉宽度：全角（CJK、全角符号）按 2 计，半角按 1 计 */
function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  if (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) || // CJK 部首、汉字、假名等
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul 音节
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容汉字
    (code >= 0xfe10 && code <= 0xfe19) || // 竖排形式
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK 兼容形式
    (code >= 0xff00 && code <= 0xff60) || // 全角形式
    (code >= 0xffe0 && code <= 0xffe6) || // 全角符号
    (code >= 0x1f300 && code <= 0x1f64f) || // emoji
    (code >= 0x1f900 && code <= 0x1f9ff) || // 补充 emoji
    code === 0x3000 // 全角空格
  ) {
    return 2
  }
  return 1
}

/** 按文本框宽度与字号估算一行可容纳的“全角字符”数（保守值，防止 PowerPoint 实际折行更多而溢出） */
function charsPerLine(fontSize: number): number {
  // 文本框宽 11.5in = 828pt；微软雅黑全角字宽 ≈ 字号，留 8% 余量
  return Math.max(16, Math.floor((CONTENT_BOX_W * 72 * 0.92) / fontSize))
}

function wrapSingleLine(value: string, perLine: number): string[] {
  const lines: string[] = []
  let current = ''
  let width = 0
  for (const ch of value) {
    const w = charWidth(ch)
    if (current && width + w > perLine) {
      lines.push(current)
      current = ''
      width = 0
    }
    current += ch
    width += w
  }
  if (current) lines.push(current)
  return lines
}

function wrapParagraph(value: string, perLine: number): string[] {
  if (!value) return ['']
  return value.split('\n').flatMap((line) => {
    if (!line) return ['']
    return wrapSingleLine(line, perLine)
  })
}

function itemLines(item: ReportItem): string[] {
  if (item.kind === 'list') {
    return (item.items ?? []).map((entry) => `• ${cleanText(entry)}`)
  }
  const label = item.label ? `${cleanText(item.label)}：` : ''
  const value = cleanText(item.text ?? '')
  if (item.kind === 'score') {
    return [`■ ${label}${item.score ?? 0} / ${item.max ?? 0}${value ? ` · ${value}` : ''}`]
  }
  if (item.kind === 'status') {
    return [`★ ${label}${value}`]
  }
  if (item.kind === 'metric') {
    return [`■ ${label}${value}`]
  }
  return [`■ ${label}${value}`]
}

function packParagraphs(paragraphs: string[], perLine: number): string[] {
  if (!paragraphs.length) return ['暂无内容']
  const pages: string[][] = [[]]
  for (const paragraph of paragraphs) {
    const wrapped = wrapParagraph(paragraph, perLine)
    if (wrapped.length <= CONTENT_MAX_LINES) {
      const page = pages[pages.length - 1]
      if (page.length + wrapped.length > CONTENT_MAX_LINES) pages.push([])
      pages[pages.length - 1].push(...wrapped)
      continue
    }

    // 单个段落超过一页：先填满当前页，剩余部分逐页拆分（避免产生空页）。
    let remaining = wrapped
    const page = pages[pages.length - 1]
    if (page.length) {
      const canFit = CONTENT_MAX_LINES - page.length
      page.push(...remaining.slice(0, canFit))
      remaining = remaining.slice(canFit)
    }
    while (remaining.length) {
      pages.push(remaining.slice(0, CONTENT_MAX_LINES))
      remaining = remaining.slice(CONTENT_MAX_LINES)
    }
  }
  return pages.map((lines) => lines.join('\n'))
}

function pageItems(items: ReportItem[]): string[] {
  if (!items.length) return ['暂无内容']
  return packParagraphs(items.flatMap((item) => itemLines(item)), charsPerLine(CONTENT_FONT))
}

function pageAgenda(sections: DeliberationReport['sections']): string[] {
  return packParagraphs(sections.map((section, index) =>
    `${String(index + 1).padStart(2, '0')}  ${cleanText(section.title)}`,
  ), charsPerLine(AGENDA_FONT))
}

function titleFontSize(value: string, base: number): number {
  const length = [...value].length
  if (length > 30) return Math.max(14, base - 8)
  if (length > 20) return Math.max(15, base - 5)
  return base
}

function truncateTitle(value: string, maxLength: number): string {
  const chars = [...value]
  return chars.length > maxLength ? `${chars.slice(0, maxLength - 1).join('')}…` : value
}

function addBrandFooter(slide: PptxGenJS.Slide, accent: string) {
  slide.addShape('rect', { x: 0.75, y: 7.12, w: 0.9, h: 0.03, fill: { color: accent } })
  slide.addText('MA-COLLAB · AI 议事汇报', {
    x: 0.75,
    y: 7.15,
    w: 4.5,
    h: 0.2,
    fontFace: FONT,
    fontSize: 8,
    color: PALETTE.faint,
  })
}

function addHeader(slide: PptxGenJS.Slide, title: string, accent: string) {
  slide.addText(truncateTitle(title, 24), {
    x: 0.75,
    y: 0.42,
    w: 10.8,
    h: 0.68,
    fontFace: FONT,
    fontSize: titleFontSize(title, 20),
    bold: true,
    color: PALETTE.ink,
    breakLine: true,
    fit: 'shrink',
  })
  slide.addShape('rect', { x: 0.78, y: 1.16, w: 0.9, h: 0.06, fill: { color: accent } })
  slide.addText('DELIBERATION REPORT', {
    x: 0.78,
    y: 0.35,
    w: 3.4,
    h: 0.22,
    fontFace: FONT,
    fontSize: 8.5,
    color: accent,
  })
}

function addCoverSlide(pptx: PptxGenJS, report: DeliberationReport, accent: string) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.dark }
  slide.addShape('rect', { x: 0, y: 0, w: 0.2, h: SLIDE_HEIGHT, fill: { color: accent } })
  slide.addShape('rect', { x: 0, y: 6.9, w: SLIDE_WIDTH, h: 0.03, fill: { color: accent } })
  slide.addText('MA-COLLAB · DELIBERATION REPORT', {
    x: 0.9,
    y: 0.8,
    w: 8,
    h: 0.35,
    fontFace: FONT,
    fontSize: 10,
    color: accent,
  })
  slide.addText(truncateTitle(cleanText(report.meta.title), 36), {
    x: 0.9,
    y: 1.45,
    w: 11.4,
    h: 1.6,
    fontFace: FONT,
    fontSize: titleFontSize(cleanText(report.meta.title), 34),
    bold: true,
    color: PALETTE.white,
    fit: 'shrink',
  })
  slide.addText(cleanText(report.meta.issue || '未记录议题'), {
    x: 0.9,
    y: 3.0,
    w: 11.4,
    h: 1.3,
    fontFace: FONT,
    fontSize: 15,
    color: 'D1D5DB',
    breakLine: true,
    fit: 'shrink',
  })
  slide.addText([
    { text: report.meta.categoryLabel, options: { breakLine: true } },
    { text: `状态：${report.meta.terminalState}`, options: { breakLine: true } },
    { text: `${report.meta.agentCount} 个 Agent`, options: { breakLine: true } },
    { text: `${report.meta.calls} 次调用 · ${report.meta.tokens.toLocaleString()} tokens`, options: { breakLine: true } },
    { text: report.meta.generatedAt, options: { breakLine: true } },
  ], {
    x: 0.9,
    y: 4.6,
    w: 11.4,
    h: 1.4,
    fontFace: FONT,
    fontSize: 11,
    color: 'D1D5DB',
    lineSpacing: 15,
    paraSpaceAfter: 4,
  })
  slide.addNotes(`议题：${cleanText(report.meta.issue)}\n任务类别：${cleanText(report.meta.categoryLabel)}\n终止状态：${report.meta.terminalState}`)
}

function addAgendaSlide(pptx: PptxGenJS, content: string, partIndex: number, partCount: number, accent: string) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.canvas }
  addHeader(slide, partCount > 1 ? `议程 · ${partIndex + 1}/${partCount}` : '议程', accent)
  slide.addText(content, {
    x: 0.9,
    y: 1.5,
    w: 11.5,
    h: 5.6,
    fontFace: FONT,
    fontSize: AGENDA_FONT,
    color: PALETTE.ink,
    lineSpacing: 17,
    paraSpaceAfter: 3,
    breakLine: true,
  })
  addBrandFooter(slide, accent)
  slide.addNotes(content)
}

function addSectionDivider(pptx: PptxGenJS, index: number, section: DeliberationReport['sections'][number], accent: string) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.dark }
  slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: SLIDE_HEIGHT, fill: { color: accent } })
  slide.addText(String(index + 1).padStart(2, '0'), {
    x: 0.9,
    y: 2.0,
    w: 3,
    h: 1.8,
    fontFace: FONT,
    fontSize: 56,
    bold: true,
    color: accent,
  })
  slide.addText(truncateTitle(cleanText(section.title), 30), {
    x: 3.4,
    y: 2.35,
    w: 8.5,
    h: 1.25,
    fontFace: FONT,
    fontSize: titleFontSize(cleanText(section.title), 24),
    bold: true,
    color: PALETTE.white,
    breakLine: true,
    fit: 'shrink',
  })
  if (section.subtitle) {
    slide.addText(cleanText(section.subtitle), {
      x: 3.4,
      y: 3.35,
      w: 8.5,
      h: 0.9,
      fontFace: FONT,
      fontSize: 13,
      color: 'D1D5DB',
      breakLine: true,
      fit: 'shrink',
    })
  }
  slide.addNotes(`${cleanText(section.title)}\n${cleanText(section.subtitle ?? '')}`)
}

function addContentSlide(
  pptx: PptxGenJS,
  section: DeliberationReport['sections'][number],
  content: string,
  partIndex: number,
  partCount: number,
  accent: string,
) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.canvas }
  const suffix = partCount > 1 ? ` · ${partIndex + 1}/${partCount}` : ''
  addHeader(slide, `${cleanText(section.title)}${suffix}`, accent)
  slide.addText(content, {
    x: 0.9,
    y: 1.5,
    w: 11.5,
    h: 5.6,
    fontFace: FONT,
    fontSize: CONTENT_FONT,
    color: PALETTE.ink,
    lineSpacing: 16,
    paraSpaceAfter: 3,
    breakLine: true,
  })
  addBrandFooter(slide, accent)
  slide.addNotes(content)
}

function addClosingSlide(pptx: PptxGenJS, report: DeliberationReport, accent: string) {
  const slide = pptx.addSlide()
  slide.background = { color: PALETTE.dark }
  slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: SLIDE_HEIGHT, fill: { color: accent } })
  slide.addText('结论与授权边界', {
    x: 0.9,
    y: 2.1,
    w: 11,
    h: 0.8,
    fontFace: FONT,
    fontSize: 28,
    bold: true,
    color: PALETTE.white,
  })
  slide.addText('本报告由 AI 多智能体议事生成，仅用于辅助分析，不替代真实公共决策与实地调研。', {
    x: 0.9,
    y: 3.1,
    w: 11,
    h: 1.0,
    fontFace: FONT,
    fontSize: 14,
    color: 'D1D5DB',
    breakLine: true,
  })
  slide.addText(truncateTitle(report.meta.title, 36), {
    x: 0.9,
    y: 4.3,
    w: 11,
    h: 0.4,
    fontFace: FONT,
    fontSize: 10,
    color: PALETTE.faint,
    breakLine: true,
  })
}

export function buildReportPresentation(report: DeliberationReport): PptxGenJS {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'DELIBERATION_WIDE', width: SLIDE_WIDTH, height: SLIDE_HEIGHT })
  pptx.layout = 'DELIBERATION_WIDE'
  const accent = accentFor(report.meta.category)
  addCoverSlide(pptx, report, accent)
  const agendaPages = pageAgenda(report.sections)
  agendaPages.forEach((content, index) => addAgendaSlide(pptx, content, index, agendaPages.length, accent))

  report.sections.forEach((section, index) => {
    addSectionDivider(pptx, index, section, accent)
    const pages = pageItems(section.items)
    pages.forEach((content, pageIndex) => {
      addContentSlide(pptx, section, content, pageIndex, pages.length, accent)
    })
  })

  addClosingSlide(pptx, report, accent)
  return pptx
}

export async function exportReportAsPptx(report: DeliberationReport): Promise<void> {
  const pptx = buildReportPresentation(report)
  await pptx.writeFile({ fileName: `${safeFileName(report.meta.title)}.pptx`, compression: true })
}

// ==================== AI 生成演示文稿（LLM 大纲 + 模板渲染） ====================

/** AI 生成的一页幻灯片（结构受控，从源头杜绝文字溢出） */
export interface AiSlide {
  /** 标题（≤ 24 字，超长自动截断） */
  title: string
  /** 副标题（可选） */
  subtitle?: string
  /** 要点列表：3-6 条，每条 ≤ 40 个中文字符 */
  bullets: string[]
  /** 演讲备注（可选） */
  notes?: string
}

/** 单页要点 → 行序列（前缀编号圆点） */
function aiSlideLines(slide: AiSlide): string[] {
  const lines: string[] = []
  slide.bullets.forEach((bullet, index) => {
    const text = cleanText(bullet)
    if (!text) return
    lines.push(`${String(index + 1).padStart(2, '0')}  ${text}`)
  })
  return lines
}

function addAiBodySlide(
  pptx: PptxGenJS,
  slide: AiSlide,
  content: string,
  partIndex: number,
  partCount: number,
  accent: string,
): void {
  const page = pptx.addSlide()
  page.background = { color: PALETTE.canvas }
  const pageTitle = truncateTitle(cleanText(slide.title) || '汇报内容', 24)
  addHeader(page, partCount > 1 ? `${pageTitle} · ${partIndex + 1}/${partCount}` : pageTitle, accent)

  let y = 1.5
  if (slide.subtitle) {
    page.addText(cleanText(slide.subtitle), {
      x: 0.9,
      y,
      w: 11.5,
      h: 0.34,
      fontFace: FONT,
      fontSize: 10.5,
      color: PALETTE.muted,
      lineSpacing: 13,
      breakLine: true,
    })
    y = 1.95
  }
  page.addText(content, {
    x: 0.9,
    y,
    w: 11.5,
    h: 7.12 - y - 0.1,
    fontFace: FONT,
    fontSize: 13,
    color: PALETTE.ink,
    lineSpacing: 18,
    paraSpaceAfter: 8,
    breakLine: true,
  })
  addBrandFooter(page, accent)
  page.addNotes(slide.notes ?? content)
}

/** 按 AI 生成的大纲渲染演示文稿：封面 + N 页正文（自动分页）+ 结语 */
export function buildAiPresentation(report: DeliberationReport, slides: AiSlide[]): PptxGenJS {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'DELIBERATION_WIDE', width: SLIDE_WIDTH, height: SLIDE_HEIGHT })
  pptx.layout = 'DELIBERATION_WIDE'
  const accent = accentFor(report.meta.category)
  addCoverSlide(pptx, report, accent)

  const perLine = charsPerLine(13)
  slides.forEach((slide) => {
    const wrapped = packParagraphs(aiSlideLines(slide), perLine)
    wrapped.forEach((content, index) => {
      addAiBodySlide(pptx, slide, content, index, wrapped.length, accent)
    })
  })

  addClosingSlide(pptx, report, accent)
  return pptx
}

export async function exportAiPptx(report: DeliberationReport, slides: AiSlide[]): Promise<void> {
  const pptx = buildAiPresentation(report, slides)
  await pptx.writeFile({ fileName: `${safeFileName(report.meta.title)}_AI.pptx`, compression: true })
}
