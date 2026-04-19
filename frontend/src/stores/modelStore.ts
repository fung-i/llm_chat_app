import { create } from 'zustand'
import type { CustomProvider, ModelOption } from '../types'
import { getSidecarBaseUrl } from '../lib/sidecarClient'
import { deleteApiKey, loadAllApiKeys, saveApiKey } from '../lib/keychain'

const CUSTOM_PROVIDERS_KEY = 'custom_providers'

interface ModelState {
  builtInProviders: ModelOption[]
  customProviders: CustomProvider[]
  providers: ModelOption[]
  apiKeys: Record<string, string>
  temperature: number
  maxTokens: number
  loadFromDisk: () => Promise<void>
  setApiKey: (provider: string, value: string) => Promise<void>
  setTemperature: (value: number) => void
  setMaxTokens: (value: number) => void
  refreshProviders: () => Promise<void>
  addCustomProvider: (entry: CustomProvider, apiKey: string) => Promise<void>
  updateCustomProvider: (
    id: string,
    entry: CustomProvider,
    apiKey: string | null,
  ) => Promise<void>
  removeCustomProvider: (id: string) => Promise<void>
  getCustomProvider: (id: string) => CustomProvider | undefined
}

function loadCustomProvidersFromStorage(): CustomProvider[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_PROVIDERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is CustomProvider => {
      if (!item || typeof item !== 'object') return false
      const row = item as Partial<CustomProvider>
      return (
        typeof row.id === 'string' &&
        typeof row.name === 'string' &&
        typeof row.provider === 'string' &&
        typeof row.apiModel === 'string' &&
        (row.adapter === 'openai' ||
          row.adapter === 'anthropic' ||
          row.adapter === 'gemini' ||
          row.adapter === 'glm') &&
        typeof row.contextWindow === 'number'
      )
    })
  } catch {
    return []
  }
}

function saveCustomProvidersToStorage(list: CustomProvider[]): void {
  try {
    window.localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(list))
  } catch {
    /* quota errors — ignore, keep in-memory copy */
  }
}

function customToOption(entry: CustomProvider): ModelOption {
  return {
    id: entry.id,
    name: entry.name,
    provider: entry.provider,
    contextWindow: entry.contextWindow,
    isCustom: true,
  }
}

function mergeProviders(
  builtIn: ModelOption[],
  custom: CustomProvider[],
): ModelOption[] {
  const seen = new Set<string>()
  const merged: ModelOption[] = []
  for (const option of builtIn) {
    if (seen.has(option.id)) continue
    seen.add(option.id)
    merged.push(option)
  }
  for (const entry of custom) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    merged.push(customToOption(entry))
  }
  return merged
}

const FALLBACK_BUILT_INS: ModelOption[] = [
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai', contextWindow: 128000 },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', contextWindow: 200000 },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', contextWindow: 1000000 },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', contextWindow: 128000 },
  { id: 'qwen-max', name: 'Qwen Max', provider: 'qwen', contextWindow: 32000 },
]

const initialCustomProviders = loadCustomProvidersFromStorage()

export const useModelStore = create<ModelState>((set, get) => ({
  builtInProviders: [],
  customProviders: initialCustomProviders,
  providers: mergeProviders([], initialCustomProviders),
  apiKeys: {},
  temperature: 0.7,
  maxTokens: 4096,

  loadFromDisk: async () => {
    const customProviderIds = get().customProviders.map((p) => p.provider)
    const keys = await loadAllApiKeys(customProviderIds)
    set({ apiKeys: keys })
  },

  setApiKey: async (provider, value) => {
    set({ apiKeys: { ...get().apiKeys, [provider]: value } })
    try {
      await saveApiKey(provider, value)
    } catch (e) {
      console.error('[keychain] Failed to persist API key for', provider, e)
    }
  },

  setTemperature: (value) => set({ temperature: value }),
  setMaxTokens: (value) => set({ maxTokens: value }),

  refreshProviders: async () => {
    try {
      const base = getSidecarBaseUrl()
      const response = await fetch(`${base}/providers`)
      const data = (await response.json()) as {
        providers: { id: string; name: string; provider: string; contextWindow: number }[]
      }
      const builtIn: ModelOption[] = (data.providers ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        provider: row.provider,
        contextWindow: row.contextWindow,
      }))
      set((state) => ({
        builtInProviders: builtIn,
        providers: mergeProviders(builtIn, state.customProviders),
      }))
    } catch {
      set((state) => ({
        builtInProviders: FALLBACK_BUILT_INS,
        providers: mergeProviders(FALLBACK_BUILT_INS, state.customProviders),
      }))
    }
  },

  addCustomProvider: async (entry, apiKey) => {
    const next = [...get().customProviders, entry]
    saveCustomProvidersToStorage(next)
    set((state) => ({
      customProviders: next,
      providers: mergeProviders(state.builtInProviders, next),
    }))
    if (apiKey) {
      await get().setApiKey(entry.provider, apiKey)
    }
  },

  updateCustomProvider: async (id, entry, apiKey) => {
    const next = get().customProviders.map((p) => (p.id === id ? entry : p))
    saveCustomProvidersToStorage(next)
    set((state) => ({
      customProviders: next,
      providers: mergeProviders(state.builtInProviders, next),
    }))
    if (apiKey !== null) {
      await get().setApiKey(entry.provider, apiKey)
    }
  },

  removeCustomProvider: async (id) => {
    const target = get().customProviders.find((p) => p.id === id)
    const next = get().customProviders.filter((p) => p.id !== id)
    saveCustomProvidersToStorage(next)
    set((state) => {
      const nextKeys = { ...state.apiKeys }
      if (target) delete nextKeys[target.provider]
      return {
        customProviders: next,
        providers: mergeProviders(state.builtInProviders, next),
        apiKeys: nextKeys,
      }
    })
    if (target) {
      try {
        await deleteApiKey(target.provider)
      } catch {
        /* ignore */
      }
    }
  },

  getCustomProvider: (id) => get().customProviders.find((p) => p.id === id),
}))
