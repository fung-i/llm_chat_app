export type MessageRole = 'system' | 'user' | 'assistant'

export interface ChatMessageDto {
  role: MessageRole
  content: string
}

export type ContextStrategy = 'auto_trim' | 'manual' | 'summarize'

export interface ProviderRow {
  id: string
  name: string
  provider: string
  adapter: 'openai' | 'anthropic' | 'gemini' | 'glm'
  baseUrl?: string
  /** API model id when different from registry `id` */
  apiModel?: string
  contextWindow: number
}

export interface StreamRequestBody {
  conversationId: string
  modelId: string
  messages: ChatMessageDto[]
  apiKeys?: Record<string, string>
  contextStrategy?: ContextStrategy
  contextWindow?: number
  temperature?: number
  maxTokens?: number
}
