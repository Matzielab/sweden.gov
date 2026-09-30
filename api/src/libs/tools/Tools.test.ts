import { describe, expect, test } from "bun:test"
import { decodeEntities, extractLinks, extractTitle, htmlToText, stripTags } from "./HtmlText"
import { buildScopedQuery, readGovPage } from "./GovSearch"
import { isBlockedAddress, WebToolError } from "./SafeFetch"
import { parseDuckDuckGoHtml } from "./SearchProviders"
import { createRateLimiter } from "@/libs/middlewares/RateLimitMiddleware"

describe("HtmlText", () => {
  test("decodes named and numeric entities", () => {
    expect(decodeEntities("F&ouml;r&auml;ldrapenning &amp; VAB &#8211; &#x2014;")).toBe(
      "Föräldrapenning & VAB – —",
    )
  })

  test("strips inline tags", () => {
    expect(stripTags("Om <b>föräldrapenning</b>\n  och  mer")).toBe("Om föräldrapenning och mer")
  })

  test("prefers <main> and drops chrome and scripts", () => {
    const html = `<html><head><title>Föräldrapenning | Försäkringskassan</title>
      <script>var x = 1</script></head><body><nav>Meny</nav>
      <main><h1>Föräldrapenning</h1><p>Du får 390 kr per dag.</p><ul><li>Ett</li><li>Två</li></ul></main>
      <footer>Kontakt</footer></body></html>`
    const text = htmlToText(html)
    expect(text).toContain("## Föräldrapenning")
    expect(text).toContain("Du får 390 kr per dag.")
    expect(text).toContain("- Ett")
    expect(text).not.toContain("Meny")
    expect(text).not.toContain("Kontakt")
    expect(text).not.toContain("var x")
    expect(extractTitle(html)).toBe("Föräldrapenning | Försäkringskassan")
  })
})

describe("GovSearch", () => {
  test("scopes queries to sites", () => {
    expect(buildScopedQuery("csn lån", ["csn.se"])).toBe("csn lån site:csn.se")
    expect(buildScopedQuery("skatt", ["a.se", "b.se"])).toBe("skatt (site:a.se OR site:b.se)")
  })

  test("refuses to read non-government pages without fetching", async () => {
    await expect(readGovPage("https://example.com/")).rejects.toBeInstanceOf(WebToolError)
    await expect(readGovPage("http://169.254.169.254/")).rejects.toBeInstanceOf(WebToolError)
  })
})

describe("SafeFetch", () => {
  test("blocks private and metadata addresses", () => {
    expect(isBlockedAddress("127.0.0.1")).toBe(true)
    expect(isBlockedAddress("10.1.2.3")).toBe(true)
    expect(isBlockedAddress("169.254.169.254")).toBe(true)
    expect(isBlockedAddress("::ffff:7f00:1")).toBe(true)
    expect(isBlockedAddress("::1")).toBe(true)
    expect(isBlockedAddress("93.184.216.34")).toBe(false)
  })
})

describe("rate limiter", () => {
  test("allows up to the limit per window, then reports the wait", () => {
    const limiter = createRateLimiter(2, 60_000)
    const now = 1_000_000
    expect(limiter.hit("a", now)).toBe(0)
    expect(limiter.hit("a", now)).toBe(0)
    expect(limiter.hit("a", now + 1000)).toBe(59)
    expect(limiter.hit("b", now)).toBe(0)
    expect(limiter.hit("a", now + 60_000)).toBe(0)
  })

  test("0 disables it", () => {
    const limiter = createRateLimiter(0, 60_000)
    for (let i = 0; i < 100; i++) expect(limiter.hit("a")).toBe(0)
  })
})

describe("DuckDuckGo parser", () => {
  test("extracts real URLs, titles and snippets from a captured page", async () => {
    const html = await Bun.file(`${import.meta.dir}/__fixtures__/duckduckgo.html`).text()
    const results = parseDuckDuckGoHtml(html)
    expect(results.length).toBe(10)
    expect(results[1]).toEqual({
      title: "Föräldrapenning - Försäkringskassan",
      url: "https://www.forsakringskassan.se/privatperson/familj-och-barn/foraldrapenning",
      snippet: expect.stringContaining("hur mycket du kan få"),
    })
    for (const r of results) expect(r.url).toMatch(/^https:\/\//)
  })
})

describe("extractLinks", () => {
  test("resolves, dedupes and orders main-content links first", () => {
    const html = `<body><nav><a href="/meny">Meny</a><a href="/pass/">Pass</a></nav>
      <main><a href="/pass/">Pass och id-kort</a><a href="https://etjanster.polisen.se/x">E-tjänst</a>
      <a href="#top">Upp</a><a href="mailto:a@b.se">Mejla</a><a href="/bild.png">Bild</a>
      <a href="/tom"><img alt="Hittegods" src="x.png"></a></main></body>`
    expect(extractLinks(html, "https://polisen.se/", 10)).toEqual([
      { text: "Pass och id-kort", url: "https://polisen.se/pass/" },
      { text: "E-tjänst", url: "https://etjanster.polisen.se/x" },
      { text: "Hittegods", url: "https://polisen.se/tom" },
      { text: "Meny", url: "https://polisen.se/meny" },
    ])
  })
})
