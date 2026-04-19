import type { ChatMessage } from '../types'

const SEP = '\n\n---\n\n'

/** 基础 System 与多段摘要块拼接为一条发送用的 system 文本 */
export function mergeSystemParts(base: string, summarySlots: string[]): string {
  const parts = [base.trim(), ...summarySlots.map((s) => s.trim()).filter(Boolean)].filter(Boolean)
  return parts.join(SEP)
}

/**
 * 将「首条 system + 摘要块」合并为一条，其余 inContext 消息按序保留。
 * 若无首条 system 但有摘要块，则在前面插入一条仅含摘要合并内容的 system。
 */
export function buildInContextMessagesForApi(
  messages: ChatMessage[],
  systemSummarySlots: string[],
): ChatMessage[] {
  const inc = messages.filter((m) => m.inContext)
  if (inc.length === 0) return []

  const first = inc[0]
  if (first.role === 'system') {
    const merged = mergeSystemParts(first.contextContent, systemSummarySlots)
    return [{ ...first, contextContent: merged, displayContent: merged }, ...inc.slice(1)]
  }

  if (systemSummarySlots.length > 0) {
    const merged = mergeSystemParts('', systemSummarySlots)
    const synthetic: ChatMessage = {
      id: '_merged_system_',
      role: 'system',
      displayContent: merged,
      contextContent: merged,
      inContext: true,
      isContextModified: true,
      createdAt: first.createdAt - 1,
    }
    return [synthetic, ...inc]
  }

  return inc
}
