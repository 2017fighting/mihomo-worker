CREATE TABLE IF NOT EXISTS proxy_urls (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  provider_name TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS proxies (
  id TEXT PRIMARY KEY,
  proxy_type TEXT NOT NULL,
  proto TEXT NOT NULL,
  name TEXT NOT NULL,
  server TEXT NOT NULL,
  port INTEGER NOT NULL,
  config TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rulesets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  behavior TEXT NOT NULL,
  content TEXT NOT NULL,
  target TEXT NOT NULL,
  no_resolve INTEGER DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS endpoints (
  key TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  ip TEXT NOT NULL,
  country TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
