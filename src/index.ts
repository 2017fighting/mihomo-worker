import { buildConfig, generateYaml } from './config.js';
import { getEndpoint, getProxiesByType, getRulesets, logAccess } from './db.js';
import type { D1Database, Fetcher } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleYamlToken(
  db: D1Database,
  token: string,
  ip: string,
  country: string,
  baseUrl: string,
): Promise<Response> {
  const yamlToken = await getEndpoint(db, 'yaml_token');
  if (!yamlToken || token !== yamlToken) {
    return new Response('Not found', { status: 404 });
  }
  await logAccess(db, `/y/${token}`, ip, country);
  const config = await buildConfig(db, baseUrl);
  return new Response(generateYaml(config), {
    headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
  });
}

async function handleProxyProvider(
  db: D1Database,
  token: string,
  ip: string,
  country: string,
): Promise<Response> {
  const autoToken = await getEndpoint(db, 'auto_proxy');
  const nonautoToken = await getEndpoint(db, 'nonauto_proxy');

  let proxyType: 'auto' | 'nonauto' | null = null;
  if (token === autoToken) proxyType = 'auto';
  else if (token === nonautoToken) proxyType = 'nonauto';

  if (!proxyType) return new Response('Not found', { status: 404 });

  await logAccess(db, `/p/${token}`, ip, country);
  const proxies = await getProxiesByType(db, proxyType);

  const lines = ['proxies:'];
  for (const p of proxies) {
    const cfg = JSON.parse(p.config);
    const node: Record<string, unknown> = {
      name: p.name,
      type: p.proto,
      server: p.server,
      port: p.port,
      ...cfg,
    };
    lines.push(`  - ${JSON.stringify(node)}`);
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
  });
}

async function handleRuleset(
  db: D1Database,
  uuid: string,
  ip: string,
  country: string,
): Promise<Response> {
  const rulesets = await getRulesets(db);
  const rs = rulesets.find((r) => r.id === uuid);
  if (!rs) return new Response('Not found', { status: 404 });

  await logAccess(db, `/r/${uuid}`, ip, country);
  return new Response(rs.content, {
    headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
  });
}

async function handleAdmin(request: Request, db: D1Database): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/admin/api/')) return null;

  const { handleAdminRoute } = await import('./api/admin.js');
  return handleAdminRoute(request, db);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const country = (request as { cf?: { country?: string } }).cf?.country ?? '';
    const ip = request.headers.get('cf-connecting-ip') ?? '127.0.0.1';

    try {
      const yamlMatch = path.match(/^\/y\/([^/]+)$/);
      if (yamlMatch) {
        return handleYamlToken(env.DB, yamlMatch[1], ip, country, url.origin);
      }

      const providerMatch = path.match(/^\/p\/([^/]+)$/);
      if (providerMatch) {
        return handleProxyProvider(env.DB, providerMatch[1], ip, country);
      }

      const rulesetMatch = path.match(/^\/r\/([^/]+)$/);
      if (rulesetMatch) {
        return handleRuleset(env.DB, rulesetMatch[1], ip, country);
      }

      // /admin/api/* — Admin API
      const adminResponse = await handleAdmin(request, env.DB);
      if (adminResponse) return adminResponse;

      // /admin/* — SPA: always serve index.html
      if (request.method !== 'POST' && path.startsWith('/admin')) {
        return env.ASSETS.fetch(new Request(new URL('/', url.origin), request));
      }
      return new Response('Not found', { status: 404 });
    } catch (err) {
      return new Response(`Error: ${err}`, { status: 500 });
    }
  },
};
