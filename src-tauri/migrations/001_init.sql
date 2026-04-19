CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  model_id TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  context_strategy TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  display_content TEXT NOT NULL,
  context_content TEXT NOT NULL,
  in_context INTEGER NOT NULL DEFAULT 1,
  is_context_modified INTEGER NOT NULL DEFAULT 0,
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  adapter TEXT NOT NULL,
  base_url TEXT,
  context_window INTEGER NOT NULL,
  default_params TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
