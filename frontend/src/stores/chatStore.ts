import { create } from 'zustand'
import { getConversation, listMessages, replaceMessages, upsertConversation } from '../lib/db'
import { saveConversation } from '../lib/tauriBridge'
import { streamChat, summarizeRemote } from '../lib/sidecarClient'
import type { ChatMessage, Conversation, MessageRole } from '../types'
import { useModelStore } from './modelStore'
import { useConversationListStore } from './conversationListStore'

interface ChatState {
  conversation: Conversation
  selectedModelId: string
  messages: ChatMessage[]
  isStreaming: boolean
  inputText: string
  error: string | null
  setInputText: (value: string) => void
  setSelectedModel: (modelId: string) => void
  setContextStrategy: (strategy: Conversation['contextStrategy']) => void
  addUserMessage: (content: string) => void
  removeFromContext: (messageId: string) => void
  restoreToContext: (messageId: string) => void
  editContextContent: (messageId: string, content: string) => void
  addCustomContextMessage: (role: MessageRole, content: string) => void
  persistThread: () => Promise<void>
  hydrateConversation: (conversationId: string) => Promise<void>
  startNewConversation: () => Promise<void>
  summarizeToContext: () => Promise<void>
  sendToModel: () => Promise<void>
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
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === messageId ? { ...message, inContext: false } : message,
      ),
    }))
    void get().persistThread()
  },

  restoreToContext: (messageId) => {
    set((state) => ({
      messages: state.messages.map((message) =>
        message.id === messageId ? { ...message, inContext: true } : message,
      ),
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
      conversation: meta,
      selectedModelId: meta.modelId,
      messages: rows.length > 0 ? rows : seedMessages(),
    })
  },

  startNewConversation: async () => {
    const conversation = newConversation()
    set({
      conversation,
      selectedModelId: conversation.modelId,
      messages: seedMessages(),
      error: null,
    })
    await upsertConversation(conversation)
    await useConversationListStore.getState().load()
  },

  summarizeToContext: async () => {
    const { messages, selectedModelId } = get()
    const modelStore = useModelStore.getState()
    const payload = messages
      .filter((message) => message.inContext)
      .map((message) => ({ role: message.role, contextContent: message.contextContent }))
    const summary = await summarizeRemote({
      messages: payload,
      apiKeys: modelStore.apiKeys,
      modelId: selectedModelId,
    })
    const summaryMessage: ChatMessage = {
      id: newId('m'),
      role: 'assistant',
      displayContent: `[摘要] ${summary}`,
      contextContent: summary,
      inContext: true,
      isContextModified: true,
      createdAt: Date.now(),
    }
    set((state) => ({ messages: [...state.messages, summaryMessage] }))
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
