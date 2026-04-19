import { create } from 'zustand'
import { getConversation, listMessages, replaceMessages, upsertConversation } from '../lib/db'
import { saveConversation } from '../lib/tauriBridge'
import { streamChat, summarizeRemote } from '../lib/sidecarClient'
import type { ChatMessage, Conversation, MessageRole } from '../types'
import { useModelStore } from './modelStore'
import { useConversationListStore } from './conversationListStore'

interface HistoryEntry {
  messages: ChatMessage[]
  systemSummarySlots: string[]
  label: string
}

const HISTORY_LIMIT = 50

interface ChatState {
  conversation: Conversation
  selectedModelId: string
  messages: ChatMessage[]
  isStreaming: boolean
  inputText: string
  error: string | null
  history: HistoryEntry[]
  setInputText: (value: string) => void
  setSelectedModel: (modelId: string) => void
  setContextStrategy: (strategy: Conversation['contextStrategy']) => void
  addUserMessage: (content: string) => void
  removeFromContext: (messageId: string) => void
  restoreToContext: (messageId: string) => void
  deleteMessage: (messageId: string) => void
  editContextContent: (messageId: string, content: string) => void
  addCustomContextMessage: (role: MessageRole, content: string) => void
  persistThread: () => Promise<void>
  hydrateConversation: (conversationId: string) => Promise<void>
  startNewConversation: () => Promise<void>
  updateSystemSummarySlot: (index: number, text: string) => void
  summarizeWithScope: (scope: 'selected' | 'full', selectedIds: string[]) => Promise<void>
  sendToModel: () => Promise<void>
  pushHistorySnapshot: (label: string) => void
  undo: () => void
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`
}

function seedMessages(): ChatMessage[] {
  return [
    {
      id: newId('m'),
      role: 'system',
      displayContent: '你是一个专业、清晰、简洁的 AI 助手。',
      contextContent: '你是一个专业、清晰、简洁的 AI 助手。',
      inContext: true,
      isContextModified: false,
      createdAt: Date.now(),
    },
  ]
}

function newConversation(): Conversation {
  return {
    id: newId('c'),
    title: '新会话',
    modelId: 'gpt-4o-mini',
    contextStrategy: 'manual',
    systemSummarySlots: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversation: newConversation(),
  selectedModelId: 'gpt-4o-mini',
  messages: seedMessages(),
  isStreaming: false,
  inputText: '',
  error: null,
  history: [],

  pushHistorySnapshot: (label) => {
    const { messages, conversation, history } = get()
    const next = [
      ...history,
      {
        messages: messages.map((m) => ({ ...m })),
        systemSummarySlots: [...conversation.systemSummarySlots],
        label,
      },
    ]
    if (next.length > HISTORY_LIMIT) next.splice(0, next.length - HISTORY_LIMIT)
    set({ history: next })
  },

  undo: () => {
    const { history, isStreaming } = get()
    if (isStreaming || history.length === 0) return
    const next = history.slice(0, -1)
    const snap = history[history.length - 1]
    set((state) => ({
      history: next,
      messages: snap.messages.map((m) => ({ ...m })),
      conversation: {
        ...state.conversation,
        systemSummarySlots: [...snap.systemSummarySlots],
        updatedAt: Date.now(),
      },
      error: null,
    }))
    void get().persistThread()
  },

  setInputText: (value) => set({ inputText: value }),

  setSelectedModel: (modelId) => {
    set((state) => ({
      selectedModelId: modelId,
      conversation: { ...state.conversation, modelId, updatedAt: Date.now() },
    }))
    void get().persistThread()
  },

  setContextStrategy: (strategy) => {
    set((state) => ({
      conversation: { ...state.conversation, contextStrategy: strategy, updatedAt: Date.now() },
    }))
    void get().persistThread()
  },

  addUserMessage: (content) => {
    const userMessage: ChatMessage = {
      id: newId('m'),
      role: 'user',
      displayContent: content,
      contextContent: content,
      inContext: true,
      isContextModified: false,
      createdAt: Date.now(),
    }
    set((state) => ({
      inputText: '',
      messages: [...state.messages, userMessage],
      conversation: {
        ...state.conversation,
        title: state.conversation.title === '新会话' ? content.slice(0, 20) : state.conversation.title,
        updatedAt: Date.now(),
      },
    }))
    void get().persistThread()
  },

  removeFromContext: (messageId) => {
    get().pushHistorySnapshot('移除消息')
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === messageId ? { ...message, inContext: false } : message,
      ),
    }))
    void get().persistThread()
  },

  restoreToContext: (messageId) => {
    get().pushHistorySnapshot('加回上下文')
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === messageId ? { ...message, inContext: true } : message,
      ),
    }))
    void get().persistThread()
  },

  deleteMessage: (messageId) => {
    get().pushHistorySnapshot('删除消息')
    set((state) => ({
      messages: state.messages.filter((message) => message.id !== messageId),
    }))
    void get().persistThread()
  },

  editContextContent: (messageId, content) =>
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              contextContent: content,
              isContextModified: content !== message.displayContent,
            }
          : message,
      ),
    })),

  addCustomContextMessage: (role, content) => {
    get().pushHistorySnapshot('添加消息')
    const customMessage: ChatMessage = {
      id: newId('m'),
      role,
      displayContent: `[手动添加] ${content}`,
      contextContent: content,
      inContext: true,
      isContextModified: true,
      createdAt: Date.now(),
    }
    set((state) => ({ messages: [...state.messages, customMessage] }))
    void get().persistThread()
  },

  persistThread: async () => {
    const { conversation, messages } = get()
    const updated = { ...conversation, updatedAt: Date.now() }
    set({ conversation: updated })
    await upsertConversation(updated)
    await replaceMessages(updated.id, messages)
    await useConversationListStore.getState().load()
  },

  hydrateConversation: async (conversationId) => {
    const meta = await getConversation(conversationId)
    if (!meta) return
    const rows = await listMessages(conversationId)
    set({
      conversation: {
        ...meta,
        systemSummarySlots: meta.systemSummarySlots ?? [],
      },
      selectedModelId: meta.modelId,
      messages: rows.length > 0 ? rows : seedMessages(),
      history: [],
      error: null,
    })
  },

  startNewConversation: async () => {
    const conversation = newConversation()
    set({
      conversation,
      selectedModelId: conversation.modelId,
      messages: seedMessages(),
      history: [],
      error: null,
    })
    await upsertConversation(conversation)
    await useConversationListStore.getState().load()
  },

  updateSystemSummarySlot: (index, text) => {
    set((state) => {
      const slots = [...state.conversation.systemSummarySlots]
      slots[index] = text
      return {
        conversation: {
          ...state.conversation,
          systemSummarySlots: slots,
          updatedAt: Date.now(),
        },
      }
    })
  },

  summarizeWithScope: async (scope, selectedIds) => {
    const { messages, selectedModelId } = get()
    const modelStore = useModelStore.getState()

    let ordered: typeof messages
    if (scope === 'full') {
      ordered = [...messages].sort((a, b) => a.createdAt - b.createdAt)
    } else {
      const set = new Set(selectedIds)
      ordered = [...messages].filter((m) => set.has(m.id)).sort((a, b) => a.createdAt - b.createdAt)
    }

    if (ordered.length === 0) {
      set({ error: scope === 'selected' ? '请勾选至少一条消息。' : '没有可摘要的消息。' })
      return
    }

    const payload = ordered.map((message) => ({
      role: message.role,
      contextContent: message.contextContent,
    }))

    let summary: string
    try {
      summary = await summarizeRemote({
        messages: payload,
        apiKeys: modelStore.apiKeys,
        modelId: selectedModelId,
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '摘要失败。',
      })
      return
    }

    const first = messages[0]
    const keepFirstSystem = first?.role === 'system'

    get().pushHistorySnapshot('摘要')

    set((state) => {
      const sourceIds = new Set(ordered.map((m) => m.id))
      const nextMessages = state.messages.map((m) => {
        if (!sourceIds.has(m.id)) return m
        if (keepFirstSystem && m.id === first?.id && m.role === 'system') return m
        return { ...m, inContext: false }
      })
      return {
        messages: nextMessages,
        conversation: {
          ...state.conversation,
          systemSummarySlots: [...state.conversation.systemSummarySlots, summary],
          updatedAt: Date.now(),
        },
        error: null,
      }
    })
    await get().persistThread()
  },

  sendToModel: async () => {
    const { conversation, messages, selectedModelId, isStreaming } = get()
    if (isStreaming) return

    const assistantMessage: ChatMessage = {
      id: newId('m'),
      role: 'assistant',
      displayContent: '',
      contextContent: '',
      inContext: true,
      isContextModified: false,
      createdAt: Date.now(),
    }

    set((state) => ({
      isStreaming: true,
      error: null,
      messages: [...state.messages, assistantMessage],
    }))

    await saveConversation({ ...conversation, updatedAt: Date.now() })

    const modelStore = useModelStore.getState()
    const providers = modelStore.providers
    const modelMeta = providers.find((item) => item.id === selectedModelId)
    const contextWindow = modelMeta?.contextWindow ?? 128000

    try {
      await streamChat({
        conversationId: conversation.id,
        messages,
        systemSummarySlots: conversation.systemSummarySlots,
        modelId: selectedModelId,
        apiKeys: modelStore.apiKeys,
        contextStrategy: conversation.contextStrategy,
        contextWindow,
        temperature: modelStore.temperature,
        maxTokens: modelStore.maxTokens,
        onChunk: (chunk) => {
          if (chunk.type === 'error') {
            set({ error: chunk.error ?? 'Unknown streaming error' })
            return
          }

          if (chunk.type === 'delta') {
            set((state) => ({
              messages: state.messages.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      displayContent: `${message.displayContent}${chunk.text ?? ''}`,
                      contextContent: `${message.contextContent}${chunk.text ?? ''}`,
                    }
                  : message,
              ),
            }))
            return
          }

          if (chunk.type === 'done') {
            return
          }
        },
      })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Send to model failed.',
      })
    } finally {
      set({ isStreaming: false })
      void get().persistThread()
    }
  },
}))
