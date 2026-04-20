import { getEncoding, type Tiktoken } from 'js-tiktoken'
import type { ChatMessageDto } from '../types'

let encoder: Tiktoken | null = null

function getEncoder(): Tiktoken | null {
  if (encoder) return encoder
  try {
    encoder = getEncoding('cl100k_base')
    return encoder
  } catch {
    return null
  }
}

function roughTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function countMessagesTokens(messages: ChatMessageDto[]): number {
  const enc = getEncoder()
  if (!enc) {
    return messages.reduce((sum, message) => sum + roughTokens(message.content), 0)
  }
  let total = 0
  for (const message of messages) {
    total += enc.encode(`${message.role}: ${message.content}`).length
  }
  return Math.max(1, total)
}
