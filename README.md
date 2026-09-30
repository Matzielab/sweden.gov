# sweden.gov

One front door to the Swedish public sector: a single prompt box. You ask a question; an agent
searches and reads official government websites (agencies, the Riksdag, the Government Offices,
regions, municipalities) and answers with links back to the sources.

The agency sites stay where they are — this is a layer on top of them.

```
sweden.gov/
├── api/   Hono on Bun — the agent, its tools, and the /ask event stream
└── web/   Astro — a static page with the prompt box
```

This is **not** a workspace: run commands inside `api/` or `web/`.

## Quick start

```bash
# 1. API
cd api
bun install
cp .env.example .env        # set OPENAI_COMPATIBLE_BASE_URL, OPENAI_COMPATIBLE_API_KEY, OPENAI_COMPATIBLE_MODEL
bun run dev                 # http://localhost:3000

# 2. Website (another terminal)
cd web
bun install
cp .env.example .env        # PUBLIC_API_URL=http://localhost:3000
bun run dev                 # http://localhost:4321
```

## Configuration (`api/.env`)

| Variable | |
| --- | --- |
| `OPENAI_COMPATIBLE_BASE_URL` | Any OpenAI-compatible API root (OpenAI, Berget, Mistral, OpenRouter, Ollama, vLLM…) |
| `OPENAI_COMPATIBLE_API_KEY` | Its key |
| `OPENAI_COMPATIBLE_MODEL` | Model id — **must support tool calling** |
| `SEARCH_PROVIDERS` | Fallback order, default `searxng,brave,duckduckgo` (unconfigured ones are skipped) |
| `SEARCH_COOLDOWN_SECONDS` | How long a blocked/rate-limited provider is skipped (default 300) |
| `SEARXNG_URL` | Your own SearXNG instance (JSON format enabled) |
| `SEARXNG_BEARER_KEY` | Optional: sent as `Authorization: Bearer <key>` to a SearXNG behind an auth proxy |
| `SEARXNG_ENGINES` | Optional: engines to ask per search, e.g. `yahoo,resulthunter,zapmeta,google` |
| `BRAVE_SEARCH_API_KEY` | Brave Search API — a dependable fallback (`BRAVE_MIN_INTERVAL_MS`, default 1100, respects the free plan's 1 req/s) |
| `FRONTEND_URL` | CORS origin(s) of the website, comma-separated |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MINUTES` | Questions per IP per window (default 20 / 10 min) |
| `TRUST_PROXY` | `true` only behind a reverse proxy you control |

Search is a fallback chain: each search tries the providers in order, and one that fails or gets
rate-limited sits out a cooldown. SearXNG answering "200, zero results" while its engines are
blocked counts as a failure, and the failing engines are logged (`[search] searxng engines
failing: …`). If every provider is down, the agent browses from the agency's start page by
following links instead.

## How it works

- `POST /ask` takes the conversation (`{ messages: [{ role, content }] }`, kept in the browser) and
  streams Server-Sent Events: `search`, `search-results`, `read`, `read-done`, `text`,
  `text-reset`, `done` (with sources), `error`.
- The agent (`api/src/libs/agent/`) is one AI SDK `streamText` loop with two tools:
  - `search_government_sites` — web search scoped with `site:` filters to the chosen agencies;
    anything off the allowlist is dropped.
  - `read_government_page` — fetches a page on an allowlisted host (SSRF-guarded on every redirect
    hop), returns readable text plus the page's links so the agent can click through.
- `api/src/libs/sites/GovSites.ts` is the allowlist and the trust boundary: ~150 agencies, regions
  and the largest municipalities. Add a domain there to make it searchable and readable.
- `GET /sites` lists the catalog (shown in the site footer). In dev, `/reference` has API docs.

## Scripts

| | api | web |
| --- | --- | --- |
| dev | `bun run dev` | `bun run dev` |
| check | `bun run typecheck`, `bun test` | `bun run typecheck` |
| production | `bun run start` (or the Dockerfile) | `bun run build` → static `dist/` |

## Deployment

Each app has its own `Dockerfile`; build them from `api/` and `web/` respectively.

### api — `api/Dockerfile`

Bun running the TypeScript directly, listening on port **3000** (`PORT` to change it), with a
health check on `/ping`. All configuration is runtime environment variables:

| Variable | |
| --- | --- |
| `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_API_KEY`, `OPENAI_COMPATIBLE_MODEL` | Required. The model must support tool calling |
| `FRONTEND_URL` | Required. The website's public origin, e.g. `https://sweden.example.se` (CORS) |
| `TRUST_PROXY` | `true` behind a reverse proxy (`cloudflare` if Cloudflare is in front). Without it, every visitor shares one rate limit |
| `SEARXNG_URL`, `SEARXNG_BEARER_KEY`, `SEARXNG_ENGINES`, `BRAVE_SEARCH_API_KEY` | Search, see above |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MINUTES` | Optional |

`ENVIRONMENT=production` is set in the image (API docs off). The api logs a warning at startup if
`FRONTEND_URL` or `TRUST_PROXY` looks unset.

### web — `web/Dockerfile`

A static build served by nginx on port **80**, with a health check on `/`.

| Build argument | |
| --- | --- |
| `PUBLIC_API_URL` | Required **at build time** — the api's public URL, e.g. `https://api.sweden.example.se`. It's compiled into the page, so changing it means rebuilding. The build fails if it's missing |

Hashed assets (`/_astro/*`) are cached for a year; the page itself is always revalidated, so a
new deploy shows up immediately.
