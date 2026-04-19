import type { ChatMessageDto } from '../types'
import { streamOpenAICompatible } from './openaiCompatible'

export function streamGlm(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessageDto[],
  options: { temperature?: number; maxTokens?: number },
) {
  return streamOpenAICompatible(baseUrl, apiKey, model, messages, options)
}
