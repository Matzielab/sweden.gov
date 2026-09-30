import { tool } from "ai"
import { z } from "zod"
import { MAX_SITES_PER_SEARCH } from "@/libs/sites/GovSites"
import { readGovPage, searchGovSites } from "@/libs/tools/GovSearch"
import { WebToolError } from "@/libs/tools/SafeFetch"

/**
 * The agent's only two abilities: search government sites, and read a page on
 * one. Failures come back as `{ error }` rather than throwing, so the model
 * reads a sentence it can act on (retry, rephrase, give up) instead of the
 * loop dying on the first hiccup.
 */
const asToolError = (e: unknown) => {
  if (e instanceof WebToolError) return { error: e.message }
  console.error("[tools] unexpected tool failure", e)
  return { error: "The tool failed unexpectedly" }
}

export const agentTools = {
  search_government_sites: tool({
    description:
      "Search official Swedish government websites (agencies, Riksdag, Government Offices, regions, municipalities). Returns titles, URLs and snippets. Only government sites are ever returned.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(200)
        .describe("Search keywords, preferably in Swedish, without site: operators"),
      sites: z
        .array(z.string())
        .max(MAX_SITES_PER_SEARCH)
        .optional()
        .describe(
          "Domains from the catalog to search, e.g. [\"forsakringskassan.se\"]. Omit to search the default set.",
        ),
    }),
    execute: async ({ query, sites }) => {
      try {
        const { domains, results } = await searchGovSites(query, sites)
        if (results.length === 0) {
          return {
            searched: domains,
            results: [],
            note: "No results. Try other keywords or other sites.",
          }
        }
        return { searched: domains, results }
      } catch (e) {
        return asToolError(e)
      }
    },
  }),

  read_government_page: tool({
    description:
      "Read the text of a page on an official Swedish government website — a search result, or a site's start page to browse from. Returns the text plus the page's links (text + URL) so you can click through to subpages. Other sites are refused.",
    inputSchema: z.object({
      url: z.string().describe("Full URL of the government page"),
    }),
    execute: async ({ url }) => {
      try {
        return await readGovPage(url)
      } catch (e) {
        return asToolError(e)
      }
    },
  }),
}

export type AgentTools = typeof agentTools
