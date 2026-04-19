import { Hono } from 'hono'
import { streamAnthropic } from '../adapters/anthropic'
import { streamGemini } from '../adapters/gemini'
import { streamGlm } from '../adapters/glm'
import { streamOpenAICompatible } from '../adapters/openaiCompatible'
import { getProvider, listProviders, resolveApiKey } from '../adapters/registry'
import { applyContextStrategy } from '../services/contextManager'
import { countMessagesTokens } from '../services/tokenCounter'
import type { ChatMessageDto, ProviderRow, StreamRequestBody } from '../types'

async function collectStreamText(iterator: AsyncGenerator<string>): Promise<string> {
  let out = ''
  for await (const chunk of iterator) {
    out += chunk
  }
  return out
}

function sse(controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) {
  const line = typeof payload === 'string' ? payload : JSON.stringify(payload)
  controller.enqueue(new TextEncoder().encode(`data: ${line}\n\n`))
}

const VALID_ADAPTERS: ProviderRow['adapter'][] = ['openai', 'anthropic', 'gemini', 'glm']

/**
 * Validate a provider override payload and return a sanitized ProviderRow,
 * or an error message describing what is missing. Safer than trusting the
 * client blindly, especially for required `baseUrl` fields.
 */
function normalizeProviderOverride(
  input: unknown,
): { row: ProviderRow } | { error: string } {
  if (!input || typeof input !== 'object') return { error: 'providerOverride must be an object.' }
  const candidate = input as Partial<ProviderRow>
  if (!candidate.id || typeof candidate.id !== 'string') return { error: 'providerOverride.id is required.' }
  if (!candidate.name || typeof candidate.name !== 'string') return { error: 'providerOverride.name is required.' }
  if (!candidate.provider || typeof candidate.provider !== 'string') {
    return { error: 'providerOverride.provider is required.' }
  }
  if (!candidate.adapter || !VALID_ADAPTERS.includes(candidate.adapter)) {
    return { error: 'providerOverride.adapter must be one of openai | anthropic | gemini | glm.' }
  }
  if ((candidate.adapter === 'openai' || candidate.adapter === 'glm') && !candidate.baseUrl) {
    return { error: 'providerOverride.baseUrl is required for openai/glm adapters.' }
  }
  const ctx = typeof candidate.contextWindow === 'number' && candidate.contextWindow > 0
    ? candidate.contextWindow
    : 32000
  return {
    row: {
      id: candidate.id,
      name: candidate.name,
      provider: candidate.provider,
      adapter: candidate.adapter,
      baseUrl: candidate.baseUrl,
      apiModel: candidate.apiModel,
      contextWindow: ctx,
    },
  }
}

function resolveRow(
  body: { modelId?: string; providerOverride?: unknown },
): { row: ProviderRow } | { error: string; status: 400 } {
  if (body.providerOverride) {
    const result = normalizeProviderOverride(body.providerOverride)
    if ('error' in result) return { error: result.error, status: 400 }
    return { row: result.row }
  }
  if (!body.modelId) return { error: 'modelId is required.', status: 400 }
  const row = getProvider(body.modelId)
  if (!row) return { error: `Unknown modelId: ${body.modelId}`, status: 400 }
  return { row }
}

function runAdapter(
  row: ProviderRow,
  apiKey: string,
  apiModel: string,
  prepared: ChatMessageDto[],
  opts: { temperature?: number; maxTokens?: number },
): AsyncGenerator<string> {
  if (row.adapter === 'openai') {
    return streamOpenAICompatible(row.baseUrl!, apiKey, apiModel, prepared, opts)
  }
  if (row.adapter === 'anthropic') {
    return streamAnthropic(apiKey, apiModel, prepared, opts)
  }
  if (row.adapter === 'gemini') {
    return streamGemini(apiKey, apiModel, prepared, opts)
  }
  return streamGlm(row.baseUrl!, apiKey, apiModel, prepared, opts)
}

export const chatApp = new Hono()

chatApp.get('/health', (c) => c.json({ ok: true }))

chatApp.get('/providers', (c) => c.json({ providers: listProviders() }))

chatApp.post('/tokens/count', async (c) => {
  const body = await c.req.json<{ messages: ChatMessageDto[] }>()
  const tokens = countMessagesTokens(body.messages ?? [])
  return c.json({ tokens })
})

chatApp.post('/summarize', async (c) => {
  const body = await c.req.json<{
    messages: ChatMessageDto[]
    apiKeys?: Record<string, string>
    modelId?: string
    providerOverride?: ProviderRow
  }>()
  const resolved = resolveRow(body)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status)
  const row = resolved.row

  const apiKey = resolveApiKey(row.provider, body.apiKeys)
  if (!apiKey) {
    return c.json({ error: `Missing API key for provider "${row.provider}" (summarization).` }, 401)
  }

  const conversationText = body.messages
    .map((message) => `[${message.role}] ${message.content}`)
    .join('\n\n')
  const prepared: ChatMessageDto[] = [
    {
      role: 'system',
      content:
        'Summarize the following conversation for use as LLM context. Be concise, preserve key facts.',
    },
    { role: 'user', content: conversationText },
  ]
  const apiModel = row.apiModel ?? row.id
  const opts = { temperature: 0.3, maxTokens: 1024 }

  try {
    const iterator = runAdapter(row, apiKey, apiModel, prepared, opts)
    const summary = await collectStreamText(iterator)
    return c.json({ summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ error: message }, 502)
  }
})

/**
 * Ping a provider with a minimal prompt to verify that the supplied
 * credentials and base URL reach the upstream endpoint. Returns the first
 * few tokens received on success.
 */
chatApp.post('/providers/test', async (c) => {
  const body = await c.req.json<{
    providerOverride?: ProviderRow
    modelId?: string
    apiKey?: string
  }>()
  const resolved = resolveRow(body)
  if ('error' in resolved) return c.json({ ok: false, error: resolved.error }, resolved.status)
  const row = resolved.row

  const apiKey = body.apiKey?.trim() ?? ''
  if (!apiKey) return c.json({ ok: false, error: 'apiKey is required for test.' }, 400)

  const apiModel = row.apiModel ?? row.id
  const prepared: ChatMessageDto[] = [
    { role: 'user', content: 'Reply with the single word: pong.' },
  ]

  try {
    const iterator = runAdapter(row, apiKey, apiModel, prepared, {
      temperature: 0,
      maxTokens: 16,
    })
    let received = ''
    for await (const chunk of iterator) {
      received += chunk
      if (received.length >= 32) break
    }
    return c.json({ ok: true, sample: received.trim() })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ ok: false, error: message }, 502)
  }
})

chatApp.post('/chat/stream', async (c) => {
  const body = await c.req.json<StreamRequestBody>()
  const resolved = resolveRow(body)
  if ('error' in resolved) return c.json({ error: resolved.error }, resolved.status)
  const row = resolved.row

  const apiKey = resolveApiKey(row.provider, body.apiKeys)
  if (!apiKey) {
    return c.json({ error: `Missing API key for provider "${row.provider}".` }, 401)
  }

  const window = body.contextWindow ?? row.contextWindow
  const strategy = body.contextStrategy ?? 'manual'
  const prepared = applyContextStrategy(body.messages ?? [], strategy, window)
  const apiModel = row.apiModel ?? row.id

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const opts = { temperature: body.temperature, maxTokens: body.maxTokens }
        const iterator = runAdapter(row, apiKey, apiModel, prepared, opts)

        for await (const delta of iterator) {
          sse(controller, { delta })
        }
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        sse(controller, { error: message })
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
})
