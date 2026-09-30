import { z } from "zod"
import { Context } from "hono"
import { streamSSE } from "hono/streaming"
import { createRouter } from "@/libs/app/AppHelpers"
import { rateLimitMiddleware } from "@/libs/middlewares/RateLimitMiddleware"
import { invalidDataResponse, modelNotConfiguredResponse } from "@/libs/error/ErrorResponses"
import { runAgent } from "@/libs/agent/Agent"
import { isModelConfigured } from "@/libs/agent/Model"

/**
 * POST /ask — the prompt box.
 *
 * Takes the conversation so far and streams the agent's work back as
 * Server-Sent Events: what it searches and reads, the answer text as it's
 * written, and finally the sources. A plain Hono handler rather than
 * createRoute, like watzie's streaming routes: the response is an event
 * stream, not a JSON document our OpenAPI spec could describe.
 *
 * The conversation lives in the browser; the server is stateless.
 */
export const askRouter = createRouter()

const ASK_BODY = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(20_000),
      }),
    )
    .min(1)
    .max(20)
    // The newest turn is the question — and a question has a sane length.
    // (Refinements still run when .min(1) fails, hence the `?.`.)
    .refine((m) => m.at(-1)?.role === "user", "last message must be the question")
    .refine((m) => (m.at(-1)?.content.length ?? 0) <= 2_000, "question is too long"),
})

/**
 * Opts this request out of Bun's idleTimeout: a model thinking before its
 * first token writes nothing, and Bun would count that silence as idle and
 * drop the socket. The heartbeat below covers the rest of the run.
 */
const disableIdleTimeout = (c: Context) => {
  const server = c.env as { timeout?: (request: Request, seconds: number) => void } | undefined
  try {
    server?.timeout?.(c.req.raw, 0)
  } catch {
    // Not fatal — the request keeps the global idle limit
  }
}

askRouter.post("/ask", rateLimitMiddleware, async (c) => {
  if (!isModelConfigured()) {
    return c.json(modelNotConfiguredResponse, modelNotConfiguredResponse.httpStatus)
  }

  const parsed = ASK_BODY.safeParse(await c.req.json().catch(() => undefined))
  if (!parsed.success) {
    return c.json(invalidDataResponse, invalidDataResponse.httpStatus)
  }

  disableIdleTimeout(c)
  c.header("X-Accel-Buffering", "no")

  return streamSSE(c, async (stream) => {
    const controller = new AbortController()
    stream.onAbort(() => controller.abort())

    // A comment line every 15s keeps proxies from closing a quiet stream
    const heartbeat = setInterval(() => {
      stream.write(": ping\n\n").catch(() => {})
    }, 15_000)

    const startedAt = performance.now()
    try {
      await runAgent({
        history: parsed.data.messages,
        abortSignal: controller.signal,
        emit: (event) =>
          stream.writeSSE({ event: event.type, data: JSON.stringify(event) }),
      })
    } catch (e) {
      if (!controller.signal.aborted) {
        console.error("[ask] agent run failed", e)
        await stream
          .writeSSE({
            event: "error",
            data: JSON.stringify({
              type: "error",
              message: "Något gick fel. Försök igen om en stund.",
            }),
          })
          .catch(() => {})
      }
    } finally {
      clearInterval(heartbeat)
      console.log(
        `[ask] finished in ${Math.round(performance.now() - startedAt)}ms` +
          (controller.signal.aborted ? " (client left)" : ""),
      )
    }
  })
})
