import type { Conversation } from '../types'
import { upsertConversation } from './db'
import { isTauriRuntime } from './tauriEnv'

export async function saveConversation(conversation: Conversation): Promise<void> {
  if (isTauriRuntime()) {
    await upsertConversation(conversation)
    return
  }
  window.localStorage.setItem(`conversation:${conversation.id}`, JSON.stringify(conversation))
}
