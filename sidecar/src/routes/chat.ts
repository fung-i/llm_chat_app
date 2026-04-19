import { Hono } from 'hono'
import { streamAnthropic } from '../adapters/anthropic'
import { streamGemini } from '../adapters/gemini'
import { streamGlm } from '../adapters/glm'
import { streamOpenAICompatible } from '../adapters/openaiCompatible'
import { getProvider, listProviders, resolveApiKey } from '../adapters/registry'
import { applyContextStrategy } from '../services/contextManager'
import { countMessagesTokens } from '../services/tokenCounter'
import type { ChatMessageDto, StreamRequestBody } from '../types'

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
  }>()
  const modelId = body.modelId
  if (!modelId) {
    return c.json({ error: 'modelId is required for summarization.' }, 400)
  }
  const row = getProvider(modelId)
  if (!row) {
    return c.json({ error: `Unknown modelId: ${modelId}` }, 400)
  }
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
    let iterator: AsyncGenerator<string>
    if (row.adapter === 'openai') {
      iterator = streamOpenAICompatible(row.baseUrl!, apiKey, apiModel, prepared, opts)
    } else if (row.adapter === 'anthropic') {
      iterator = streamAnthropic(apiKey, apiModel, prepared, opts)
    } else if (row.adapter === 'gemini') {
      iterator = streamGemini(apiKey, apiModel, prepared, opts)
    } else {
      iterator = streamGlm(row.baseUrl!, apiKey, apiModel, prepared, opts)
    }
    const summary = await collectStreamText(iterator)
    return c.json({ summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return c.json({ error: message }, 502)
  }
})

chatApp.post('/chat/stream', async (c) => {
  const body = await c.req.json<StreamRequestBody>()
  const row = getProvider(body.modelId)
  if (!row) {
    return c.json({ error: `Unknown modelId: ${body.modelId}` }, 400)
  }

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
        let iterator: AsyncGenerator<string>
        if (row.adapter === 'openai') {
          iterator = streamOpenAICompatible(row.baseUrl!, apiKey, apiModel, prepared, opts)
        } else if (row.adapter === 'anthropic') {
          iterator = streamAnthropic(apiKey, apiModel, prepared, opts)
        } else if (row.adapter === 'gemini') {
          iterator = streamGemini(apiKey, apiModel, prepared, opts)
        } else {
          iterator = streamGlm(row.baseUrl!, apiKey, apiModel, prepared, opts)
        }

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
