import { createRoute, z } from "@hono/zod-openapi"
import { jsonContent } from "@/libs/utils/JsonContent"
import { createRouter } from "@/libs/app/AppHelpers"

export const pingRouter = createRouter()

const pingRoute = createRoute({
  method: "get",
  path: "/ping",
  tags: ["robot"],
  responses: {
    200: jsonContent(
      z.object({ pong: z.boolean().openapi({ example: true }) }),
      "Returns pong if the server is running",
    ),
  },
})

pingRouter.openapi(pingRoute, (c) => c.json({ pong: true }, 200))
