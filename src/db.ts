import type { D1Database } from '@cloudflare/workers-types';

export interface ProxyUrlRow {
  id: string;
  type: 'auto' | 'nonauto';
  url: string;
  provider_name: string;
}

export interface ProxyRow {
  id: string;
  proxy_type: 'auto' | 'nonauto';
  proto: string;
  name: string;
  server: string;
  port: number;
  config: string;
}

export interface RulesetRow {
  id: string;
  name: string;
  behavior: string;
  content: string;
  target: string;
  no_resolve: number;
  sort_order: number;
}

export function generateUUID(): string {
  return crypto.randomUUID();
}

export async function getProxyUrls(db: D1Database): Promise<ProxyUrlRow[]> {
  const result = await db.prepare('SELECT * FROM proxy_urls').all();
  return result.results as unknown as ProxyUrlRow[];
}

export async function getProxies(db: D1Database): Promise<ProxyRow[]> {
  const result = await db.prepare('SELECT * FROM proxies').all();
  return result.results as unknown as ProxyRow[];
}

export async function getProxiesByType(db: D1Database, proxyType: string): Promise<ProxyRow[]> {
  const result = await db
    .prepare('SELECT * FROM proxies WHERE proxy_type = ?')
    .bind(proxyType)
    .all();
  return result.results as unknown as ProxyRow[];
}

export async function getRulesets(db: D1Database): Promise<RulesetRow[]> {
  const result = await db.prepare('SELECT * FROM rulesets ORDER BY sort_order').all();
  return result.results as unknown as RulesetRow[];
}

export async function getEndpoint(db: D1Database, key: string): Promise<string | null> {
  const result = await db.prepare('SELECT path FROM endpoints WHERE key = ?').bind(key).first();
  if (!result) return null;
  return (result as { path: string }).path;
}

export async function logAccess(
  db: D1Database,
  path: string,
  ip: string,
  country: string,
): Promise<void> {
  await db
    .prepare('INSERT INTO access_logs (path, ip, country) VALUES (?, ?, ?)')
    .bind(path, ip, country)
    .run();
}

export interface AccessStats {
  total: number;
  last24h: number;
  last7d: number;
  byCountry: { country: string; count: number }[];
  recent: unknown[];
}

export async function getAccessStats(db: D1Database): Promise<AccessStats> {
  const [totalRow, last24hRow, last7dRow, byCountryResult, recentResult] = await Promise.all([
    db.prepare('SELECT COUNT(*) as count FROM access_logs').first(),
    db
      .prepare(
        "SELECT COUNT(*) as count FROM access_logs WHERE created_at >= datetime('now', '-1 day')",
      )
      .first(),
    db
      .prepare(
        "SELECT COUNT(*) as count FROM access_logs WHERE created_at >= datetime('now', '-7 days')",
      )
      .first(),
    db
      .prepare(
        'SELECT country, COUNT(*) as count FROM access_logs GROUP BY country ORDER BY count DESC',
      )
      .all(),
    db.prepare('SELECT * FROM access_logs ORDER BY created_at DESC LIMIT 10').all(),
  ]);

  return {
    total: (totalRow as { count: number } | null)?.count ?? 0,
    last24h: (last24hRow as { count: number } | null)?.count ?? 0,
    last7d: (last7dRow as { count: number } | null)?.count ?? 0,
    byCountry: (byCountryResult.results as unknown as { country: string; count: number }[]).map(
      (r) => ({ country: r.country || '未知', count: r.count }),
    ),
    recent: recentResult.results as unknown[],
  };
}

// --- Admin CRUD ---

export async function createProxyUrl(
  db: D1Database,
  data: { type: string; url: string; provider_name?: string },
): Promise<ProxyUrlRow> {
  const id = generateUUID();
  await db
    .prepare('INSERT INTO proxy_urls (id, type, url, provider_name) VALUES (?, ?, ?, ?)')
    .bind(id, data.type, data.url, data.provider_name ?? '')
    .run();
  return {
    id,
    type: data.type as 'auto' | 'nonauto',
    url: data.url,
    provider_name: data.provider_name ?? '',
  };
}

export async function updateProxyUrl(
  db: D1Database,
  id: string,
  data: { type?: string; url?: string; provider_name?: string },
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (data.type !== undefined) {
    sets.push('type = ?');
    params.push(data.type);
  }
  if (data.url !== undefined) {
    sets.push('url = ?');
    params.push(data.url);
  }
  if (data.provider_name !== undefined) {
    sets.push('provider_name = ?');
    params.push(data.provider_name);
  }
  if (sets.length === 0) return;
  await db
    .prepare(`UPDATE proxy_urls SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params, id)
    .run();
}

export async function deleteProxyUrl(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM proxy_urls WHERE id = ?').bind(id).run();
}

export async function createProxy(
  db: D1Database,
  data: {
    proxy_type: string;
    proto: string;
    name: string;
    server: string;
    port: number;
    config: string;
  },
): Promise<ProxyRow> {
  const id = generateUUID();
  await db
    .prepare(
      'INSERT INTO proxies (id, proxy_type, proto, name, server, port, config) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(id, data.proxy_type, data.proto, data.name, data.server, data.port, data.config)
    .run();
  return { id, ...data, proxy_type: data.proxy_type as 'auto' | 'nonauto' };
}

export async function updateProxy(
  db: D1Database,
  id: string,
  data: {
    proxy_type?: string;
    proto?: string;
    name?: string;
    server?: string;
    port?: number;
    config?: string;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (data.proxy_type !== undefined) {
    sets.push('proxy_type = ?');
    params.push(data.proxy_type);
  }
  if (data.proto !== undefined) {
    sets.push('proto = ?');
    params.push(data.proto);
  }
  if (data.name !== undefined) {
    sets.push('name = ?');
    params.push(data.name);
  }
  if (data.server !== undefined) {
    sets.push('server = ?');
    params.push(data.server);
  }
  if (data.port !== undefined) {
    sets.push('port = ?');
    params.push(data.port);
  }
  if (data.config !== undefined) {
    sets.push('config = ?');
    params.push(data.config);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  await db
    .prepare(`UPDATE proxies SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params, id)
    .run();
}

export async function deleteProxy(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM proxies WHERE id = ?').bind(id).run();
}

export async function createRuleset(
  db: D1Database,
  data: {
    name: string;
    behavior: string;
    content: string;
    target: string;
    no_resolve?: number;
    sort_order?: number;
  },
): Promise<RulesetRow> {
  const id = generateUUID();
  await db
    .prepare(
      'INSERT INTO rulesets (id, name, behavior, content, target, no_resolve, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      id,
      data.name,
      data.behavior,
      data.content,
      data.target,
      data.no_resolve ?? 0,
      data.sort_order ?? 0,
    )
    .run();
  return { id, ...data, no_resolve: data.no_resolve ?? 0, sort_order: data.sort_order ?? 0 };
}

export async function updateRuleset(
  db: D1Database,
  id: string,
  data: {
    name?: string;
    behavior?: string;
    content?: string;
    target?: string;
    no_resolve?: number;
    sort_order?: number;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: (string | number)[] = [];
  if (data.name !== undefined) {
    sets.push('name = ?');
    params.push(data.name);
  }
  if (data.behavior !== undefined) {
    sets.push('behavior = ?');
    params.push(data.behavior);
  }
  if (data.content !== undefined) {
    sets.push('content = ?');
    params.push(data.content);
  }
  if (data.target !== undefined) {
    sets.push('target = ?');
    params.push(data.target);
  }
  if (data.no_resolve !== undefined) {
    sets.push('no_resolve = ?');
    params.push(data.no_resolve);
  }
  if (data.sort_order !== undefined) {
    sets.push('sort_order = ?');
    params.push(data.sort_order);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  await db
    .prepare(`UPDATE rulesets SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...params, id)
    .run();
}

export async function deleteRuleset(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM rulesets WHERE id = ?').bind(id).run();
}

export async function resetEndpoint(
  db: D1Database,
  key: string,
): Promise<{ key: string; path: string }> {
  const path = generateUUID();
  await db
    .prepare(
      'INSERT INTO endpoints (key, path) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET path = ?',
    )
    .bind(key, path, path)
    .run();
  return { key, path };
}

export async function getAllEndpoints(db: D1Database): Promise<{ key: string; path: string }[]> {
  const result = await db.prepare('SELECT * FROM endpoints').all();
  return result.results as unknown as { key: string; path: string }[];
}
