import { z } from "@hono/zod-openapi"

export const ErrorResponseCode = z.enum([
  "GENERAL_ERROR",
  "INVALID_DATA",
  "NOT_FOUND",
  "RATE_LIMITED",
  "MODEL_NOT_CONFIGURED",
])

export const ErrorResponseSchema = z.object({
  errorCode: ErrorResponseCode,
  errorMessage: z.string(),
  httpStatus: z.number(),
  ok: z.literal(false),
})
