import { pingRouter } from "./api/ping/ping.routes"
import { askRouter } from "./api/ask/ask.routes"
import { sitesRouter } from "./api/sites/sites.routes"
import { createApp } from "./libs/app/AppHelpers"
import { describeModel, isModelConfigured } from "./libs/agent/Model"
import { searchProviderName } from "./libs/tools/SearchProviders"
import Config from "./libs/Config"

if (!isModelConfigured()) {
  console.warn(
    "[config] OPENAI_COMPATIBLE_MODEL is not set — /ask will answer 503 until OPENAI_COMPATIBLE_BASE_URL, OPENAI_COMPATIBLE_API_KEY and OPENAI_COMPATIBLE_MODEL are configured in .env",
  )
} else {
  console.log(`[config] model: ${describeModel()} · search: ${searchProviderName}`)
}

// Production misconfigurations that don't crash, but quietly break the site
if (Config.isProduction) {
  if (!Config.frontendUrlIsSet) {
    console.warn(
      "[config] FRONTEND_URL is not set — browsers on your real domain will be blocked by CORS",
    )
  }
  if (!Config.rateLimit.trustProxy && Config.rateLimit.maxRequests > 0) {
    console.warn(
      "[config] TRUST_PROXY is off — behind a reverse proxy, every visitor shares one rate limit. Set TRUST_PROXY=true (or cloudflare).",
    )
  }
}

const app = createApp()

// Add routes
const routes = [pingRouter, askRouter, sitesRouter]

routes.forEach((route) => {
  app.route("/", route)
})

/**
 * Bun closes a connection idle for `idleTimeout` seconds (default 10), and a
 * handler still awaiting counts as idle. /ask additionally opts out per
 * request while the model thinks; this covers everything else.
 */
export default {
  port: Config.port,
  idleTimeout: 60,
  fetch: app.fetch,
}
