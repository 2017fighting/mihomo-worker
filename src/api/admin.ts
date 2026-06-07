import type { D1Database } from '@cloudflare/workers-types';
import {
  getProxyUrls,
  getProxies,
  getRulesets,
  getAccessStats,
  getAllEndpoints,
  createProxyUrl,
  updateProxyUrl,
  deleteProxyUrl,
  createProxy,
  updateProxy,
  deleteProxy,
  createRuleset,
  updateRuleset,
  deleteRuleset,
  resetEndpoint,
} from '../db.js';

type DB = D1Database;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function success(data: unknown) {
  return json({ success: true, data });
}

function error(message: string, status = 400) {
  return json({ success: false, error: message }, status);
}

function getPathSegments(path: string): string[] {
  const rest = path.slice('/admin/api/'.length);
  return rest.split('/').filter(Boolean);
}

export async function handleAdminRoute(request: Request, db: DB): Promise<Response | null> {
  const url = new URL(request.url);
  const segs = getPathSegments(url.pathname);

  if (segs.length === 0) return null;

  const method = request.method;
  const resource = segs[0];
  const id = segs[1];
  const action = segs[2];

  try {
    switch (resource) {
      case 'endpoints':
        return handleEndpoints(method, db, request);
      case 'proxy-urls':
        return handleProxyUrls(method, db, id, request);
      case 'proxies':
        return handleProxies(method, db, id, request);
      case 'rulesets':
        return handleRulesets(method, db, id, request, action);
      case 'stats':
        return handleStats(db);
      default:
        return null;
    }
  } catch (err) {
    return error(`Internal error: ${err}`, 500);
  }
}

// --- Endpoints ---

async function handleEndpoints(method: string, db: DB, request: Request): Promise<Response> {
  if (method === 'GET') {
    const endpoints = await getAllEndpoints(db);
    return success(endpoints);
  }
  if (method === 'POST') {
    const body = (await request.json()) as { key: string };
    const result = await resetEndpoint(db, body.key);
    return success(result);
  }
  return error('Method not allowed', 405);
}

// --- Proxy URLs ---

async function handleProxyUrls(
  method: string,
  db: DB,
  id: string | undefined,
  request: Request,
): Promise<Response> {
  switch (method) {
    case 'GET':
      return success(await getProxyUrls(db));
    case 'POST': {
      const body = (await request.json()) as { type: string; url: string; provider_name?: string };
      const result = await createProxyUrl(db, body);
      return success(result);
    }
    case 'PUT': {
      if (!id) return error('Missing id', 400);
      const body = (await request.json()) as {
        type?: string;
        url?: string;
        provider_name?: string;
      };
      await updateProxyUrl(db, id, body);
      return success({ updated: true });
    }
    case 'DELETE': {
      if (!id) return error('Missing id', 400);
      await deleteProxyUrl(db, id);
      return success({ deleted: true });
    }
    default:
      return error('Method not allowed', 405);
  }
}

// --- Proxies ---

function parseProxyYaml(raw: string): {
  proto: string;
  name: string;
  server: string;
  port: number;
  config: string;
} {
  const trimmed = raw.trim();

  // Format: - {name: "...", type: vless, server: ..., port: ..., ...}
  if (trimmed.startsWith('- {') && trimmed.endsWith('}')) {
    return parseFlowStyle(trimmed.slice(2).trim());
  }

  // Format: - name: ...
  //         type: ...
  const root = parseBlockStyle(trimmed);

  const name = root.name as string | undefined;
  const proto = root.type as string | undefined;
  const server = root.server as string | undefined;
  const port = root.port as number | undefined;
  if (!name || !proto || !server || port == null) {
    throw new Error(
      `Missing required fields — got: name=${JSON.stringify(name)}, type=${JSON.stringify(proto)}, server=${JSON.stringify(server)}, port=${JSON.stringify(port)}. Full parsed: ${JSON.stringify(root)}`,
    );
  }

  const knownKeys = new Set(['name', 'type', 'server', 'port', 'proxy_type']);
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(root)) {
    if (!knownKeys.has(k)) rest[k] = v;
  }
  return { name, proto, server, port: Number(port), config: JSON.stringify(rest) };
}

function parseFlowStyle(inner: string): ReturnType<typeof parseProxyYaml> {
  const extract = (key: string): string | undefined => {
    const m = inner.match(new RegExp(`${key}:\\s*("([^"]*)"|'([^']*)'|([^,}]+))`));
    return m ? (m[2] ?? m[3] ?? m[4]?.trim()) : undefined;
  };

  const name = extract('name');
  const proto = extract('type');
  const server = extract('server');
  const portStr = extract('port');
  if (!name || !proto || !server || !portStr) {
    throw new Error('Missing required fields: name, type, server, port');
  }

  const knownKeys = new Set(['name', 'type', 'server', 'port', 'proxy_type']);
  const rest: Record<string, unknown> = {};
  const pairRe =
    /([a-zA-Z_-]+):\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\{[^}]*\}|\[[^\]]*\]|[^,}]+)/g;
  let m;
  while ((m = pairRe.exec(inner)) !== null) {
    const k = m[1];
    let v = m[2].trim();
    if (knownKeys.has(k)) continue;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    } else if (v.startsWith('{')) {
      try {
        rest[k] = JSON.parse(v.replace(/([a-zA-Z_-]+):/g, '"$1":'));
      } catch {
        rest[k] = v;
      }
      continue;
    }
    const n = Number(v);
    rest[k] = isNaN(n) ? (v === 'true' ? true : v === 'false' ? false : v) : n;
  }

  return { name, proto, server, port: Number(portStr), config: JSON.stringify(rest) };
}

function parseBlockStyle(raw: string): Record<string, unknown> {
  const lines = raw.split('\n');
  const root: Record<string, unknown> = {};
  let currentObj: Record<string, unknown> | null = null;
  let currentDepth = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s*#.*$/, '');
    if (!line.trim()) continue;

    // Strip leading "- " and whitespace
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    const clean = line.replace(/^-\s+/, '').trimStart();
    const m = clean.match(/^([a-zA-Z_-]+):\s*(.+)$/);

    // Nested block — same or deeper indentation than current
    if (m && indent >= currentDepth && currentObj !== null) {
      currentObj[m[1]] = parseValue(m[2]);
      continue;
    }

    // Key with null value — starts a nested block
    if (indent === currentDepth && clean.match(/^([a-zA-Z_-]+):\s*$/)) {
      const key = clean.replace(/:.*$/, '').trim();
      const obj: Record<string, unknown> = {};
      root[key] = obj;
      currentObj = obj;
      currentDepth = indent + 2;
      continue;
    }

    // Regular key: value
    if (m) {
      currentObj = null;
      currentDepth = indent;
      root[m[1]] = parseValue(m[2]);
    }
  }
  return root;
}

function parseValue(v: string): unknown {
  v = v.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return isNaN(n) ? v : n;
}

async function handleProxies(
  method: string,
  db: DB,
  id: string | undefined,
  request: Request,
): Promise<Response> {
  switch (method) {
    case 'GET':
      return success(await getProxies(db));
    case 'POST': {
      const body = (await request.json()) as { proxy_type: string; yaml: string };
      const parsed = parseProxyYaml(body.yaml);
      const result = await createProxy(db, { proxy_type: body.proxy_type, ...parsed });
      return success(result);
    }
    case 'PUT': {
      if (!id) return error('Missing id', 400);
      const body = (await request.json()) as { proxy_type?: string; yaml?: string };
      const data: Record<string, unknown> = {};
      if (body.proxy_type !== undefined) data.proxy_type = body.proxy_type;
      if (body.yaml !== undefined) {
        const parsed = parseProxyYaml(body.yaml);
        Object.assign(data, parsed);
      }
      await updateProxy(db, id, data as Parameters<typeof updateProxy>[2]);
      return success({ updated: true });
    }
    case 'DELETE': {
      if (!id) return error('Missing id', 400);
      await deleteProxy(db, id);
      return success({ deleted: true });
    }
    default:
      return error('Method not allowed', 405);
  }
}

// --- Rulesets ---

async function handleRulesets(
  method: string,
  db: DB,
  id: string | undefined,
  request: Request,
  action: string | undefined,
): Promise<Response> {
  if (method === 'PUT' && id && action === 'move') {
    const body = (await request.json()) as { sort_order: number };
    await updateRuleset(db, id, { sort_order: body.sort_order });
    return success({ updated: true });
  }

  switch (method) {
    case 'GET':
      return success(await getRulesets(db));
    case 'POST': {
      const body = (await request.json()) as {
        name: string;
        behavior: string;
        content: string;
        target: string;
        no_resolve?: number;
        sort_order?: number;
      };
      if (body.sort_order === undefined) {
        const maxRow = await db
          .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM rulesets')
          .first();
        body.sort_order = (maxRow as { next: number } | null)?.next ?? 0;
      }
      const result = await createRuleset(db, body);
      return success(result);
    }
    case 'PUT': {
      if (!id) return error('Missing id', 400);
      const body = (await request.json()) as {
        name?: string;
        behavior?: string;
        content?: string;
        target?: string;
        no_resolve?: number;
        sort_order?: number;
      };
      await updateRuleset(db, id, body);
      return success({ updated: true });
    }
    case 'DELETE': {
      if (!id) return error('Missing id', 400);
      await deleteRuleset(db, id);
      return success({ deleted: true });
    }
    default:
      return error('Method not allowed', 405);
  }
}

// --- Stats ---

async function handleStats(db: DB): Promise<Response> {
  const stats = await getAccessStats(db);
  return success(stats);
}
