# mihomo-worker

Cloudflare Worker that dynamically generates [mihomo (Clash Meta)](https://github.com/MetaCubeX/mihomo) proxy configuration as YAML over HTTP. Configuration is managed through a D1 database with a React SPA admin panel.

## How It Works

```
                                 ┌──────────────────────┐
  mihomo client ──GET /y/:token──▶   Worker              │
                                 │  ┌──────────────────┐ │
  mihomo client ──GET /p/:token──▶  │ buildConfig(db)  │ │
                                 │  │   ↓ D1 queries   │ │
  mihomo client ──GET /r/:uuid──▶  │ proxy_urls        │ │
                                 │  │ proxies           │ │
  browser ──GET /admin/*───────▶  │ rulesets          │ │
                                 │  │ endpoints         │ │
                                 │  │ access_logs       │ │
                                 │  └──────────────────┘ │
                                 └──────────────────────┘
```

- **D1 database** stores all configuration (proxy URLs, proxy nodes, rulesets, endpoint tokens)
- **Public URLs** (`/y/:token`, `/p/:token`, `/r/:uuid`) serve config and proxy content to mihomo clients
- **Admin SPA** at `/admin/` provides a web UI for managing all configuration
- **Cloudflare Access** protects `/admin/*` (single rule)

## Quick Start

```bash
npm install

# Initialize local D1 database
npx wrangler d1 execute mihomo-db --local --file=db/schema.sql

# Run locally
npm run dev
# → http://localhost:8787/admin — admin SPA
# → http://localhost:8787/y/<token> — YAML config output
```

## Project Structure

```
src/
├── index.ts          # Worker entry: route-based fetch handler
├── config.ts         # Async config builder using mihomo-config factories
├── db.ts             # D1 query helpers + admin CRUD
└── api/
    └── admin.ts      # /api/admin/* route handlers
frontend/
├── src/
│   ├── App.tsx       # React Router + layout
│   ├── api.ts        # API client helpers
│   └── pages/        # Dashboard, ProxyUrls, Proxies, Rulesets
└── dist/             # Built SPA (served via Worker Assets)
db/
└── schema.sql        # D1 table definitions
```

## D1 Schema

| Table | Purpose |
|---|---|
| `proxy_urls` | External subscription URLs (auto/nonauto) |
| `proxies` | Internal proxy node definitions (YAML) |
| `rulesets` | Custom rule sets (domain/ipcidr) |
| `endpoints` | Internal URL tokens (yaml_token, auto_proxy, nonauto_proxy) |
| `access_logs` | Access statistics |

## Internal Endpoints

| Path | Purpose | Auth |
|---|---|---|
| `/y/:token` | Full mihomo YAML config | Token from `endpoints` table |
| `/p/:token` | Aggregated proxy list (auto or nonauto) | Token from `endpoints` table |
| `/r/:uuid` | Single ruleset content | UUID from `rulesets` table |
| `/admin/` | Admin SPA | Cloudflare Access |
| `/admin/api/*` | Admin CRUD API | Cloudflare Access |

## Deploy

```bash
# Create production D1 database
npx wrangler d1 create mihomo-db

# Update wrangler.toml with the returned database_id

# Deploy schema to production
npx wrangler d1 execute mihomo-db --file=db/schema.sql

# Deploy Worker
npm run deploy
```

Set the YAML endpoint as your mihomo subscription:

```yaml
proxy-providers:
  my-config:
    type: http
    url: https://<your-worker>/y/<yaml_token>
    interval: 86400
```

## License

MIT
