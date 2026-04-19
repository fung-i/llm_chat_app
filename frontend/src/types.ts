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
}
