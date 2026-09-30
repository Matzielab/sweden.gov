import { stepCountIs, streamText, type ModelMessage } from "ai"
import Config from "@/libs/Config"
import { isGovUrl, siteNameForUrl as siteName } from "@/libs/sites/GovSites"
import { agentTools } from "./AgentTools"
import { getModel } from "./Model"
import { buildSystemPrompt, withScopeReminder } from "./SystemPrompt"

/**
 * One question → one agent run: the model searches and reads government
 * pages until it can answer, and everything it does is surfaced as events so
 * the page can show "Söker på Skatteverket…" while it works.
 */

export type Source = { title: string; url: string; site: string }

export type AgentEvent =
  | { type: "search"; id: string; query: string; sites: string[] }
  | { type: "search-results"; id: string; count: number; error?: string }
  | { type: "read"; id: string; url: string; site: string }
  | { type: "read-done"; id: string; ok: boolean; title?: string }
  | { type: "text"; delta: string }
  | { type: "text-reset" }
  | { type: "done"; sources: Source[] }
  | { type: "error"; message: string }

export type ChatTurn = { role: "user" | "assistant"; content: string }

const MAX_SOURCES = 8

/** The sources worth listing under the answer: the ones it linked, else the ones it read. */
const pickSources = (answer: string, known: Map<string, Source>, read: Set<string>) => {
  const cited = new Map<string, Source>()
  // Markdown links and bare URLs alike — models don't always format links
  const urlPattern = /https?:\/\/[^\s)\]<>"']+/g
  let match: RegExpExecArray | null
  while ((match = urlPattern.exec(answer)) !== null) {
    const url = match[0].replace(/[.,;:!?]+$/, "")
    if (!isGovUrl(url) || cited.has(url)) continue
    cited.set(url, known.get(url) ?? { title: siteName(url), url, site: siteName(url) })
  }
  const sources =
    cited.size > 0
      ? [...cited.values()]
      : [...read].map((url) => known.get(url)).filter((s): s is Source => Boolean(s))
  return sources.slice(0, MAX_SOURCES)
}

const describeError = (error: unknown): string => {
  const e = error as { statusCode?: number; message?: string } | undefined
  if (e?.statusCode === 401 || e?.statusCode === 403) {
    return "AI-leverantören nekade anropet. Kontrollera OPENAI_COMPATIBLE_API_KEY."
  }
  if (e?.statusCode === 402) {
    return "AI-leverantörens konto saknar saldo. Fyll på kontot eller byt leverantör."
  }
  if (e?.statusCode === 404) {
    return "AI-leverantören hittade inte modellen. Kontrollera OPENAI_COMPATIBLE_MODEL och OPENAI_COMPATIBLE_BASE_URL."
  }
  if (e?.statusCode === 429) {
    return "AI-tjänsten är överbelastad just nu. Försök igen om en stund."
  }
  return "Något gick fel när svaret skulle tas fram. Försök igen."
}

export const runAgent = async ({
  history,
  abortSignal,
  emit,
}: {
  history: ChatTurn[]
  abortSignal: AbortSignal
  emit: (event: AgentEvent) => Promise<void>
}) => {
  const messages: ModelMessage[] = history.map((turn, index) => ({
    role: turn.role,
    content:
      index === history.length - 1 && turn.role === "user"
        ? withScopeReminder(turn.content)
        : turn.content,
  }))

  const known = new Map<string, Source>()
  const read = new Set<string>()
  let answer = ""
  let failed = false

  const result = streamText({
    model: getModel(),
    instructions: buildSystemPrompt(),
    messages,
    tools: agentTools,
    stopWhen: stepCountIs(Config.llm.maxSteps),
    // Out of steps, the last one must answer instead of calling yet another tool
    prepareStep: ({ stepNumber }) =>
      stepNumber >= Config.llm.maxSteps - 1 ? { toolChoice: "none" } : {},
    temperature: Config.llm.temperature,
    abortSignal,
    onError: ({ error }) => {
      // The SDK's APICallError dumps the whole request when printed; this is what matters
      const e = error as { statusCode?: number; message?: string; responseBody?: string }
      console.error(
        `[agent] model call failed: ${e?.statusCode ?? "-"} ${e?.message ?? String(error)}` +
          (e?.responseBody ? ` — ${e.responseBody.slice(0, 500)}` : ""),
      )
    },
  })

  for await (const part of result.stream) {
    switch (part.type) {
      case "text-delta":
        if (!part.text) break
        answer += part.text
        await emit({ type: "text", delta: part.text })
        break

      case "tool-call":
        // Text followed by a tool call was narration ("I'll look that up…"),
        // not the answer — the activity trail already shows the work
        if (answer) {
          answer = ""
          await emit({ type: "text-reset" })
        }
        if (part.dynamic || part.invalid) break
        if (part.toolName === "search_government_sites") {
          await emit({
            type: "search",
            id: part.toolCallId,
            query: part.input.query,
            sites: part.input.sites ?? [],
          })
        } else if (part.toolName === "read_government_page") {
          await emit({
            type: "read",
            id: part.toolCallId,
            url: part.input.url,
            site: siteName(part.input.url),
          })
        }
        break

      case "tool-result": {
        if (part.dynamic) break
        const output = part.output as Record<string, unknown>
        const error = typeof output?.error === "string" ? output.error : undefined

        if (part.toolName === "search_government_sites") {
          const results = (
            Array.isArray(output?.results) ? output.results : []
          ) as Source[]
          for (const r of results) {
            if (!known.has(r.url))
              known.set(r.url, { title: r.title, url: r.url, site: r.site })
          }
          await emit({
            type: "search-results",
            id: part.toolCallId,
            count: results.length,
            error,
          })
        } else if (part.toolName === "read_government_page") {
          const page = output as {
            url?: string
            title?: string
            site?: string
            links?: { text: string; url: string }[]
          }
          const requested = part.input.url
          if (!error && page.url) {
            // Anchor text is the best title we'll have for a page it links but never reads
            for (const link of page.links ?? []) {
              if (!known.has(link.url)) {
                known.set(link.url, {
                  title: link.text,
                  url: link.url,
                  site: siteName(link.url),
                })
              }
            }
            const source = {
              title: page.title || known.get(requested)?.title || page.site || page.url,
              url: page.url,
              site: page.site ?? siteName(page.url),
            }
            known.set(page.url, source)
            known.set(requested, { ...source, url: requested })
            read.add(requested)
          }
          await emit({
            type: "read-done",
            id: part.toolCallId,
            ok: !error,
            title: page.title,
          })
        }
        break
      }

      case "tool-error":
        // Tools return { error } instead of throwing; this is input the SDK couldn't validate
        await emit({
          type: "search-results",
          id: part.toolCallId,
          count: 0,
          error: "tool error",
        })
        break

      case "error":
        failed = true
        await emit({ type: "error", message: describeError(part.error) })
        break
    }
  }

  if (!failed) {
    if (!answer.trim()) {
      await emit({
        type: "error",
        message: "Inget svar kunde tas fram. Försök formulera frågan på ett annat sätt.",
      })
      return
    }
    await emit({ type: "done", sources: pickSources(answer, known, read) })
  }
}
