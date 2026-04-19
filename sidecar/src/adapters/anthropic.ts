import Anthropic from '@anthropic-ai/sdk'
import type { ChatMessageDto } from '../types'

export async function* streamAnthropic(
  apiKey: string,
  model: string,
  messages: ChatMessageDto[],
  options: { temperature?: number; maxTokens?: number },
): AsyncGenerator<string> {
  const client = new Anthropic({ apiKey })
  const systemParts = messages.filter((message) => message.role === 'system')
  const system = systemParts.map((message) => message.content).join('\n\n') || undefined
  const nonSystem = messages.filter((message) => message.role !== 'system')
  const anthropicMessages = nonSystem.map((message) => ({
    role: message.role as 'user' | 'assistant',
    content: message.content,
  }))

  const stream = await client.messages.stream({
    model,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    system,
    messages: anthropicMessages,
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta') {
      const delta = event.delta
      if (delta.type === 'text_delta') {
        yield delta.text
      }
    }
  }
}
