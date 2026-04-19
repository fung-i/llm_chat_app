import Database from '@tauri-apps/plugin-sql'
import type { ChatMessage, Conversation } from '../types'
import { isTauriRuntime } from './tauriEnv'

let db: Database | null = null

export async function getDb(): Promise<Database | null> {
  if (!isTauriRuntime()) return null
  if (!db) {
    db = await Database.load('sqlite:llm_chat.db')
  }
  return db
}

function mapMessageRow(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    role: row.role as ChatMessage['role'],
    displayContent: String(row.display_content),
    contextContent: String(row.context_content),
    inContext: Boolean(row.in_context),
    isContextModified: Boolean(row.is_context_modified),
    createdAt: Number(row.created_at),
  }
}

function mapConversationRow(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    title: String(row.title),
    modelId: String(row.model_id),
    contextStrategy: row.context_strategy as Conversation['contextStrategy'],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const database = await getDb()
  if (!database) return null
  const rows = await database.select<Record<string, unknown>[]>(
    'SELECT id, title, model_id, context_strategy, created_at, updated_at FROM conversations WHERE id = ?',
    [id],
  )
  if (!rows[0]) return null
  return mapConversationRow(rows[0])
}

export async function listConversations(): Promise<Conversation[]> {
  const database = await getDb()
  if (!database) return []
  const rows = await database.select<Record<string, unknown>[]>(
    'SELECT id, title, model_id, context_strategy, created_at, updated_at FROM conversations ORDER BY updated_at DESC',
  )
  return rows.map(mapConversationRow)
}

export async function upsertConversation(conversation: Conversation): Promise<void> {
  const database = await getDb()
  if (!database) return
  await database.execute(
    `INSERT INTO conversations (id, title, model_id, system_prompt, context_strategy, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       model_id = excluded.model_id,
       context_strategy = excluded.context_strategy,
       updated_at = excluded.updated_at`,
    [
      conversation.id,
      conversation.title,
      conversation.modelId,
      '',
      conversation.contextStrategy,
      conversation.createdAt,
      conversation.updatedAt,
    ],
  )
}

export async function deleteConversation(id: string): Promise<void> {
  const database = await getDb()
  if (!database) return
  await database.execute('DELETE FROM conversations WHERE id = ?', [id])
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const database = await getDb()
  if (!database) return []
  const rows = await database.select<Record<string, unknown>[]>(
    `SELECT id, conversation_id, role, display_content, context_content, in_context, is_context_modified, token_count, created_at
     FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    [conversationId],
  )
  return rows.map(mapMessageRow)
}

export interface ModelProfileRow {
  id: string
  name: string
  provider: string
  adapter: string
  baseUrl: string | null
  contextWindow: number
  defaultParams: string
}

export async function listModelProfiles(): Promise<ModelProfileRow[]> {
  const database = await getDb()
  if (!database) return []
  const rows = await database.select<Record<string, unknown>[]>(
    'SELECT id, name, provider, adapter, base_url, context_window, default_params FROM model_profiles ORDER BY name ASC',
  )
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    provider: String(row.provider),
    adapter: String(row.adapter),
    baseUrl: row.base_url == null ? null : String(row.base_url),
    contextWindow: Number(row.context_window),
    defaultParams: String(row.default_params),
  }))
}

export async function upsertModelProfile(row: ModelProfileRow): Promise<void> {
  const database = await getDb()
  if (!database) return
  await database.execute(
    `INSERT INTO model_profiles (id, name, provider, adapter, base_url, context_window, default_params)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       provider = excluded.provider,
       adapter = excluded.adapter,
       base_url = excluded.base_url,
       context_window = excluded.context_window,
       default_params = excluded.default_params`,
    [
      row.id,
      row.name,
      row.provider,
      row.adapter,
      row.baseUrl,
      row.contextWindow,
      row.defaultParams,
    ],
  )
}

export async function replaceMessages(conversationId: string, messages: ChatMessage[]): Promise<void> {
  const database = await getDb()
  if (!database) return
  await database.execute('DELETE FROM messages WHERE conversation_id = ?', [conversationId])
  for (const message of messages) {
    await database.execute(
      `INSERT INTO messages (id, conversation_id, role, display_content, context_content, in_context, is_context_modified, token_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        conversationId,
        message.role,
        message.displayContent,
        message.contextContent,
        message.inContext ? 1 : 0,
        message.isContextModified ? 1 : 0,
        0,
        message.createdAt,
      ],
    )
  }
}
