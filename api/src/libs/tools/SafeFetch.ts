import dns from "node:dns/promises"
import net from "node:net"

/**
 * Outbound HTTP for the agent's tools, guarded against SSRF.
 *
 * The page reader takes a URL the *model* chose — ultimately steerable by
 * whoever typed the question — and turns it into our server making a request.
 * The government-domain allowlist already narrows that a lot, but DNS for an
 * allowed name could still point somewhere private, and an allowed host could
 * redirect anywhere. So every hop is resolved and checked. (Ported from watzie.)
 */

const FETCH_TIMEOUT_MS = 12_000
const MAX_BODY_BYTES = 3_000_000
const MAX_REDIRECTS = 4
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

export class WebToolError extends Error {}

const isBlockedIpv4 = (address: string): boolean => {
  const [a, b] = address.split(".").map(Number)
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  if (a >= 224) return true // multicast and reserved
  return false
}

/** `::ffff:7f00:1` → the eight numeric hextets, `::` expanded. */
const hextetsOf = (address: string): number[] | null => {
  const [head, tail] = address.split("::")
  const parse = (part: string) =>
    part ? part.split(":").filter(Boolean).map((h) => parseInt(h, 16)) : []
  const left = parse(head)
  const right = tail === undefined ? [] : parse(tail)
  if (address.includes("::")) {
    const gap = 8 - left.length - right.length
    if (gap < 0) return null
    return [...left, ...new Array(gap).fill(0), ...right]
  }
  return left.length === 8 ? left : null
}

/** An IPv4 address wearing IPv6 clothing (mapped, compatible, NAT64), or null. */
const embeddedIpv4 = (hextets: number[]): string | null => {
  const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets
  const isMapped = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff
  const isCompatible = h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0
  const isNat64 = h0 === 0x64 && h1 === 0xff9b
  if (!isMapped && !isCompatible && !isNat64) return null
  return [h6 >> 8, h6 & 0xff, h7 >> 8, h7 & 0xff].join(".")
}

export const isBlockedAddress = (address: string): boolean => {
  const version = net.isIP(address)
  if (version === 4) return isBlockedIpv4(address)
  if (version !== 6) return true

  const lower = address.toLowerCase()
  if (lower === "::" || lower === "::1") return true
  if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true
  }

  // Unparseable is blocked rather than allowed — this is a deny gate
  const hextets = hextetsOf(lower)
  if (!hextets) return true

  const v4 = embeddedIpv4(hextets)
  if (v4) return isBlockedIpv4(v4)

  return false
}

/** Throws unless the URL is public http(s). Resolves DNS, since a hostname can point anywhere. */
const assertPublicUrl = async (raw: string) => {
  const url = (() => {
    try {
      return new URL(raw)
    } catch {
      throw new WebToolError("That doesn't look like a valid URL")
    }
  })()

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new WebToolError("Only http and https URLs can be fetched")
  }

  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new WebToolError("That address isn't reachable")
    return url
  }

  let addresses: { address: string }[]
  try {
    addresses = await dns.lookup(host, { all: true })
  } catch {
    throw new WebToolError("Couldn't resolve that host")
  }

  // Every answer must be public, or a mixed answer becomes a coin flip
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new WebToolError("That address isn't reachable")
  }

  return url
}

type GuardedFetchOptions = {
  method?: "GET" | "POST"
  headers?: Record<string, string>
  body?: string | URLSearchParams
  /** Checked on every hop, so an allowed host can't redirect somewhere that isn't. */
  allowUrl?: (url: URL) => boolean
}

/**
 * Fetch with the guard applied to every hop. Redirects are followed by hand:
 * the automatic follower would only check the URL we started with.
 */
export const guardedFetch = async (
  raw: string,
  options: GuardedFetchOptions = {},
): Promise<Response> => {
  let target = raw
  let method = options.method ?? "GET"
  let body = options.body

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(target)
    if (options.allowUrl && !options.allowUrl(url)) {
      throw new WebToolError(`${url.hostname} is not an allowed government site`)
    }

    // Manual controller, cleared once headers arrive — an AbortSignal.timeout
    // would stay attached to the body and truncate it
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(url.toString(), {
        method,
        body,
        headers: {
          "User-Agent": BROWSER_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain,*/*",
          "Accept-Language": "sv-SE,sv;q=0.9,en;q=0.7",
          ...options.headers,
        },
        redirect: "manual",
        signal: controller.signal,
      })
    } catch {
      throw new WebToolError("Couldn't reach that page")
    } finally {
      clearTimeout(timeout)
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new WebToolError("That page redirected nowhere")
      await response.body?.cancel().catch(() => {})
      target = new URL(location, url).toString()
      // 303 (and, by browser convention, 301/302 after a POST) continue as GET
      if (response.status !== 307 && response.status !== 308) {
        method = "GET"
        body = undefined
      }
      continue
    }

    return response
  }

  throw new WebToolError("That page redirected too many times")
}

/** Reads at most MAX_BODY_BYTES, so a huge response can't exhaust memory. */
export const readCapped = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader()
  if (!reader) return ""

  const chunks: Uint8Array[] = []
  let total = 0
  while (total < MAX_BODY_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  await reader.cancel().catch(() => {})

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(merged)
}
