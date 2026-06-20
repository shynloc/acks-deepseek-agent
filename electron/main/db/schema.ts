export const schema = `
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '新对话',
  model       TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  system_prompt TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  tokens_used     INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL,
  metadata        TEXT
);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES categories(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  color       TEXT DEFAULT '#6B7280',
  order_index INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  category_id   TEXT REFERENCES categories(id) ON DELETE SET NULL,
  color         TEXT DEFAULT 'none',
  word_count    INTEGER DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  source_type   TEXT,
  source_id     TEXT,
  source_msg_id TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, content, content=notes, content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.rowid, old.title, old.content);
  INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TABLE IF NOT EXISTS note_versions (
  id       TEXT PRIMARY KEY,
  note_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  content  TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  note_id         TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shortcuts (
  id          TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS token_stats (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  recorded_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_conversation ON bookmarks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_token_stats_date ON token_stats(recorded_at);

-- ── Sprint A: Agent tool call log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_tool_logs (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  tool_name       TEXT NOT NULL,
  args_json       TEXT,
  result_snippet  TEXT,
  is_error        INTEGER DEFAULT 0,
  called_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_logs_conv ON agent_tool_logs(conversation_id);

-- ── Sprint B: Skills ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL,
  trigger_keywords TEXT,
  system_hint      TEXT,
  tool_sequence    TEXT,
  usage_count      INTEGER DEFAULT 0,
  source           TEXT DEFAULT 'manual',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skills_updated ON skills(updated_at DESC);

-- ── Sprint C: Plugins ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plugins (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  display_name      TEXT NOT NULL,
  description       TEXT NOT NULL,
  endpoint_url      TEXT NOT NULL,
  method            TEXT DEFAULT 'POST',
  headers_json      TEXT,
  param_schema_json TEXT,
  enabled           INTEGER DEFAULT 1,
  created_at        INTEGER NOT NULL
);

-- ── Sync tombstones ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deleted_notes (
  id         TEXT PRIMARY KEY,
  deleted_at INTEGER NOT NULL
);

-- ── Sprint D: User Memory ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_memory (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL,
  source     TEXT DEFAULT 'auto',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`
