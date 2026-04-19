import { create } from 'zustand'
import type { ModelOption } from '../types'
import { debugSidecarUrlContext, getSidecarBaseUrl } from '../lib/sidecarClient'
import { loadAllApiKeys, saveApiKey } from '../lib/keychain'

interface ModelState {
  providers: ModelOption[]
  apiKeys: Record<string, string>
  temperature: number
  maxTokens: number
  loadFromDisk: () => Promise<void>
  setApiKey: (provider: string, value: string) => Promise<void>
  setTemperature: (value: number) => void
  setMaxTokens: (value: number) => void
  refreshProviders: () => Promise<void>
}

export const useModelStore = create<ModelState>((set, get) => ({
  providers: [],
  apiKeys: {},
  temperature: 0.7,
  maxTokens: 4096,

  loadFromDisk: async () => {
    const keys = await loadAllApiKeys()
    set({ apiKeys: keys })
  },

  setApiKey: async (provider, value) => {
    // Update in-memory state immediately so the key is usable even if persistence fails.
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
      debugSidecarUrlContext()
      const base = getSidecarBaseUrl()
      const url = `${base}/providers`
      // #region agent log
      fetch('http://127.0.0.1:7512/ingest/f6248b85-296f-4b29-9781-bbfe4782792f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e13b60' },
        body: JSON.stringify({
          sessionId: 'e13b60',
          runId: 'pre-fix',
          hypothesisId: 'H1-H4',
          location: 'modelStore.ts:refreshProviders:beforeFetch',
          message: 'fetch /providers starting',
          data: { url },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      const response = await fetch(url)
      // #region agent log
      fetch('http://127.0.0.1:7512/ingest/f6248b85-296f-4b29-9781-bbfe4782792f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e13b60' },
        body: JSON.stringify({
          sessionId: 'e13b60',
          runId: 'pre-fix',
          hypothesisId: 'H1-H2',
          location: 'modelStore.ts:refreshProviders:afterFetch',
          message: 'fetch /providers response meta',
          data: { ok: response.ok, status: response.status },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      const data = (await response.json()) as {
        providers: { id: string; name: string; provider: string; contextWindow: number }[]
      }
      const mapped: ModelOption[] = (data.providers ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        provider: row.provider,
        contextWindow: row.contextWindow,
      }))
      // #region agent log
      fetch('http://127.0.0.1:7512/ingest/f6248b85-296f-4b29-9781-bbfe4782792f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e13b60' },
        body: JSON.stringify({
          sessionId: 'e13b60',
          runId: 'pre-fix',
          hypothesisId: 'H1-H5',
          location: 'modelStore.ts:refreshProviders:success',
          message: 'providers mapped',
          data: { rawProvidersLen: (data.providers ?? []).length, mappedLen: mapped.length },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      set({ providers: mapped })
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7512/ingest/f6248b85-296f-4b29-9781-bbfe4782792f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e13b60' },
        body: JSON.stringify({
          sessionId: 'e13b60',
          runId: 'pre-fix',
          hypothesisId: 'H1-H4',
          location: 'modelStore.ts:refreshProviders:catch',
          message: 'refreshProviders failed, using fallback',
          data: {
            errorName: e instanceof Error ? e.name : 'unknown',
            errorMessage: e instanceof Error ? e.message : String(e),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      set({
        providers: [
          { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'openai', contextWindow: 128000 },
          { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', provider: 'anthropic', contextWindow: 200000 },
          { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', contextWindow: 1000000 },
          { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', contextWindow: 128000 },
          { id: 'qwen-max', name: 'Qwen Max', provider: 'qwen', contextWindow: 32000 },
        ],
      })
    }
  },
}))
