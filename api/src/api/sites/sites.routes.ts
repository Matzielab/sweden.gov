import { createRoute, z } from "@hono/zod-openapi"
import { createRouter } from "@/libs/app/AppHelpers"
import { jsonContent } from "@/libs/utils/JsonContent"
import { CATEGORY_LABELS, GOV_SITES } from "@/libs/sites/GovSites"

/** The government sites the service searches — shown on the site's "about" section. */
export const sitesRouter = createRouter()

const SITES_RESPONSE = z.object({
  count: z.number(),
  categories: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      sites: z.array(z.object({ domain: z.string(), name: z.string() })),
    }),
  ),
})

const sitesRoute = createRoute({
  operationId: "listSites",
  method: "get",
  path: "/sites",
  responses: {
    200: jsonContent(SITES_RESPONSE, "Searchable government sites, grouped"),
  },
})

sitesRouter.openapi(sitesRoute, (c) => {
  const categories = Object.entries(CATEGORY_LABELS).map(([id, label]) => ({
    id,
    label,
    sites: GOV_SITES.filter((s) => s.category === id).map(({ domain, name }) => ({
      domain,
      name,
    })),
  }))
  c.header("Cache-Control", "public, max-age=3600")
  return c.json({ count: GOV_SITES.length, categories }, 200)
})
