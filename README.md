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

## 我的配置文件设计思路

> 详细内容见src/config.ts，仅供参考

- 最少配置原则：只配置应该配置的，默认值一律隐藏
- 不使用geo file（占用太大，启动慢），尽量使用mrs文件
- 节点按照国家分组（日本、香港、美国、台湾、其他国家），每个国家内设置`自动`、`负载均衡`和`自动回退`，其中`自动`只针对设置为`自动`的订阅地址（或单个节点），`自动回退`则针对该国家的所有节点。
  这样可以做到选择`自动`时：
  1. 如果有`高质量`节点(即设置为了`自动`的节点)可用，则会在`高质量`节点中自动选择延迟最低的那个。
  2. 如果`高质量`节点都不可用，则会自动选择到`自动回退`上，而自动回退会依次尝试该国家下的所有节点，直到找到第一个可用节点，确保不断网
- 支持设置自定义规则集（会插入在rules的最顶端，确保最先生效，如果有ip规则集，请确保添加了`no-resolve`参数）

## 安全保证

- 使用者需要手动保护路径`/admin/*`(推荐使用Cloudflare Access)
- 配置文件的路径(`/y/:token`)则完全没有保护，如果其他人猜到了你的uuid（或者你自己泄漏了），则任何人都可以访问你的配置文件

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

| Table         | Purpose                                                     |
| ------------- | ----------------------------------------------------------- |
| `proxy_urls`  | External subscription URLs (auto/nonauto)                   |
| `proxies`     | Internal proxy node definitions (YAML)                      |
| `rulesets`    | Custom rule sets (domain/ipcidr)                            |
| `endpoints`   | Internal URL tokens (yaml_token, auto_proxy, nonauto_proxy) |
| `access_logs` | Access statistics                                           |

## Internal Endpoints

| Path           | Purpose                                 | Auth                         |
| -------------- | --------------------------------------- | ---------------------------- |
| `/y/:token`    | Full mihomo YAML config                 | Token from `endpoints` table |
| `/p/:token`    | Aggregated proxy list (auto or nonauto) | Token from `endpoints` table |
| `/r/:uuid`     | Single ruleset content                  | UUID from `rulesets` table   |
| `/admin/`      | Admin SPA                               | Cloudflare Access            |
| `/admin/api/*` | Admin CRUD API                          | Cloudflare Access            |

## Dev locally

```bash
npm install

# Initialize local D1 database
npx wrangler d1 execute mihomo-db --local --file=db/schema.sql

# Run locally
npm run dev
# → http://localhost:8787/admin — admin SPA
# → http://localhost:8787/y/<token> — YAML config output
```

## Deploy to Cloudflare Workers

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

`https://<your-worker>/y/<yaml_token>`

## License

MIT
