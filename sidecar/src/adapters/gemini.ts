import { GoogleGenerativeAI } from '@google/generative-ai'
import type { ChatMessageDto } from '../types'

function toGeminiHistory(messages: ChatMessageDto[]) {
  const history: { role: 'user' | 'model'; parts: { text: string }[] }[] = []
  for (const message of messages) {
    if (message.role === 'system') continue
    history.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })
  }
  return history
}

export async function* streamGemini(
  apiKey: string,
  model: string,
  messages: ChatMessageDto[],
  options: { temperature?: number; maxTokens?: number },
): AsyncGenerator<string> {
  const genAI = new GoogleGenerativeAI(apiKey)
  const systemInstruction = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n')
  const rest = messages.filter((message) => message.role !== 'system')
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemInstruction || undefined,
    generationConfig: {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 4096,
    },
  })

  if (rest.length === 0) return

  const history = toGeminiHistory(rest.slice(0, -1))
  const last = rest[rest.length - 1]
  if (!last) return

  const chat = genModel.startChat({ history })
  const result = await chat.sendMessageStream(last.content)
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) yield text
  }
}
