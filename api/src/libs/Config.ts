const isProduction = process.env.ENVIRONMENT === "production"

const intEnv = (name: string, fallback: number) => {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Environment variable ${name} must be a non-negative integer`)
  }
  return value
}

/** "a, b,,c" → ["a", "b", "c"]; unset or empty → undefined */
const listEnv = (name: string) => {
  const items = (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}

const parseTrustProxy = (raw: string | undefined): "proxy" | "cloudflare" | false => {
  const value = raw?.trim().toLowerCase()
  if (!value || value === "false") return false
  if (value === "true") return "proxy"
  if (value === "cloudflare") return "cloudflare"
  throw new Error('TRUST_PROXY must be "true", "cloudflare" or "false"')
}

/** Strips a trailing slash so `${baseUrl}/chat/completions` never doubles up. */
const trimSlash = (value: string | undefined) =>
  value?.trim().replace(/\/+$/, "") || undefined

export default {
  port: intEnv("PORT", 3000),
  isProduction,
  isDev: !isProduction,

  // CORS origin(s), comma-separated. The Astro dev server runs on 4321.
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:4321",
  frontendUrlIsSet: Boolean(process.env.FRONTEND_URL),

  /**
   * Any OpenAI-compatible chat completions endpoint: OpenAI itself, Berget,
   * Mistral, OpenRouter, Groq, Together, a local Ollama/vLLM/LM Studio… The
   * model must support tool calling — the whole service is one agent loop
   * over the search tools.
   */
  llm: {
    baseUrl:
      trimSlash(process.env.OPENAI_COMPATIBLE_BASE_URL) || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_COMPATIBLE_API_KEY || undefined,
    model: process.env.OPENAI_COMPATIBLE_MODEL || undefined,
    // Tool round trips before the model must answer with what it has
    maxSteps: intEnv("AGENT_MAX_STEPS", 8),
    temperature: process.env.OPENAI_COMPATIBLE_TEMPERATURE
      ? Number(process.env.OPENAI_COMPATIBLE_TEMPERATURE)
      : undefined,
  },

  /**
   * Search is a fallback chain: each search tries the providers in order and
   * the first one that answers wins. A provider that gets blocked sits out a
   * cooldown instead of slowing every search down.
   */
  search: {
    // Order of the chain. Providers that aren't configured are skipped.
    order: listEnv("SEARCH_PROVIDERS") ?? ["searxng", "brave", "duckduckgo"],
    // Seconds a blocked/rate-limited provider is skipped for
    cooldownSeconds: intEnv("SEARCH_COOLDOWN_SECONDS", 300),

    braveApiKey: process.env.BRAVE_SEARCH_API_KEY || undefined,
    // Brave's free plan allows 1 request/second; searches are spaced this far apart
    braveMinIntervalMs: intEnv("BRAVE_MIN_INTERVAL_MS", 1100),

    searxngUrl: trimSlash(process.env.SEARXNG_URL),
    // For an instance behind an auth proxy: sent as `Authorization: Bearer <key>`
    searxngBearerKey: process.env.SEARXNG_BEARER_KEY?.trim() || undefined,
    // Which SearXNG engines to query, e.g. "bing,startpage,mojeek,qwant".
    // Unset = the instance's enabled defaults.
    searxngEngines: listEnv("SEARXNG_ENGINES"),
  },

  rateLimit: {
    // Questions per IP per window. 0 disables the limit.
    maxRequests: intEnv("RATE_LIMIT_MAX", 20),
    windowMs: intEnv("RATE_LIMIT_WINDOW_MINUTES", 10) * 60_000,
    // Which forwarding headers carry the real client IP — see request/GetIp.ts
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  },
}
