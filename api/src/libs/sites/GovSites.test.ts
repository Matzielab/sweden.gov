import { describe, expect, test } from "bun:test"
import {
  DEFAULT_SEARCH_DOMAINS,
  GOV_SITES,
  MAX_SITES_PER_SEARCH,
  findGovSite,
  isGovUrl,
  resolveSearchDomains,
} from "./GovSites"

describe("GovSites catalog", () => {
  test("has no duplicate domains", () => {
    const domains = GOV_SITES.map((s) => s.domain)
    expect(new Set(domains).size).toBe(domains.length)
  })

  test("domains are bare lowercase hostnames", () => {
    for (const { domain } of GOV_SITES) {
      expect(domain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/)
    }
  })

  test("default search domains are all catalogued", () => {
    for (const domain of DEFAULT_SEARCH_DOMAINS) expect(findGovSite(domain)).toBeDefined()
  })
})

describe("isGovUrl", () => {
  test("accepts catalogued hosts and their subdomains", () => {
    expect(isGovUrl("https://www.skatteverket.se/privat")).toBe(true)
    expect(isGovUrl("https://www4.skatteverket.se/rattsligvagledning/x.html")).toBe(true)
    expect(isGovUrl("http://1177.se/")).toBe(true)
    expect(isGovUrl("https://WWW.CSN.SE/")).toBe(true)
  })

  test("rejects look-alikes and other sites", () => {
    expect(isGovUrl("https://skatteverket.se.evil.com/")).toBe(false)
    expect(isGovUrl("https://fakeskatteverket.se/")).toBe(false)
    expect(isGovUrl("https://example.com/?u=https://skatteverket.se")).toBe(false)
    expect(isGovUrl("https://aftonbladet.se/")).toBe(false)
  })

  test("rejects credentials, other schemes and garbage", () => {
    expect(isGovUrl("https://user:pw@skatteverket.se/")).toBe(false)
    expect(isGovUrl("ftp://skatteverket.se/")).toBe(false)
    expect(isGovUrl("javascript:alert(1)")).toBe(false)
    expect(isGovUrl("not a url")).toBe(false)
  })
})

describe("resolveSearchDomains", () => {
  test("normalizes what the model asks for", () => {
    expect(resolveSearchDomains(["Skatteverket.se", "https://www.csn.se/", "csn.se"])).toEqual([
      "skatteverket.se",
      "csn.se",
    ])
  })

  test("drops unknown domains, falling back to the defaults", () => {
    expect(resolveSearchDomains(["evil.com"])).toEqual(DEFAULT_SEARCH_DOMAINS)
    expect(resolveSearchDomains(undefined)).toEqual(DEFAULT_SEARCH_DOMAINS)
    expect(resolveSearchDomains([])).toEqual(DEFAULT_SEARCH_DOMAINS)
  })

  test("caps the number of sites", () => {
    const many = GOV_SITES.slice(0, 20).map((s) => s.domain)
    expect(resolveSearchDomains(many)).toHaveLength(MAX_SITES_PER_SEARCH)
  })
})
