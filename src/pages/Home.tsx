/**
 * MA-Collab Demo 主页面
 * 布局：未运行时 = 居中式入口；运行中 = 左侧事件流 + 右侧指标栏
 */
import { useEffect, useRef, useState } from 'react'
import { PRESETS, type Preset } from '../data/presets'
import { LLM_PRESETS, type AgentLLMConfig, type LLMConfig, type LLMProfile, type LLMSettings, type ScenarioConfig } from '../engine/types'
import { useRunEngine } from '../hooks/useRunEngine'
import { BlockView, extractConfig } from '../components/RunBlocks'
import { MetricsPanel } from '../components/Metrics'
import { Chip, Spinner } from '../components/common'
import { ComplexityBlock } from '../components/Complexity'
import { ReportPanel } from '../components/ReportPanel'
import { Paperclip, X } from 'lucide-react'
import { MAX_ATTACHMENT_COUNT, parseAttachment, type Attachment } from '../lib/attachments'
import {
  activeLLMProfile, clearLLMSettings, createLLMProfileId, EMPTY_LLM_SETTINGS, loadLLMSettings, saveLLMSettings,
} from '../lib/llm-settings'

function resolveReplayScript(input: string, preset: Preset | null, hasLiveConfig: boolean) {
  if (hasLiveConfig) return null
  const normalized = input.trim()
  if (preset && normalized === preset.input.trim()) return preset.script
  return PRESETS.find((candidate) => normalized === candidate.input.trim())?.script ?? null
}

export default function Home() {
  const { state, start, reset, analyze, clearStaged, delibMode, setDelibMode } = useRunEngine()
  const [input, setInput] = useState('')
  const [llmSettings, setLlmSettings] = useState<LLMSettings>(loadLLMSettings)
  const llmConfig = activeLLMProfile(llmSettings)
  const [showApiPanel, setShowApiPanel] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null)
  const [agentLLMConfig, setAgentLLMConfig] = useState<AgentLLMConfig | undefined>()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [showReportPanel, setShowReportPanel] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const running = state.status === 'running'
  const started = state.blocks.length > 0 && state.status !== 'idle'
  const hasReport = state.blocks.some((b) => b.kind === 'report')
  const showAgentConfig = state.stagedConfig !== null && !running && state.blocks.length > 0
  const showSingleConfirm = state.stagedProfile !== null && state.stagedProfile.task_type === 'single' && state.stagedConfig === null && !running && state.status === 'idle'
  const stagedComplexity = state.blocks.find((b) => b.kind === 'complexity' && !b.running)
  const showCompetitiveConfirm = state.stagedProfile?.task_type === 'competitive' && !running && state.status === 'idle'

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [state.blocks])

  const handleAnalyze = (text?: string, preset?: Preset | null) => {
    const finalInput = text ?? input
    if (!finalInput.trim()) return
    const p = preset ?? selectedPreset
    const script = resolveReplayScript(finalInput, p, Boolean(llmConfig))
    analyze(finalInput.trim(), { llm: llmConfig, script, forceTrack: delibMode, attachments })
  }

  const handleConfirmRun = (selectedAgentLLM?: AgentLLMConfig) => {
    const finalInput = input.trim()
    if (!finalInput) return
    const p = selectedPreset
    const script = resolveReplayScript(finalInput, p, Boolean(llmConfig))
    start(finalInput, {
      llm: llmConfig,
      agentLLM: selectedAgentLLM ?? agentLLMConfig,
      script,
      forceTrack: delibMode,
      attachments,
      prepared: {
        complexity: stagedComplexity?.kind === 'complexity' && stagedComplexity.result
          ? { result: stagedComplexity.result, tokens: 0, source: 'api' }
          : undefined,
        profile: state.stagedProfile ?? undefined,
        config: state.stagedConfig ?? undefined,
        modelInvocations: state.modelInvocations,
      },
    })
  }

  const handlePreset = (p: Preset) => {
    setSelectedPreset(p)
    setInput(p.input)
    if (!running) handleAnalyze(p.input, p)
  }

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (files.length === 0) return
    const remainingSlots = Math.max(0, MAX_ATTACHMENT_COUNT - attachments.length)
    if (remainingSlots === 0) return
    setUploading(true)
    try {
      const parsed: Attachment[] = []
      for (const file of Array.from(files).slice(0, remainingSlots)) {
        parsed.push(await parseAttachment(file))
      }
      setAttachments((prev) => [...prev, ...parsed])
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((attachment) => attachment.id !== id))
  }

  const config = extractConfig(state.blocks)

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 border-b border-neutral-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-[13px] font-bold text-white">M</span>
            <div>
              <div className="text-[14px] font-bold leading-tight">MA-Collab</div>
              <div className="text-[10.5px] leading-tight text-neutral-400">通用多智能体编排框架</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Chip tone={llmConfig ? 'green' : 'gray'}>{llmConfig ? `Live · ${llmConfig.model}` : '回放模式（未配置 Key）'}</Chip>
            <button
              onClick={() => setShowApiPanel(true)}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12.5px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              {llmConfig ? 'API 配置' : '填入 API Key'}
            </button>
            {hasReport && started && !running && (
              <button
                onClick={() => setShowReportPanel(true)}
                className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-neutral-700"
              >
                议事报告
              </button>
            )}
            {started && (
              <button
                onClick={() => { reset(); setSelectedPreset(null) }}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-neutral-700"
              >
                重新开始
              </button>
            )}
          </div>
        </div>
      </header>

      {!started ? (
        /* ====== 入口页 ====== */
        <main className="mx-auto max-w-3xl px-5 pb-24 pt-16 sm:pt-24">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1 text-[12px] text-neutral-500">
              <span className="h-1.5 w-1.5 rounded-full bg-neutral-900" />
              一句话入口 · 三轨道路由 · 20 项基础策略
            </div>
            <h1 className="mt-6 text-[34px] font-bold leading-tight tracking-tight sm:text-[44px]">
              一套框架，
              <br />
              议事与博弈通用
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[14.5px] leading-relaxed text-neutral-500">
              输入任何一句话：简单任务单 Agent 直接回答；多方争议编译成两阶段鱼缸议事并形成可追踪报告；
              博弈游戏加载扩展复用同一套策略。不为任何场景手写代码。
            </p>
          </div>

          {/* 议事模式选择器 */}
          {llmConfig && (
            <div className="mt-6 flex flex-col items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-widest text-neutral-400">议事模式</span>
              <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
                {([
                  { key: 'auto' as const, label: 'Auto · 智能识别' },
                  { key: 'single' as const, label: '单 Agent' },
                  { key: 'multi' as const, label: '多 Agent' },
                ]).map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setDelibMode(m.key)}
                    className={`rounded-md px-4 py-1.5 text-[12.5px] font-medium transition-all ${
                      delibMode === m.key
                        ? 'bg-white text-neutral-900 shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-neutral-400">
                {delibMode === 'auto' ? 'Dispatcher 自动判别任务类型' : delibMode === 'single' ? '强制使用单 Agent 直接回答' : '强制启动多 Agent 协作议事'}
              </span>
            </div>
          )}

          {/* 输入框 */}
          <div className="mt-10 rounded-2xl border border-neutral-300 bg-white shadow-sm transition-shadow focus-within:shadow-md">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                if (selectedPreset && e.target.value.trim() !== selectedPreset.input.trim()) setSelectedPreset(null)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAnalyze() } }}
              placeholder="例如：老旧小区加装电梯，各方谈不拢怎么办？/ 来一局狼人杀 / 帮我写一封通知…"
              rows={3}
              className="w-full resize-none rounded-2xl bg-transparent px-5 pt-4 text-[15px] leading-relaxed outline-none placeholder:text-neutral-400"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.html,.xml"
                  className="hidden"
                  onChange={(e) => { if (e.target.files) void handleUploadFiles(e.target.files) }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-[12.5px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {uploading ? '解析中…' : `上传附件（最多 ${MAX_ATTACHMENT_COUNT} 个）`}
                </button>
                <span className="truncate text-[12px] text-neutral-400">
                  {llmConfig ? `将使用 ${llmConfig.model} 实时编排` : '未配置 Key · 预设回放 / 内置博弈离线运行'}
                </span>
              </div>
              <button
                onClick={() => handleAnalyze()}
                disabled={!input.trim()}
                className="shrink-0 rounded-xl bg-neutral-900 px-5 py-2 text-[13.5px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-200"
              >
                开始
              </button>
            </div>
            {attachments.length > 0 && (
              <div className="border-t border-neutral-100 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {attachments.map((attachment) => (
                    <span
                      key={attachment.id}
                      className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] ${attachment.status === 'error' ? 'border-red-200 bg-red-50 text-red-600' : 'border-neutral-200 bg-neutral-50 text-neutral-700'}`}
                      title={attachment.status === 'error' ? attachment.error : `${attachment.name}（已提取文本，将作为议事证据）`}
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-[220px] truncate">{attachment.name}</span>
                      <button
                        onClick={() => removeAttachment(attachment.id)}
                        className="text-neutral-400 transition-colors hover:text-neutral-700"
                        aria-label="移除附件"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 分析阶段即可展示复杂度，确认运行后事件流中会再次记录 */}
          {stagedComplexity?.kind === 'complexity' && (
            <div className="mt-5 text-left">
              <ComplexityBlock
                running={false}
                result={stagedComplexity.result}
                tokens={stagedComplexity.tokens}
                source={stagedComplexity.source}
              />
            </div>
          )}

          {/* 单 Agent 轨道：分析完成，直接启动提示 */}
          {showSingleConfirm && (
            <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-center">
              <p className="text-[13px] text-neutral-700">
                分析完成：此任务判定为<strong>单 Agent 轨道</strong>，无需多 Agent 协作，直接启动即可。
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <button
                  onClick={() => clearStaged()}
                  className="rounded-lg border border-neutral-200 px-4 py-1.5 text-[12.5px] font-medium text-neutral-600 hover:bg-neutral-100"
                >
                  取消
                </button>
                <button
                  onClick={() => handleConfirmRun()}
                  className="rounded-lg bg-neutral-900 px-5 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700"
                >
                  启动
                </button>
              </div>
            </div>
          )}

          {/* 博弈轨道：无需 Agent Pool 编译，确认后加载扩展 */}
          {showCompetitiveConfirm && (
            <div className="mt-5 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-center">
              <p className="text-[13px] text-neutral-700">
                分析完成：识别为 <strong>{state.stagedProfile?.agent_count} 人 · {state.stagedProfile?.game_type}</strong>，确认后加载对应 GameSpec。
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <button onClick={() => clearStaged()} className="rounded-lg border border-neutral-200 px-4 py-1.5 text-[12.5px] font-medium text-neutral-600 hover:bg-neutral-100">取消</button>
                <button onClick={() => handleConfirmRun()} className="rounded-lg bg-neutral-900 px-5 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700">启动博弈</button>
              </div>
            </div>
          )}

          {/* Agent 配置面板（分析完成后显示） */}
          {showAgentConfig && state.stagedConfig && (
            <AgentConfigPanel
              config={state.stagedConfig}
              profiles={llmSettings.profiles}
              activeProfileId={llmSettings.active_profile_id}
              onConfirm={(nextConfig) => { setAgentLLMConfig(nextConfig); handleConfirmRun(nextConfig) }}
              onCancel={() => clearStaged()}
            />
          )}

          {/* 预设场景 */}
          <div className="mt-8">
            <div className="mb-3 text-center text-[12px] font-medium uppercase tracking-widest text-neutral-400">预设演示场景 · 覆盖三条轨道</div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePreset(p)}
                  className="group rounded-xl border border-neutral-200 bg-white p-4 text-left transition-all hover:border-neutral-900 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold text-neutral-900">{p.label}</span>
                    <Chip tone={p.track_hint === 'collaborative' ? 'black' : 'gray'}>
                      {p.track_hint === 'collaborative' ? '协作' : p.track_hint === 'competitive' ? '博弈' : '单 Agent'}
                    </Chip>
                  </div>
                  <div className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-neutral-500">{p.input}</div>
                  <div className="mt-2 text-[11.5px] text-neutral-400">{p.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 框架说明 */}
          <div className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { t: '该不该协作有评分', d: 'Dispatcher 一次调用判断 agent_count 与 task_type，不是所有问题都启动多智能体' },
              { t: '怎么协作有配方', d: '30 格决策表查得 A/B/C/D/E 策略组合，确定性规则 0 tokens' },
              { t: '结论边界有记录', d: '保留证据缺口、少数意见、修订路径和真实授权边界' },
            ].map((f) => (
              <div key={f.t} className="rounded-xl border border-neutral-100 bg-neutral-50 p-4">
                <div className="text-[13.5px] font-bold text-neutral-900">{f.t}</div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">{f.d}</div>
              </div>
            ))}
          </div>

          <footer className="mt-14 text-center text-[11.5px] leading-relaxed text-neutral-400">
            Live 模式下 API Key 仅保存在当前浏览器标签会话，只发往你选择的 LLM 服务商，不经过本项目服务器。
            <br />AI 议事结果仅用于辅助分析，不替代真实公共决策与实地调研。
          </footer>
        </main>
      ) : (
        /* ====== 运行视图 ====== */
        <main className="mx-auto max-w-6xl px-5 py-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
            <div ref={scrollRef} className="space-y-5">
              {/* 议事报告锚点 */}
              <div ref={reportRef} id="report-anchor" className="h-0" />
              {(() => {
                let lastInner: string[] | undefined
                let phaseIndex = 0
                return state.blocks.map((b, i) => {
                  if (b.kind === 'phase' && b.phase.id === 'exam') return null
                  let prevInner: string[] | undefined
                  if (b.kind === 'phase') {
                    phaseIndex += 1
                    const plan = b.phase.items.find((it) => it.data.t === 'fishbowl_plan')
                    if (plan && plan.data.t === 'fishbowl_plan') {
                      prevInner = lastInner
                      lastInner = plan.data.inner
                    }
                  }
                  return <BlockView key={i} block={b} config={config} phaseIndex={phaseIndex} prevInner={prevInner} />
                })
              })()}
              {running && (
                <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-5 py-4 text-[13px] text-neutral-500">
                  <Spinner /> 引擎运行中，事件流实时渲染…
                </div>
              )}
              {state.status === 'done' && (
                <div className="rounded-xl border border-neutral-900 bg-neutral-900 px-5 py-4 text-center text-white">
                  <div className="text-[15px] font-bold">运行完成 · {state.terminalState ?? 'PROVISIONAL'}</div>
                  <div className="mt-1 text-[12.5px] text-neutral-400">
                    共 {state.ledger.calls} 次 LLM 调用 · {state.ledger.total_tokens.toLocaleString()} tokens
                  </div>
                  {hasReport && (
                    <button
                      onClick={() => setShowReportPanel(true)}
                      className="mt-3 mr-3 rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-1.5 text-[12.5px] font-medium text-white hover:bg-neutral-700"
                    >
                      议事报告
                    </button>
                  )}
                  <button onClick={() => { reset(); setSelectedPreset(null) }} className="mt-3 rounded-lg bg-white px-4 py-1.5 text-[12.5px] font-medium text-neutral-900 hover:bg-neutral-100">
                    再来一场
                  </button>
                </div>
              )}
            </div>
            {/* 右侧指标栏 */}
            <aside className="lg:sticky lg:top-[68px] lg:self-start">
              <MetricsPanel metrics={state.metrics} ledger={state.ledger} terminalState={state.terminalState} terminalReport={state.terminalReport} eventEvaluations={state.eventEvaluations} modelInvocations={state.modelInvocations} runTrace={state.runTrace} />
            </aside>
          </div>
        </main>
      )}

      {/* API 配置面板 */}
      {showApiPanel && (
        <ApiPanel
          settings={llmSettings}
          onSave={(settings) => { saveLLMSettings(settings); setLlmSettings(settings); setShowApiPanel(false) }}
          onClear={() => { clearLLMSettings(); setLlmSettings(EMPTY_LLM_SETTINGS); setShowApiPanel(false) }}
          onClose={() => setShowApiPanel(false)}
        />
      )}

      {/* 议事报告导出面板 */}
      {showReportPanel && (
        <ReportPanel state={state} onClose={() => setShowReportPanel(false)} />
      )}
    </div>
  )
}

function AgentConfigPanel({
  config,
  profiles,
  activeProfileId,
  onConfirm,
  onCancel,
}: {
  config: ScenarioConfig
  profiles: LLMProfile[]
  activeProfileId: string
  onConfirm: (config: AgentLLMConfig | undefined) => void
  onCancel: () => void
}) {
  const [mode, setMode] = useState<'shared' | 'per_agent'>('shared')
  const defaultProfileId = profiles.some((profile) => profile.id === activeProfileId) ? activeProfileId : profiles[0]?.id ?? ''
  const defaultProfile = profiles.find((profile) => profile.id === defaultProfileId) ?? profiles[0]
  const defaultAgentConfig: LLMConfig = {
    base_url: defaultProfile?.base_url ?? LLM_PRESETS[0].base_url,
    api_key: defaultProfile?.api_key ?? '',
    model: defaultProfile?.model ?? LLM_PRESETS[0].model,
  }
  const [perAgentConfigs, setPerAgentConfigs] = useState<Record<string, LLMConfig>>(() =>
    Object.fromEntries(config.agents.map((agent) => [agent.id, { ...defaultAgentConfig }])),
  )
  const [sharedProfileId, setSharedProfileId] = useState(defaultProfileId)
  const profileForId = (profileId: string) => profiles.find((profile) => profile.id === profileId)
  const profileForBaseUrl = (baseUrl: string) => profiles.find((profile) => profile.base_url.trim().toLowerCase() === baseUrl.trim().toLowerCase())
  const hasProfiles = profiles.length > 0

  const updateAgentConfig = (agentId: string, patch: Partial<LLMConfig>) => {
    setPerAgentConfigs((current) => ({
      ...current,
      [agentId]: { ...current[agentId], ...patch },
    }))
  }

  const applyPresetToAgent = (agentId: string, preset: (typeof LLM_PRESETS)[number]) => {
    const saved = profileForBaseUrl(preset.base_url)
    updateAgentConfig(agentId, {
      base_url: preset.base_url,
      model: preset.model,
      api_key: saved?.api_key ?? '',
    })
  }

  const allPerAgentComplete = config.agents.every((agent) => {
    const candidate = perAgentConfigs[agent.id]
    return Boolean(candidate?.base_url.trim() && candidate.api_key.trim() && candidate.model.trim())
  })

  const confirm = () => {
    const shared = profileForId(sharedProfileId) ?? profiles[0]
    if (mode === 'shared') {
      if (!shared) return onConfirm(undefined)
      return onConfirm({ mode, shared })
    }
    if (!allPerAgentComplete) return
    const perAgent = Object.fromEntries(config.agents.map((agent) => [
      agent.id,
      {
        base_url: perAgentConfigs[agent.id].base_url.trim(),
        api_key: perAgentConfigs[agent.id].api_key.trim(),
        model: perAgentConfigs[agent.id].model.trim(),
      },
    ]))
    onConfirm({ mode, shared, per_agent: perAgent })
  }

  return (
    <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-neutral-900">Agent 角色分配 · 模型配置</h3>
        <button onClick={onCancel} className="text-[12.5px] text-neutral-400 hover:text-neutral-600">取消</button>
      </div>
      <p className="mt-1 text-[12.5px] text-neutral-500">
        {`Dispatcher 已分析出 ${config.agents.length} 个 Agent 角色。可选择统一模型，或为每个 Agent 分别选择主流模型并填写对应 API Key。`}
      </p>

      {/* 模型模式切换 */}
      {<div className="mt-4 flex items-center gap-2">
        <span className="text-[12px] font-medium text-neutral-600">模型分配：</span>
        <div className="inline-flex rounded-md border border-neutral-200 bg-neutral-50 p-0.5">
          <button
            onClick={() => setMode('shared')}
            className={`rounded px-3 py-1 text-[12px] font-medium transition-all ${mode === 'shared' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
          >
            统一模型
          </button>
          <button
            onClick={() => setMode('per_agent')}
            className={`rounded px-3 py-1 text-[12px] font-medium transition-all ${mode === 'per_agent' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}
          >
            分别指定
          </button>
        </div>
      </div>}

      {/* Agent 卡片 */}
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {config.agents.map((a) => (
          <div key={a.id} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
                {a.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-neutral-900 truncate">{a.name}</div>
                <div className="text-[11px] text-neutral-400 truncate">{a.archetype} · {a.stance}</div>
              </div>
            </div>
            {mode === 'per_agent' && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {LLM_PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => applyPresetToAgent(a.id, preset)}
                      className={`rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors ${
                        perAgentConfigs[a.id]?.base_url === preset.base_url
                          ? 'border-neutral-900 bg-neutral-900 text-white'
                          : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-900'
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  <label className="text-[10.5px] font-medium text-neutral-500">Base URL</label>
                  <input
                    value={perAgentConfigs[a.id]?.base_url ?? ''}
                    onChange={(e) => {
                      const nextBaseUrl = e.target.value
                      const saved = profileForBaseUrl(nextBaseUrl)
                      updateAgentConfig(a.id, {
                        base_url: nextBaseUrl,
                        api_key: saved?.api_key ?? '',
                        model: saved?.model ?? perAgentConfigs[a.id]?.model ?? '',
                      })
                    }}
                    className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-neutral-800 outline-none focus:border-neutral-900"
                  />
                  {profileForBaseUrl(perAgentConfigs[a.id]?.base_url ?? '') && (
                    <span className="text-[10.5px] text-neutral-500">
                      已自动带入「{profileForBaseUrl(perAgentConfigs[a.id]?.base_url ?? '')?.name}」的 API Key
                    </span>
                  )}
                  <label className="text-[10.5px] font-medium text-neutral-500">API Key</label>
                  <input
                    value={perAgentConfigs[a.id]?.api_key ?? ''}
                    onChange={(e) => updateAgentConfig(a.id, { api_key: e.target.value })}
                    type="password"
                    placeholder="sk-…"
                    className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-neutral-800 outline-none focus:border-neutral-900"
                  />
                  <label className="text-[10.5px] font-medium text-neutral-500">模型名</label>
                  <input
                    value={perAgentConfigs[a.id]?.model ?? ''}
                    onChange={(e) => updateAgentConfig(a.id, { model: e.target.value })}
                    className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-neutral-800 outline-none focus:border-neutral-900"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {hasProfiles && mode === 'shared' && (
        <div className="mt-3">
          <label className="mb-1 block text-[12px] font-medium text-neutral-600">统一基座模型</label>
          <select
            value={sharedProfileId}
            onChange={(e) => setSharedProfileId(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-900"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name} · {profile.model}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="text-[11px] text-neutral-400">
          {mode === 'shared'
            ? hasProfiles ? '所有 Agent 使用统一配置' : '请先在上方 API 配置中添加统一模型'
            : allPerAgentComplete
              ? `${config.agents.length} 个 Agent 已分别配置独立模型与 Key`
              : '请为每个 Agent 填写 API Key 和模型名'}
        </span>
        <button
          onClick={confirm}
          disabled={(mode === 'shared' && !hasProfiles) || (mode === 'per_agent' && !allPerAgentComplete)}
          className="rounded-lg bg-neutral-900 px-5 py-2 text-[13px] font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-200"
        >
          确认并启动议事
        </button>
      </div>
    </div>
  )
}

function ApiPanel({ settings, onSave, onClear, onClose }: { settings: LLMSettings; onSave: (settings: LLMSettings) => void; onClear: () => void; onClose: () => void }) {
  const initialProfile = (): LLMProfile => ({
    id: createLLMProfileId(),
    name: LLM_PRESETS[0].name,
    base_url: LLM_PRESETS[0].base_url,
    api_key: '',
    model: LLM_PRESETS[0].model,
  })
  const [profiles, setProfiles] = useState<LLMProfile[]>(() => settings.profiles.length ? settings.profiles : [initialProfile()])
  const [selectedProfileId, setSelectedProfileId] = useState(() => settings.active_profile_id || profiles[0].id)
  const [activeProfileId, setActiveProfileId] = useState(() => settings.active_profile_id || profiles[0].id)
  const selected = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0]
  const allComplete = profiles.length > 0 && profiles.every((profile) => profile.name.trim() && profile.base_url.trim() && profile.api_key.trim() && profile.model.trim())

  const updateSelected = (patch: Partial<LLMProfile>) => {
    setProfiles((current) => current.map((profile) => profile.id === selected.id ? { ...profile, ...patch } : profile))
  }

  const addProfile = () => {
    const profile = initialProfile()
    setProfiles((current) => [...current, profile])
    setSelectedProfileId(profile.id)
  }

  const removeSelected = () => {
    const remaining = profiles.filter((profile) => profile.id !== selected.id)
    const nextProfiles = remaining.length ? remaining : [initialProfile()]
    const nextSelectedId = nextProfiles[0].id
    setProfiles(nextProfiles)
    setSelectedProfileId(nextSelectedId)
    if (activeProfileId === selected.id) setActiveProfileId(nextSelectedId)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-bold">LLM API 配置</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900">✕</button>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-neutral-500">
          每套基座模型独立保存 Base URL、API Key 和模型名。Agent 分配时会使用整套配置，不再共用同一个 Key。
        </p>
        <div className="mt-4 flex items-center gap-2">
          <select
            value={selected.id}
            onChange={(event) => setSelectedProfileId(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[12.5px] outline-none focus:border-neutral-900"
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name || '未命名配置'} · {profile.model || '未填写模型'}{profile.id === activeProfileId ? '（默认）' : ''}</option>
            ))}
          </select>
          <button onClick={addProfile} className="rounded-lg border border-neutral-200 px-3 py-2 text-[12px] font-medium text-neutral-600 hover:border-neutral-900">新增</button>
          <button onClick={removeSelected} className="rounded-lg border border-neutral-200 px-3 py-2 text-[12px] text-neutral-400 hover:border-red-300 hover:text-red-600">删除</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {LLM_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => updateSelected({ name: p.name, base_url: p.base_url, model: p.model, api_key: selected.base_url === p.base_url ? selected.api_key : '' })}
              className="rounded-md border border-neutral-200 px-2.5 py-1 text-[12px] font-medium text-neutral-600 hover:border-neutral-900 hover:text-neutral-900"
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-neutral-600">配置名称</label>
            <input value={selected.name} onChange={(e) => updateSelected({ name: e.target.value })} placeholder="例如：DeepSeek 主账号" className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[12.5px] outline-none focus:border-neutral-900" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-neutral-600">Base URL</label>
            <input value={selected.base_url} onChange={(e) => updateSelected({ base_url: e.target.value })} className="w-full rounded-lg border border-neutral-200 px-3 py-2 font-mono text-[12.5px] outline-none focus:border-neutral-900" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-neutral-600">API Key</label>
            <input value={selected.api_key} onChange={(e) => updateSelected({ api_key: e.target.value })} type="password" placeholder="sk-…" className="w-full rounded-lg border border-neutral-200 px-3 py-2 font-mono text-[12.5px] outline-none focus:border-neutral-900" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-neutral-600">模型</label>
            <input value={selected.model} onChange={(e) => updateSelected({ model: e.target.value })} className="w-full rounded-lg border border-neutral-200 px-3 py-2 font-mono text-[12.5px] outline-none focus:border-neutral-900" />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between">
          <button onClick={onClear} className="text-[12.5px] text-neutral-400 hover:text-red-600">清除已存配置</button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveProfileId(selected.id)}
              className={`rounded-lg border px-3 py-2 text-[12px] font-medium ${selected.id === activeProfileId ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:border-neutral-900'}`}
            >
              {selected.id === activeProfileId ? '当前默认' : '设为默认'}
            </button>
            <button
              onClick={() => {
                if (!allComplete) return
                onSave({
                  version: 2,
                  active_profile_id: profiles.some((profile) => profile.id === activeProfileId) ? activeProfileId : profiles[0].id,
                  profiles: profiles.map((profile) => ({ ...profile, name: profile.name.trim(), base_url: profile.base_url.trim(), api_key: profile.api_key.trim(), model: profile.model.trim() })),
                })
              }}
              disabled={!allComplete}
              className="rounded-lg bg-neutral-900 px-5 py-2 text-[13px] font-medium text-white hover:bg-neutral-700 disabled:bg-neutral-200"
            >
              保存全部配置
            </button>
          </div>
        </div>
        <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-[11.5px] leading-relaxed text-neutral-500">
          共 {profiles.length} 套独立配置。Key 仅保存在当前标签页会话，关闭标签页后需要重新填写，并且只会发送到该配置对应的 Base URL。
          浏览器直连要求服务商允许跨域调用。DeepSeek、Moonshot 通常支持。
          注意 Moonshot 国内站（platform.moonshot.cn）与国际站（platform.moonshot.ai）的 API Key 不通用，
          需与 Base URL 一一对应，否则返回 401。
        </p>
      </div>
    </div>
  )
}
