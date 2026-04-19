import { countMessagesTokens } from './tokenCounter'
import type { ChatMessageDto, ContextStrategy } from '../types'

const RESERVE_OUTPUT = 4096

export function applyContextStrategy(
  messages: ChatMessageDto[],
  strategy: ContextStrategy,
  contextWindow: number,
): ChatMessageDto[] {
  if (strategy === 'manual') {
    return messages
  }

  const budget = Math.max(8192, contextWindow - RESERVE_OUTPUT)
  let working = [...messages]

  if (strategy === 'auto_trim' || strategy === 'summarize') {
    while (working.length > 1 && countMessagesTokens(working) > budget) {
      const idx = working.findIndex((message) => message.role !== 'system')
      if (idx === -1) break
      working.splice(idx, 1)
    }
  }

  return working
}
