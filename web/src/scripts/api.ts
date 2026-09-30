/**
 * The page's whole contract with the api: POST /ask with the conversation,
 * read back Server-Sent Events. Mirrors AgentEvent in api/src/libs/agent/Agent.ts.
 */

export const API_URL = (import.meta.env.PUBLIC_API_URL || "http://localhost:3000").replace(
  /\/+$/,
  "",
)

export type Source = { title: string; url: string; site: string }
export type ChatTurn = { role: "user" | "assistant"; content: string }

export type AgentEvent =
  | { type: "search"; id: string; query: string; sites: string[] }
  | { type: "search-results"; id: string; count: number; error?: string }
  | { type: "read"; id: string; url: string; site: string }
  | { type: "read-done"; id: string; ok: boolean; title?: string }
  | { type: "text"; delta: string }
  | { type: "text-reset" }
  | { type: "done"; sources: Source[] }
  | { type: "error"; message: string }

export class AskError extends Error {}

const errorMessageFor = async (response: Response) => {
  try {
    const body = await response.json()
    if (typeof body?.errorMessage === "string" && response.status !== 400) {
      return body.errorMessage as string
    }
  } catch {
    // fall through to the generic messages
  }
  if (response.status === 400) return "Frågan kunde inte skickas. Försök korta ner den."
  if (response.status === 429) return "För många frågor på kort tid. Vänta en stund."
  return "Tjänsten svarar inte just nu. Försök igen om en stund."
}

/** Streams one answer. Resolves when the stream ends; throws AskError on transport failures. */
export const ask = async (
  messages: ChatTurn[],
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
) => {
  let response: Response
  try {
    response = await fetch(`${API_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ messages }),
      signal,
    })
  } catch (e) {
    if (signal.aborted) throw e
    throw new AskError("Kunde inte nå tjänsten. Kontrollera din anslutning.")
  }

  if (!response.ok || !response.body) throw new AskError(await errorMessageFor(response))

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""

  // SSE: events are separated by a blank line; we only need the data lines
  const flush = (block: string) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n")
    if (!data) return // comments / heartbeats
    try {
      onEvent(JSON.parse(data) as AgentEvent)
    } catch {
      // a malformed event is skipped rather than killing the answer
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value.replace(/\r\n/g, "\n")
    let boundary: number
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      flush(buffer.slice(0, boundary))
      buffer = buffer.slice(boundary + 2)
    }
  }
  if (buffer.trim()) flush(buffer)
}

export type SiteCatalog = {
  count: number
  categories: { id: string; label: string; sites: { domain: string; name: string }[] }[]
}

export const fetchSites = async (): Promise<SiteCatalog> => {
  const response = await fetch(`${API_URL}/sites`)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}
