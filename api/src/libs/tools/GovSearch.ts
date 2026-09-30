import { isGovUrl, resolveSearchDomains, siteNameForUrl } from "@/libs/sites/GovSites"
import { guardedFetch, readCapped, WebToolError } from "./SafeFetch"
import { extractLinks, extractTitle, htmlToText, type PageLink } from "./HtmlText"
import { rawSearch, type SearchResult } from "./SearchProviders"

export type GovSearchResult = SearchResult & { site: string }

const MAX_RESULTS = 8
const MAX_PAGE_CHARS = 12_000
const MAX_LINKS = 50
const CACHE_TTL_MS = 10 * 60_000
const CACHE_MAX_ENTRIES = 500

/**
 * A small TTL cache in front of search and page reads. Many people ask the
 * same things ("hur mycket är föräldrapenningen?"), and every avoided search
 * is one less chance of the keyless search provider rate-limiting us.
 */
const createCache = <T>() => {
  const entries = new Map<string, { value: T; expiresAt: number }>()
  return {
    get: (key: string) => {
      const hit = entries.get(key)
      if (!hit) return undefined
      if (hit.expiresAt <= Date.now()) {
        entries.delete(key)
        return undefined
      }
      return hit.value
    },
    set: (key: string, value: T) => {
      // Map iterates in insertion order, so the first key is the oldest
      if (entries.size >= CACHE_MAX_ENTRIES) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
    },
  }
}

const searchCache = createCache<GovSearchResult[]>()
const pageCache = createCache<GovPage>()

/** `foo (site:a.se OR site:b.se)` */
export const buildScopedQuery = (query: string, domains: string[]) => {
  const scope = domains.map((d) => `site:${d}`).join(" OR ")
  return domains.length === 1 ? `${query} ${scope}` : `${query} (${scope})`
}

/** Search across Swedish government sites. Anything off the allowlist is dropped. */
export const searchGovSites = async (
  query: string,
  sites?: string[],
): Promise<{ domains: string[]; results: GovSearchResult[] }> => {
  const domains = resolveSearchDomains(sites)
  const scoped = buildScopedQuery(query.trim(), domains)

  const cached = searchCache.get(scoped)
  if (cached) return { domains, results: cached }

  const seen = new Set<string>()
  const results: GovSearchResult[] = []
  for (const result of await rawSearch(scoped)) {
    if (!isGovUrl(result.url)) continue
    const key = result.url.replace(/[#?].*$/, "").replace(/\/$/, "")
    if (seen.has(key)) continue
    seen.add(key)
    results.push({ ...result, site: siteNameForUrl(result.url) })
    if (results.length >= MAX_RESULTS) break
  }

  searchCache.set(scoped, results)
  return { domains, results }
}

export type GovPage = {
  url: string
  title: string
  site: string
  content: string
  truncated: boolean
  /** Government links on the page — for following to the right subpage. */
  links: PageLink[]
}

/** Reads a government page as text. Refuses — on every redirect hop — any non-government host. */
export const readGovPage = async (rawUrl: string): Promise<GovPage> => {
  if (!isGovUrl(rawUrl)) {
    throw new WebToolError(
      "Only pages on Swedish government sites from the catalog can be read",
    )
  }

  const cached = pageCache.get(rawUrl)
  if (cached) return cached

  const response = await guardedFetch(rawUrl, {
    allowUrl: (url) => isGovUrl(url.toString()),
  })
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    if (response.status === 404 || response.status === 410) {
      const root = `${new URL(rawUrl).origin}/`
      throw new WebToolError(
        `Page not found (${response.status}) — the URL is probably wrong. Don't guess URLs: read the site's start page (${root}) and follow its links, or search.`,
      )
    }
    throw new WebToolError(`The page answered HTTP ${response.status}`)
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("pdf")) {
    await response.body?.cancel().catch(() => {})
    throw new WebToolError(
      "This is a PDF, which can't be read here — cite it by its search snippet instead",
    )
  }
  if (!contentType.includes("html") && !contentType.includes("text")) {
    await response.body?.cancel().catch(() => {})
    throw new WebToolError(`Unsupported content type: ${contentType || "unknown"}`)
  }

  const raw = await readCapped(response)
  const isHtml = contentType.includes("html")
  const text = isHtml ? htmlToText(raw) : raw.trim()
  const finalUrl = response.url || rawUrl

  const page: GovPage = {
    url: finalUrl,
    title: isHtml ? extractTitle(raw) : "",
    site: siteNameForUrl(finalUrl),
    content: text.slice(0, MAX_PAGE_CHARS),
    truncated: text.length > MAX_PAGE_CHARS,
    links: isHtml
      ? extractLinks(raw, finalUrl, MAX_LINKS * 3)
          .filter((link) => isGovUrl(link.url) && link.url !== finalUrl)
          .slice(0, MAX_LINKS)
      : [],
  }
  pageCache.set(rawUrl, page)
  return page
}
