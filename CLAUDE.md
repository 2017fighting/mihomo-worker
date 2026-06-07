# mihomo-worker

Cloudflare Worker that generates mihomo (Clash Meta) proxy config as YAML over HTTP, with a D1-backed management SPA.

## Commands

- `npm run dev` — Build frontend + start local dev server (wrangler dev, port 8787)
- `npm run deploy` — Build frontend + deploy to Cloudflare Workers
- `npm run typecheck` — TypeScript type check (tsc --noEmit)
- `npm run build:frontend` — Build React SPA only

## Architecture

- `src/index.ts` — Worker entry: route-based fetch handler
- `src/config.ts` — Async config builder reading from D1 (DNS, sniffer, proxies, groups, providers, rules)
- `src/db.ts` — D1 query helpers + CRUD functions
- `src/api/admin.ts` — Admin API route handlers (CRUD for proxy-urls, proxies, rulesets, endpoints, stats)
- `frontend/` — React + TypeScript SPA management interface (Vite)
- `db/schema.sql` — D1 table definitions

## Key Patterns

- Config stored in D1, not env vars — `Env` interface only has `DB` binding
- **Public URLs** (UUID-protected): `/y/:token` (YAML), `/p/:token` (proxies), `/r/:uuid` (rulesets)
- **Admin routes** under `/admin/` protected by Cloudflare Access (single rule for `/admin/*`)
- SPA at `/admin/` served via Worker Assets — Worker strips `/admin` prefix for asset requests
- Proxy nodes stored as YAML, parsed on save (name/type/server/port extracted to columns)
- Country proxy groups generated from `countries` array with filter regexes
- Rule providers pull from MetaCubeX meta-rules-dat and internal `/r/:uuid` endpoints

## Constraints

- No test framework configured yet
- Wrangler handles bundling — no separate build step
- mihomo-config is a local dependency (linked, not from npm registry)
- D1 must be initialized locally before first run: `wrangler d1 execute mihomo-db --local --file=db/schema.sql`
