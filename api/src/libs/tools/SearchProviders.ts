import Config from "@/libs/Config"
import { BROWSER_USER_AGENT, readCapped, WebToolError } from "./SafeFetch"
import { stripTags } from "./HtmlText"

export type SearchResult = { title: string; url: string; snippet: string }

/**
 * Raw web search. Callers pass a query that already carries its `site:`
 * filters; results are filtered against the government allowlist afterwards
 * in GovSearch, so a provider that ignores an operator can't leak other sites
 * into an answer.
 *
 * Search is a fallback chain (SEARCH_PROVIDERS, default searxng → brave →
 * duckduckgo): the first provider that answers wins. One that gets blocked or
 * rate-limited sits out a cooldown, so a dead provider doesn't add its
 * timeout to every search while it recovers.
 */

/** What a provider hands back. `degraded`: it answered, but its own sources failed. */
export type ProviderAnswer = { results: SearchResult[]; degraded?: string }

export type SearchProvider = {
  name: string
  search: (query: string) => Promise<ProviderAnswer>
  /** Minimum spacing between two calls, for APIs with a per-second limit. */
  minIntervalMs?: number
}

/** A provider failure; `blocked` means rate-limited or refused, worth a long cooldown. */
export class SearchProviderError extends WebToolError {
  constructor(
    message: string,
    public blocked: boolean,
  ) {
    super(message)
  }
}

const SEARCH_TIMEOUT_MS = 10_000
// A timeout or a 5xx is often momentary; being blocked isn't
const TRANSIENT_COOLDOWN_MS = 30_000

/**
 * Search endpoints are fixed or operator-configured, not model-chosen, so
 * they skip the SSRF guard — which would otherwise refuse a SearXNG running
 * on localhost or a private network.
 */
const trustedFetch = async (provider: string, url: string, init: RequestInit = {}) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...init,
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.7",
        ...init.headers,
      },
      signal: controller.signal,
    })
  } catch {
    throw new SearchProviderError(`${provider} is unreachable`, false)
  } finally {
    clearTimeout(timeout)
  }
}

/** 401/402/403/429 (and DDG's 202 captcha) mean "go away for a while". */
const isBlockedStatus = (status: number) => [202, 401, 402, 403, 429].includes(status)

const failed = async (response: Response, provider: string): Promise<never> => {
  await response.body?.cancel().catch(() => {})
  throw new SearchProviderError(
    `${provider} returned ${response.status}`,
    isBlockedStatus(response.status),
  )
}

const readJson = async <T>(response: Response, provider: string, hint = ""): Promise<T> => {
  try {
    return JSON.parse(await readCapped(response)) as T
  } catch {
    throw new SearchProviderError(`${provider} didn't return JSON${hint}`, false)
  }
}

// ---------- providers ----------

/**
 * DuckDuckGo's HTML endpoint, scraped — the same keyless source watzie uses.
 * It blocks servers that search a lot (403/202 with a captcha), which is why
 * it's the last resort.
 */
const duckDuckGo = (): SearchProvider => ({
  name: "duckduckgo",
  search: async (query) => {
    const response = await trustedFetch("duckduckgo", "https://html.duckduckgo.com/html/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://html.duckduckgo.com/",
      },
      // kl=se-sv: Swedish region and language
      body: new URLSearchParams({ q: query, kl: "se-sv" }),
    })
    if (response.status !== 200) return failed(response, "duckduckgo")
    return { results: parseDuckDuckGoHtml(await readCapped(response)) }
  },
})

export const parseDuckDuckGoHtml = (html: string): SearchResult[] => {
  const results: SearchResult[] = []

  // One block per result: the title link, then (usually) a snippet link
  const blocks = html.split(/<div[^>]+class="[^"]*\bresult\b[^"]*"/i).slice(1)
  for (const block of blocks) {
    const link = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block)
    if (!link) continue
    const snippet = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block)

    const rawUrl = link[1].replace(/&amp;/g, "&")
    // DuckDuckGo wraps results in a redirect — the real URL is the uddg param
    const uddg = rawUrl.match(/[?&]uddg=([^&]+)/)
    const url = uddg
      ? decodeURIComponent(uddg[1])
      : rawUrl.startsWith("//")
        ? `https:${rawUrl}`
        : rawUrl

    results.push({
      title: stripTags(link[2]),
      url,
      snippet: snippet ? stripTags(snippet[1]) : "",
    })
  }

  return results
}

/** Brave Search API — https://api-dashboard.search.brave.com */
const brave = (apiKey: string, minIntervalMs: number): SearchProvider => ({
  name: "brave",
  minIntervalMs,
  search: async (query) => {
    const params = new URLSearchParams({
      q: query,
      count: "10",
      country: "SE",
      search_lang: "sv",
      safesearch: "moderate",
    })
    const response = await trustedFetch(
      "brave",
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      { headers: { Accept: "application/json", "X-Subscription-Token": apiKey } },
    )
    if (!response.ok) return failed(response, "brave")

    const json = await readJson<{
      web?: { results?: { title?: string; url?: string; description?: string }[] }
    }>(response, "brave")
    return {
      results: (json.web?.results ?? [])
        .filter((r) => typeof r.url === "string")
        .map((r) => ({
          title: stripTags(r.title ?? ""),
          url: r.url as string,
          snippet: stripTags(r.description ?? ""),
        })),
    }
  },
})

/**
 * A SearXNG instance (https://docs.searxng.org). The JSON format must be
 * enabled in its settings.yml: `search: formats: [html, json]`.
 *
 * - SEARXNG_BEARER_KEY: sent as `Authorization: Bearer <key>` for an instance
 *   behind an auth proxy.
 * - SEARXNG_ENGINES: which of its engines to ask, per request.
 *
 * SearXNG answers 200 even when every engine behind it is rate-limited — it
 * just lists them in `unresponsive_engines`. Zero results plus failed
 * engines is therefore reported as degraded, so the chain moves on.
 */
const searxng = (
  baseUrl: string,
  bearerKey: string | undefined,
  engines: string[] | undefined,
): SearchProvider => ({
  name: "searxng",
  search: async (query) => {
    const params = new URLSearchParams({ q: query, format: "json", language: "sv-SE" })
    if (engines) params.set("engines", engines.join(","))

    const response = await trustedFetch("searxng", `${baseUrl}/search?${params}`, {
      headers: {
        Accept: "application/json",
        ...(bearerKey ? { Authorization: `Bearer ${bearerKey}` } : {}),
      },
    })
    if (response.status === 401 || response.status === 403) {
      console.warn(
        `[search] searxng refused the request (${response.status}) — ` +
          (bearerKey ? "check SEARXNG_BEARER_KEY" : "does it need SEARXNG_BEARER_KEY?"),
      )
    }
    if (!response.ok) return failed(response, "searxng")

    // An auth proxy or a disabled JSON format answers 200 with HTML
    const json = await readJson<{
      results?: { title?: string; url?: string; content?: string }[]
      unresponsive_engines?: [string, string][]
    }>(response, "searxng", " — enable `json` under search.formats in settings.yml")

    const results = (json.results ?? [])
      .filter((r) => typeof r.url === "string")
      .map((r) => ({
        title: stripTags(r.title ?? ""),
        url: r.url as string,
        snippet: stripTags(r.content ?? ""),
      }))

    const unresponsive = (json.unresponsive_engines ?? [])
      .map(([engine, reason]) => `${engine} (${reason})`)
      .join(", ")
    if (unresponsive) warnOncePerMinute(`searxng engines failing: ${unresponsive}`)

    return { results, degraded: results.length === 0 && unresponsive ? unresponsive : undefined }
  },
})

const lastWarned = new Map<string, number>()
const warnOncePerMinute = (message: string) => {
  const now = Date.now()
  if ((lastWarned.get(message) ?? 0) > now - 60_000) return
  lastWarned.set(message, now)
  console.warn(`[search] ${message}`)
}

// ---------- the chain ----------

export const createSearchChain = (
  providers: SearchProvider[],
  { cooldownMs, now = () => Date.now() }: { cooldownMs: number; now?: () => number },
) => {
  const coolingUntil = new Map<string, number>()
  // Per-provider queue, so parallel tool calls don't break a per-second limit
  const nextSlot = new Map<string, number>()

  const waitForSlot = async (provider: SearchProvider) => {
    if (!provider.minIntervalMs) return
    const at = Math.max(now(), nextSlot.get(provider.name) ?? 0)
    nextSlot.set(provider.name, at + provider.minIntervalMs)
    const wait = at - now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  }

  const coolDown = (provider: SearchProvider, ms: number, why: string) => {
    coolingUntil.set(provider.name, now() + ms)
    console.warn(`[search] ${provider.name} skipped for ${Math.round(ms / 1000)}s: ${why}`)
  }

  return async (query: string): Promise<SearchResult[]> => {
    const failures: string[] = []

    for (const [index, provider] of providers.entries()) {
      const until = coolingUntil.get(provider.name) ?? 0
      if (until > now()) {
        failures.push(`${provider.name} cooling down`)
        continue
      }

      try {
        await waitForSlot(provider)
        const { results, degraded } = await provider.search(query)
        if (degraded) {
          coolDown(provider, TRANSIENT_COOLDOWN_MS, `no results, sources failing: ${degraded}`)
          failures.push(`${provider.name}: sources failing`)
          continue
        }
        if (index > 0) {
          console.log(`[search] served by fallback ${provider.name} (${failures.join("; ")})`)
        }
        return results
      } catch (e) {
        const blocked = e instanceof SearchProviderError && e.blocked
        const message = e instanceof Error ? e.message : String(e)
        coolDown(provider, blocked ? cooldownMs : TRANSIENT_COOLDOWN_MS, message)
        failures.push(message)
      }
    }

    // The agent reads this and falls back to browsing agency sites directly
    throw new WebToolError(
      `Search is temporarily unavailable (${failures.join("; ") || "no search provider configured"}). Browse the agency's start page and follow its links instead.`,
    )
  }
}

const buildProviders = (): SearchProvider[] => {
  const { braveApiKey, braveMinIntervalMs, searxngUrl, searxngBearerKey, searxngEngines } =
    Config.search

  const available: Record<string, () => SearchProvider | undefined> = {
    searxng: () =>
      searxngUrl ? searxng(searxngUrl, searxngBearerKey, searxngEngines) : undefined,
    brave: () => (braveApiKey ? brave(braveApiKey, braveMinIntervalMs) : undefined),
    duckduckgo: () => duckDuckGo(),
  }

  const providers: SearchProvider[] = []
  for (const name of Config.search.order) {
    const make = available[name]
    if (!make) {
      console.warn(`[config] SEARCH_PROVIDERS: unknown provider "${name}" ignored`)
      continue
    }
    const provider = make()
    if (provider) providers.push(provider)
  }
  return providers
}

const providers = buildProviders()

export const searchProviderName =
  providers
    .map((p) =>
      p.name === "searxng"
        ? `searxng${Config.search.searxngBearerKey ? " (bearer auth)" : ""}${Config.search.searxngEngines ? ` [${Config.search.searxngEngines.join(",")}]` : ""}`
        : p.name,
    )
    .join(" → ") || "none"

export const rawSearch = createSearchChain(providers, {
  cooldownMs: Config.search.cooldownSeconds * 1000,
})
