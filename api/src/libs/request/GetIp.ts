import { Context } from "hono"
import { getConnInfo } from "hono/bun"
import Config from "@/libs/Config"

/**
 * The caller's IP, for rate limiting.
 *
 * Behind a reverse proxy every request comes from the proxy, so without
 * TRUST_PROXY all visitors would share one rate-limit bucket. But forwarding
 * headers are only honest when a proxy we control sets them — otherwise a
 * client could send a fresh one with every request and never be limited:
 *
 * - TRUST_PROXY=true       → X-Real-IP, else the first X-Forwarded-For entry,
 *                            as set by a reverse proxy (Traefik, Caddy, nginx)
 * - TRUST_PROXY=cloudflare → CF-Connecting-IP (only honest behind Cloudflare)
 * - unset                  → the socket's address
 */
export const getIP = (c: Context): string => {
  const mode = Config.rateLimit.trustProxy

  if (mode === "cloudflare") {
    const ip = c.req.header("cf-connecting-ip")?.trim()
    if (ip) return ip
  } else if (mode === "proxy") {
    const ip =
      c.req.header("x-real-ip")?.trim() || c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    if (ip) return ip
  }

  try {
    return getConnInfo(c).remote.address ?? "unknown"
  } catch {
    // Not served by Bun (tests) — no socket to read
    return "unknown"
  }
}
