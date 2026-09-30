import { describe, expect, test } from "bun:test"
import {
  createSearchChain,
  SearchProviderError,
  type ProviderAnswer,
  type SearchProvider,
} from "./SearchProviders"
import { WebToolError } from "./SafeFetch"

const hit = { title: "Studiemedel", url: "https://www.csn.se/x", snippet: "" }

/** A provider that answers from a script of outcomes, counting its calls. */
const fake = (name: string, ...script: (ProviderAnswer | Error)[]) => {
  const provider: SearchProvider & { calls: number } = {
    name,
    calls: 0,
    search: async () => {
      const outcome = script[Math.min(provider.calls++, script.length - 1)]
      if (outcome instanceof Error) throw outcome
      return outcome
    },
  }
  return provider
}

describe("search chain", () => {
  test("the first provider that answers wins", async () => {
    const a = fake("a", { results: [hit] })
    const b = fake("b", { results: [] })
    const search = createSearchChain([a, b], { cooldownMs: 60_000 })
    expect(await search("q")).toEqual([hit])
    expect(b.calls).toBe(0)
  })

  test("falls through on failure, and a blocked provider sits out its cooldown", async () => {
    let clock = 0
    const a = fake("a", new SearchProviderError("a returned 429", true), { results: [hit] })
    const b = fake("b", { results: [hit] })
    const search = createSearchChain([a, b], { cooldownMs: 60_000, now: () => clock })

    await search("q")
    await search("q")
    expect([a.calls, b.calls]).toEqual([1, 2]) // a skipped while cooling

    clock = 60_001
    await search("q")
    expect(a.calls).toBe(2) // back after the cooldown
  })

  test("a transient failure only cools down briefly", async () => {
    let clock = 0
    const a = fake("a", new SearchProviderError("a is unreachable", false), { results: [hit] })
    const b = fake("b", { results: [hit] })
    const search = createSearchChain([a, b], { cooldownMs: 600_000, now: () => clock })
    await search("q")
    clock = 31_000
    await search("q")
    expect(a.calls).toBe(2)
  })

  test("zero results with failing sources (SearXNG all engines blocked) moves on", async () => {
    const a = fake("a", { results: [], degraded: "brave (too many requests)" })
    const b = fake("b", { results: [hit] })
    const search = createSearchChain([a, b], { cooldownMs: 60_000 })
    expect(await search("q")).toEqual([hit])
  })

  test("genuinely empty results are returned, not treated as failure", async () => {
    const a = fake("a", { results: [] })
    const b = fake("b", { results: [hit] })
    const search = createSearchChain([a, b], { cooldownMs: 60_000 })
    expect(await search("q")).toEqual([])
    expect(b.calls).toBe(0)
  })

  test("when everything fails, the agent gets an actionable error", async () => {
    const a = fake("a", new SearchProviderError("a returned 403", true))
    const search = createSearchChain([a], { cooldownMs: 60_000 })
    const error = await search("q").catch((e) => e)
    expect(error).toBeInstanceOf(WebToolError)
    expect(error.message).toContain("a returned 403")
    expect(error.message).toContain("start page")
  })

  test("minIntervalMs spaces out parallel calls", async () => {
    const a = { ...fake("a", { results: [hit] }), minIntervalMs: 60 }
    const search = createSearchChain([a], { cooldownMs: 60_000 })
    const started = performance.now()
    await Promise.all([search("1"), search("2"), search("3")])
    expect(performance.now() - started).toBeGreaterThanOrEqual(110)
  })
})
