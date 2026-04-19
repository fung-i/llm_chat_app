import { create } from 'zustand'
import type { Conversation } from '../types'
import { deleteConversation, listConversations, upsertConversation } from '../lib/db'

interface ConversationListState {
  items: Conversation[]
  load: () => Promise<void>
  remove: (id: string) => Promise<void>
  upsert: (conversation: Conversation) => Promise<void>
}

export const useConversationListStore = create<ConversationListState>((set, get) => ({
  items: [],

  load: async () => {
    const items = await listConversations()
    set({ items })
  },

  remove: async (id) => {
    await deleteConversation(id)
    await get().load()
  },

  upsert: async (conversation) => {
    await upsertConversation(conversation)
    await get().load()
  },
}))
