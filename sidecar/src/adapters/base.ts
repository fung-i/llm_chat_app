import type { ChatMessageDto } from '../types'

export interface StreamOptions {
  temperature?: number
  maxTokens?: number
}

export type LlmStream = AsyncGenerator<string, void, unknown>

export interface LlmAdapter {
  stream(
    model: string,
    messages: ChatMessageDto[],
    apiKey: string,
    baseUrl: string | undefined,
    options: StreamOptions,
  ): LlmStream
}
