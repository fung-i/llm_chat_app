import type { ChatMessage, CustomProvider } from '../types'
import { buildInContextMessagesForApi } from './mergeSystem'

export interface StreamChunk {
  type: 'delta' | 'done' | 'error'
  text?: string
  error?: string
}

/** Converts a CustomProvider (frontend schema) into the ProviderRow shape the sidecar expects. */
function toProviderOverride(entry: CustomProvider) {
  return {
    id: entry.id,
    name: entry.name,
    provider: entry.provider,
    adapter: entry.adapter,
    baseUrl: entry.baseUrl,
    apiModel: entry.apiModel,
    contextWindow: entry.contextWindow,
  }
}

const DEFAULT_SIDECAR_URL = 'http://127.0.0.1:8765'

export function getSidecarBaseUrl(): string {
  const stored = window.localStorage.getItem('sidecar_url')
  if (stored) return stored.replace(/\/$/, '')
  if (import.meta.env.DEV) return '/sidecar-proxy'
  return DEFAULT_SIDECAR_URL
}

/** @internal debug: call from refreshProviders only */
export function debugSidecarUrlContext(): {
  stored: string | null
  isDev: boolean
  resolved: string
} {
  const stored = window.localStorage.getItem('sidecar_url')
  const isDev = import.meta.env.DEV
  const resolved = getSidecarBaseUrl()
  // #region agent log
  fetch('http://127.0.0.1:7512/ingest/f6248b85-296f-4b29-9781-bbfe4782792f', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'e13b60' },
    body: JSON.stringify({
      sessionId: 'e13b60',
      runId: 'pre-fix',
      hypothesisId: 'H2-H3',
      location: 'sidecarClient.ts:debugSidecarUrlContext',
      message: 'sidecar URL resolution',
      data: { stored, isDev, resolved },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  return { stored, isDev, resolved }
}

export async function streamChat(params: {
  conversationId: string
  messages: ChatMessage[]
  systemSummarySlots: string[]
  modelId: string
  apiKeys: Record<string, string>
  contextStrategy: string
  contextWindow: number
  temperature: number
  maxTokens: number
  providerOverride?: CustomProvider
  onChunk: (chunk: StreamChunk) => void
}): Promise<void> {
  const merged = buildInContextMessagesForApi(params.messages, params.systemSummarySlots)
  const payload = {
    conversationId: params.conversationId,
    modelId: params.modelId,
    messages: merged.map((message) => ({
      role: message.role,
      content: message.contextContent,
    })),
    apiKeys: params.apiKeys,
    contextStrategy: params.contextStrategy,
    contextWindow: params.contextWindow,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    providerOverride: params.providerOverride ? toProviderOverride(params.providerOverride) : undefined,
  }

  const response = await fetch(`${getSidecarBaseUrl()}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.body) {
    params.onChunk({ type: 'error', error: 'Sidecar did not return a stream body.' })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      params.onChunk({ type: 'done' })
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const payloadText = line.replace(/^data:\s*/, '').trim()
      if (!payloadText || payloadText === '[DONE]') {
        params.onChunk({ type: 'done' })
        continue
      }

      try {
        const parsed = JSON.parse(payloadText) as { delta?: string; error?: string }
        if (parsed.error) {
          params.onChunk({ type: 'error', error: parsed.error })
        } else if (parsed.delta) {
          params.onChunk({ type: 'delta', text: parsed.delta })
        }
      } catch {
        params.onChunk({ type: 'delta', text: payloadText })
      }
    }
  }
}

export async function countTokensRemote(messages: Pick<ChatMessage, 'role' | 'contextContent'>[]): Promise<number> {
  const body = {
    messages: messages.map((message) => ({
      role: message.role,
      content: message.contextContent,
    })),
  }
  const response = await fetch(`${getSidecarBaseUrl()}/tokens/count`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json()) as { tokens?: number }
  return data.tokens ?? 0
}

export async function summarizeRemote(params: {
  messages: Pick<ChatMessage, 'role' | 'contextContent'>[]
  apiKeys: Record<string, string>
  modelId?: string
  providerOverride?: CustomProvider
}): Promise<string> {
  const response = await fetch(`${getSidecarBaseUrl()}/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: params.messages.map((message) => ({
        role: message.role,
        content: message.contextContent,
      })),
      apiKeys: params.apiKeys,
      modelId: params.modelId,
      providerOverride: params.providerOverride ? toProviderOverride(params.providerOverride) : undefined,
    }),
  })
  const data = (await response.json()) as { summary?: string; error?: string }
  if (data.error) throw new Error(data.error)
  return data.summary ?? ''
}

/**
 * Run a minimal ping against the given provider to verify connectivity.
 * Returns the first few characters received, or throws with the upstream error.
 */
export async function testProviderConnection(params: {
  providerOverride: CustomProvider
  apiKey: string
}): Promise<string> {
  const response = await fetch(`${getSidecarBaseUrl()}/providers/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      providerOverride: toProviderOverride(params.providerOverride),
      apiKey: params.apiKey,
    }),
  })
  const data = (await response.json()) as { ok?: boolean; error?: string; sample?: string }
  if (!data.ok) throw new Error(data.error ?? 'Provider test failed.')
  return data.sample ?? ''
}
