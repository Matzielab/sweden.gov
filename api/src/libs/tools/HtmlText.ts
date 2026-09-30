/**
 * Just enough HTML-to-text for a model to read an agency page — no DOM, no
 * dependency. Government pages are mostly well-formed and content-heavy, so
 * regexes plus a preference for <main>/<article> go a long way.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  auml: "ä",
  Auml: "Ä",
  aring: "å",
  Aring: "Å",
  ouml: "ö",
  Ouml: "Ö",
  eacute: "é",
  Eacute: "É",
  uuml: "ü",
  Uuml: "Ü",
  euro: "€",
  copy: "©",
}

export const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code =
        entity[1] === "x" || entity[1] === "X"
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : match
    }
    return NAMED_ENTITIES[entity] ?? match
  })

/** Inline HTML (a search snippet, a title) → plain text. */
export const stripTags = (html: string): string =>
  decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim()

const firstMatch = (html: string, pattern: RegExp) => pattern.exec(html)?.[1]

export const extractTitle = (html: string): string => {
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
  return title ? stripTags(title) : ""
}

export type PageLink = { text: string; url: string }

const SKIPPED_EXTENSIONS = /\.(jpe?g|png|gif|svg|webp|ico|css|js|zip|mp4|mp3|xml)(\?|#|$)/i

/**
 * The page's links as absolute URLs with their text — what lets the agent
 * browse an agency site like a person would (start page → "Pass" → the
 * right page) instead of guessing deep URLs. Links in <main> come first,
 * since that's where the content is; navigation fills the remainder.
 */
export const extractLinks = (html: string, baseUrl: string, limit: number): PageLink[] => {
  const cleaned = html.replace(/<!--[\s\S]*?-->/g, "")
  const main =
    firstMatch(cleaned, /<main[^>]*>([\s\S]*?)<\/main>/i) ??
    firstMatch(cleaned, /<article[^>]*>([\s\S]*?)<\/article>/i) ??
    ""

  const links: PageLink[] = []
  const seen = new Set<string>()
  const collect = (fragment: string) => {
    const pattern = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi
    let match: RegExpExecArray | null
    while ((match = pattern.exec(fragment)) !== null && links.length < limit) {
      const href = decodeEntities((match[1] ?? match[2] ?? "").trim())
      if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue

      let url: URL
      try {
        url = new URL(href, baseUrl)
      } catch {
        continue
      }
      if (url.protocol !== "https:" && url.protocol !== "http:") continue
      if (SKIPPED_EXTENSIONS.test(url.pathname)) continue
      url.hash = ""

      // Link text, or an image's alt / the aria-label when there is none
      const text = (
        stripTags(match[3]) ||
        /aria-label\s*=\s*"([^"]+)"/i.exec(match[0])?.[1] ||
        /alt\s*=\s*"([^"]+)"/i.exec(match[3])?.[1] ||
        ""
      ).slice(0, 100)
      if (text.length < 2) continue

      const key = url.toString()
      if (seen.has(key)) continue
      seen.add(key)
      links.push({ text, url: key })
    }
  }

  collect(main)
  collect(cleaned)
  return links
}

/**
 * The readable text of a page. Prefers <main>, then <article>, then <body>,
 * and keeps paragraph/heading/list boundaries as newlines so the model sees
 * structure rather than one enormous line.
 */
export const htmlToText = (html: string): string => {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|template|iframe)[^>]*>[\s\S]*?<\/\1>/gi, "")

  const region =
    firstMatch(cleaned, /<main[^>]*>([\s\S]*?)<\/main>/i) ??
    firstMatch(cleaned, /<article[^>]*>([\s\S]*?)<\/article>/i) ??
    firstMatch(cleaned, /<body[^>]*>([\s\S]*?)<\/body>/i) ??
    cleaned

  const withoutChrome = region.replace(
    /<(nav|header|footer|aside|form)[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  )

  return decodeEntities(
    withoutChrome
      .replace(/<(h[1-6])[^>]*>/gi, "\n\n## ")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<(br|hr)\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|section|h[1-6]|ul|ol|table|tr|dl|dd|dt|blockquote)>/gi, "\n")
      .replace(/<(td|th)[^>]*>/gi, " | ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
