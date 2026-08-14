import { LLM_PRESETS, type LLMConfig, type LLMProfile, type LLMSettings } from '../engine/types'

export const LLM_STORAGE_KEY = 'ma_collab_llm_config'

export const EMPTY_LLM_SETTINGS: LLMSettings = {
  version: 2,
  active_profile_id: '',
  profiles: [],
}

function isLLMConfig(value: unknown): value is LLMConfig {
  if (!value || typeof value !== 'object') return false
  const config = value as Partial<LLMConfig>
  return Boolean(config.api_key?.trim() && config.base_url?.trim() && config.model?.trim())
}

function profileName(config: LLMConfig): string {
  return LLM_PRESETS.find((preset) => preset.base_url === config.base_url)?.name ?? config.model
}

function normalizeProfile(value: unknown, index: number): LLMProfile | null {
  if (!isLLMConfig(value)) return null
  const candidate = value as Partial<LLMProfile>
  return {
    id: candidate.id?.trim() || `profile_${index + 1}`,
    name: candidate.name?.trim() || profileName(candidate as LLMConfig),
    base_url: candidate.base_url!.trim(),
    api_key: candidate.api_key!.trim(),
    model: candidate.model!.trim(),
    ...(typeof candidate.temperature === 'number' ? { temperature: candidate.temperature } : {}),
  }
}

function parseSettings(raw: string | null): LLMSettings {
  try {
    if (!raw) return EMPTY_LLM_SETTINGS
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Partial<LLMSettings>).profiles)) {
      const settings = parsed as Partial<LLMSettings>
      const profiles = settings.profiles!.map(normalizeProfile).filter((profile): profile is LLMProfile => Boolean(profile))
      const activeId = profiles.some((profile) => profile.id === settings.active_profile_id)
        ? settings.active_profile_id!
        : profiles[0]?.id ?? ''
      return { version: 2, active_profile_id: activeId, profiles }
    }
    if (isLLMConfig(parsed)) {
      const profile = normalizeProfile({ ...parsed, id: 'legacy_default', name: profileName(parsed) }, 0)!
      return { version: 2, active_profile_id: profile.id, profiles: [profile] }
    }
  } catch {
    // 损坏或不完整的本地配置按未配置处理，不阻断页面启动。
  }
  return EMPTY_LLM_SETTINGS
}

/**
 * API Key 默认只保存在当前标签页会话。首次读取旧版 localStorage 配置时会迁移并删除旧副本，
 * 既保持升级后的当前会话可用，也避免公开页面长期明文保存密钥。
 */
export function loadLLMSettings(storage?: Pick<Storage, 'getItem'>): LLMSettings {
  if (storage) return parseSettings(storage.getItem(LLM_STORAGE_KEY))
  const session = typeof sessionStorage === 'undefined' ? null : sessionStorage
  const local = typeof localStorage === 'undefined' ? null : localStorage
  const sessionSettings = parseSettings(session?.getItem(LLM_STORAGE_KEY) ?? null)
  if (sessionSettings.profiles.length) return sessionSettings
  const legacyRaw = local?.getItem(LLM_STORAGE_KEY) ?? null
  const legacySettings = parseSettings(legacyRaw)
  if (legacySettings.profiles.length && legacyRaw) {
    session?.setItem(LLM_STORAGE_KEY, legacyRaw)
    local?.removeItem(LLM_STORAGE_KEY)
  }
  return legacySettings
}

export function saveLLMSettings(settings: LLMSettings, storage?: Pick<Storage, 'setItem'>): void {
  const target = storage ?? (typeof sessionStorage === 'undefined' ? null : sessionStorage)
  target?.setItem(LLM_STORAGE_KEY, JSON.stringify(settings))
  if (!storage && typeof localStorage !== 'undefined') localStorage.removeItem(LLM_STORAGE_KEY)
}

export function clearLLMSettings(): void {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(LLM_STORAGE_KEY)
  if (typeof localStorage !== 'undefined') localStorage.removeItem(LLM_STORAGE_KEY)
}

export function activeLLMProfile(settings: LLMSettings): LLMProfile | null {
  return settings.profiles.find((profile) => profile.id === settings.active_profile_id) ?? settings.profiles[0] ?? null
}

export function createLLMProfileId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
