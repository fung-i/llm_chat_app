import OpenAI from 'openai'
import type { ChatMessageDto } from '../types'

export async function* streamOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessageDto[],
  options: { temperature?: number; maxTokens?: number },
): AsyncGenerator<string> {
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl.replace(/\/$/, ''),
  })
  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
  })
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content
    if (text) yield text
  }
}
