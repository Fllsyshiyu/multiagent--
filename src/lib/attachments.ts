import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
// @ts-expect-error - mammoth.browser 没有随包提供类型声明
import mammoth from 'mammoth/mammoth.browser'

export const MAX_ATTACHMENT_COUNT = 5
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_ATTACHMENT_TEXT_CHARS = 18_000
export const MAX_ATTACHMENT_CONTEXT_CHARS = 36_000

export interface Attachment {
  id: string
  name: string
  type: string
  size: number
  text: string
  status: 'ready' | 'error'
  error?: string
}

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

function attachmentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `att_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function fileExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

async function extractPdf(file: File): Promise<string> {
  const data = await file.arrayBuffer()
  const pdf = await getDocument({ data }).promise
  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (pageText) pages.push(`【第 ${pageNumber} 页】${pageText}`)
  }
  await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.()
  return pages.join('\n')
}

async function extractDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value.trim()
}

async function extractText(file: File): Promise<string> {
  const ext = fileExtension(file.name)
  if (ext === 'pdf' || file.type === 'application/pdf') return extractPdf(file)
  if (ext === 'docx' || file.type.includes('wordprocessingml')) return extractDocx(file)
  if (['txt', 'md', 'csv', 'json', 'html', 'xml'].includes(ext) || file.type.startsWith('text/')) {
    return (await file.text()).trim()
  }
  throw new Error('暂不支持此文件格式，请上传 PDF、Word 或文本文件')
}

export async function parseAttachment(file: File): Promise<Attachment> {
  try {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error('文件超过 10 MB 限制')
    const text = (await extractText(file)).slice(0, MAX_ATTACHMENT_TEXT_CHARS)
    if (!text.trim()) throw new Error('未能从文件中提取到文本内容')
    return {
      id: attachmentId(),
      name: file.name,
      type: file.type,
      size: file.size,
      text,
      status: 'ready',
    }
  } catch (error) {
    return {
      id: attachmentId(),
      name: file.name,
      type: file.type,
      size: file.size,
      text: '',
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/** 把附件内容压缩为可注入 LLM 上下文的证据摘要。 */
export function attachmentContext(attachments: Attachment[]): string {
  const ready = attachments.filter((attachment) => attachment.status === 'ready').slice(0, MAX_ATTACHMENT_COUNT)
  if (ready.length === 0) return ''
  let remaining = MAX_ATTACHMENT_CONTEXT_CHARS
  const chunks: string[] = []
  for (const [index, attachment] of ready.entries()) {
    if (remaining <= 0) break
    const header = `【附件 ${index + 1}：${attachment.name}】\n`
    const excerpt = attachment.text.replace(/\s+/g, ' ').trim().slice(0, Math.max(0, remaining - header.length))
    chunks.push(header + excerpt)
    remaining -= header.length + excerpt.length + 2
  }
  return chunks.join('\n\n')
}
