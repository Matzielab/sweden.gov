import { createMiddleware } from "hono/factory"
import Config from "@/libs/Config"
import { getIP } from "@/libs/request/GetIp"
import { rateLimitedResponse } from "@/libs/error/ErrorResponses"

/**
 * Fixed-window, in-memory, per-IP limit.
 *
 * Every question spends the operator's LLM key and search quota, and the site
 * has no login — so this is the only thing between a script and the bill.
 * In-memory is fine for a single instance; several replicas would each keep
 * their own count.
 */
type Window = { count: number; resetAt: number }

export const createRateLimiter = (maxRequests: number, windowMs: number) => {
  const windows = new Map<string, Window>()

  // Drop expired windows now and then so the map can't grow forever
  const sweep = setInterval(() => {
    const now = Date.now()
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key)
    }
  }, windowMs)
  sweep.unref?.()

  /** Returns seconds to wait, or 0 when the request may proceed. */
  const hit = (key: string, now = Date.now()): number => {
    if (maxRequests === 0) return 0
    const window = windows.get(key)
    if (!window || window.resetAt <= now) {
      windows.set(key, { count: 1, resetAt: now + windowMs })
      return 0
    }
    if (window.count >= maxRequests) return Math.ceil((window.resetAt - now) / 1000)
    window.count++
    return 0
  }

  return { hit }
}

const limiter = createRateLimiter(Config.rateLimit.maxRequests, Config.rateLimit.windowMs)

export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  const retryAfter = limiter.hit(getIP(c))
  if (retryAfter > 0) {
    c.header("Retry-After", String(retryAfter))
    return c.json(rateLimitedResponse, rateLimitedResponse.httpStatus)
  }
  await next()
})
