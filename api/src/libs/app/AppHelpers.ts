import { cors } from "hono/cors"
import { OpenAPIHono } from "@hono/zod-openapi"
import { Scalar } from "@scalar/hono-api-reference"
import { errorHandler, notFoundHandler } from "@/libs/error/ErrorHandler"
import { invalidDataResponse } from "@/libs/error/ErrorResponses"
import packageJson from "../../../package.json"
import Config from "@/libs/Config"

const getCorsConfig = () => ({
  origin: Config.frontendUrl.split(",").map((origin) => origin.trim()),
  allowMethods: ["GET", "POST"],
  allowHeaders: ["Content-Type"],
  maxAge: 3600,
})

export const createRouter = () => {
  return new OpenAPIHono({
    strict: false,
    defaultHook: (result, c) => {
      if (!result.success) {
        console.error(`Validation error - ${result.error}`)
        return c.json(invalidDataResponse, invalidDataResponse.httpStatus)
      }
    },
  })
}

export const createApp = () => {
  const app = createRouter()

  app.use("/*", cors(getCorsConfig()))

  app.onError(errorHandler)
  app.notFound(notFoundHandler)

  // The spec and its UI are dev-only
  if (Config.isDev) {
    app.doc("/doc", {
      openapi: "3.0.0",
      info: { version: packageJson.version, title: "sweden.gov API" },
    })
    app.get("/reference", Scalar({ url: "/doc" }))
  }

  return app
}
