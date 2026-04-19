INSERT OR IGNORE INTO model_profiles (id, name, provider, adapter, base_url, context_window, default_params) VALUES
  ('gpt-4o-mini', 'GPT-4o mini', 'openai', 'openai', 'https://api.openai.com/v1', 128000, '{}'),
  ('gpt-4o', 'GPT-4o', 'openai', 'openai', 'https://api.openai.com/v1', 128000, '{}'),
  ('claude-3-7-sonnet', 'Claude 3.7 Sonnet', 'anthropic', 'anthropic', NULL, 200000, '{}'),
  ('gemini-2.5-pro', 'Gemini 2.5 Pro', 'google', 'gemini', NULL, 1000000, '{}'),
  ('qwen-max', 'Qwen Max', 'qwen', 'openai', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 32000, '{}'),
  ('doubao-pro', 'Doubao Pro', 'doubao', 'openai', 'https://ark.cn-beijing.volces.com/api/v3', 128000, '{}'),
  ('kimi-latest', 'Kimi Latest', 'kimi', 'openai', 'https://api.moonshot.cn/v1', 128000, '{}'),
  ('glm-4', 'GLM-4', 'glm', 'glm', 'https://open.bigmodel.cn/api/paas/v4', 128000, '{}');
