export type MessageRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  displayContent: string
  contextContent: string
  inContext: boolean
  isContextModified: boolean
  createdAt: number
}

export interface Conversation {
  id: string
  title: string
  modelId: string
  contextStrategy: 'auto_trim' | 'manual' | 'summarize'
  /** 摘要产生的多段内容，发送时与首条 system 合并 */
  systemSummarySlots: string[]
  createdAt: number
  updatedAt: number
}

export interface ModelOption {
  id: string
  name: string
  provider: string
  contextWindow: number
  /** Marks user-defined models so the UI and send pipeline can treat them specially. */
  isCustom?: boolean
}

export type CustomAdapter = 'openai' | 'anthropic' | 'gemini' | 'glm'

/**
 * User-defined model. Stored locally (localStorage + keychain for api keys) and
 * sent inline to the sidecar via `providerOverride` rather than being registered
 * in providers.json. Shape mirrors sidecar's ProviderRow.
 */
export interface CustomProvider {
  id: string
  name: string
  provider: string
  adapter: CustomAdapter
  apiModel: string
  baseUrl?: string
  contextWindow: number
}
