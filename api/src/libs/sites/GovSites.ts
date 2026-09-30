/**
 * The Swedish public-sector sites the agent may search and read.
 *
 * This list is the whole trust boundary of the product: search queries are
 * scoped to these domains, results from anywhere else are dropped, and the
 * page reader refuses any other host. Subdomains count (www4.skatteverket.se
 * is Skatteverket). To cover a new agency, municipality or region, add it here.
 */

export type GovSiteCategory =
  | "riksdag-regering"
  | "rattsvasende"
  | "skatt-ekonomi-foretag"
  | "arbete-socialforsakring"
  | "halsa-vard"
  | "migration-id-resor"
  | "utbildning-forskning"
  | "bostad-miljo-energi"
  | "sakerhet-kris"
  | "trafik-transport"
  | "kultur-familj-samhalle"
  | "region"
  | "kommun"

export type GovSite = { domain: string; name: string; category: GovSiteCategory }

export const CATEGORY_LABELS: Record<GovSiteCategory, string> = {
  "riksdag-regering": "Riksdag och regering",
  rattsvasende: "Rättsväsende",
  "skatt-ekonomi-foretag": "Skatt, ekonomi och företag",
  "arbete-socialforsakring": "Arbete och socialförsäkring",
  "halsa-vard": "Hälsa och vård",
  "migration-id-resor": "Migration, id-handlingar och resor",
  "utbildning-forskning": "Utbildning och forskning",
  "bostad-miljo-energi": "Bostad, miljö och energi",
  "sakerhet-kris": "Säkerhet och kris",
  "trafik-transport": "Trafik och transport",
  "kultur-familj-samhalle": "Kultur, familj och samhälle",
  region: "Regioner",
  kommun: "Kommuner (urval)",
}

const site = (category: GovSiteCategory, domain: string, name: string): GovSite => ({
  domain,
  name,
  category,
})

export const GOV_SITES: GovSite[] = [
  // Riksdag och regering
  site("riksdag-regering", "regeringen.se", "Regeringen och Regeringskansliet"),
  site("riksdag-regering", "government.se", "Government Offices of Sweden (English)"),
  site("riksdag-regering", "riksdagen.se", "Sveriges riksdag – lagar (SFS), beslut, utredningar"),
  site("riksdag-regering", "lagrummet.se", "Lagrummet – offentlig rättsinformation"),
  site("riksdag-regering", "riksrevisionen.se", "Riksrevisionen"),
  site("riksdag-regering", "val.se", "Valmyndigheten"),
  site("riksdag-regering", "statskontoret.se", "Statskontoret"),
  site("riksdag-regering", "kammarkollegiet.se", "Kammarkollegiet"),
  site("riksdag-regering", "lansstyrelsen.se", "Länsstyrelserna"),
  site("riksdag-regering", "digg.se", "Myndigheten för digital förvaltning"),
  site("riksdag-regering", "sweden.se", "Sweden.se – Svenska institutet (English)"),
  site("riksdag-regering", "si.se", "Svenska institutet"),

  // Rättsväsende
  site("rattsvasende", "domstol.se", "Sveriges Domstolar"),
  site("rattsvasende", "polisen.se", "Polisen"),
  site("rattsvasende", "aklagare.se", "Åklagarmyndigheten"),
  site("rattsvasende", "kriminalvarden.se", "Kriminalvården"),
  site("rattsvasende", "brottsoffermyndigheten.se", "Brottsoffermyndigheten"),
  site("rattsvasende", "bra.se", "Brottsförebyggande rådet"),
  site("rattsvasende", "ekobrottsmyndigheten.se", "Ekobrottsmyndigheten"),
  site("rattsvasende", "jo.se", "Justitieombudsmannen"),
  site("rattsvasende", "do.se", "Diskrimineringsombudsmannen"),
  site("rattsvasende", "imy.se", "Integritetsskyddsmyndigheten"),

  // Skatt, ekonomi och företag
  site("skatt-ekonomi-foretag", "skatteverket.se", "Skatteverket – skatt, folkbokföring, id-kort"),
  site("skatt-ekonomi-foretag", "verksamt.se", "Verksamt – starta och driva företag"),
  site("skatt-ekonomi-foretag", "bolagsverket.se", "Bolagsverket"),
  site("skatt-ekonomi-foretag", "kronofogden.se", "Kronofogden"),
  site("skatt-ekonomi-foretag", "tullverket.se", "Tullverket"),
  site("skatt-ekonomi-foretag", "konsumentverket.se", "Konsumentverket"),
  site("skatt-ekonomi-foretag", "hallakonsument.se", "Hallå konsument"),
  site("skatt-ekonomi-foretag", "fi.se", "Finansinspektionen"),
  site("skatt-ekonomi-foretag", "riksbank.se", "Sveriges riksbank"),
  site("skatt-ekonomi-foretag", "esv.se", "Ekonomistyrningsverket"),
  site("skatt-ekonomi-foretag", "tillvaxtverket.se", "Tillväxtverket"),
  site("skatt-ekonomi-foretag", "vinnova.se", "Vinnova"),
  site("skatt-ekonomi-foretag", "konkurrensverket.se", "Konkurrensverket"),
  site("skatt-ekonomi-foretag", "upphandlingsmyndigheten.se", "Upphandlingsmyndigheten"),
  site("skatt-ekonomi-foretag", "scb.se", "Statistiska centralbyrån"),
  site("skatt-ekonomi-foretag", "lantmateriet.se", "Lantmäteriet – fastigheter och kartor"),
  site("skatt-ekonomi-foretag", "pts.se", "Post- och telestyrelsen"),

  // Arbete och socialförsäkring
  site("arbete-socialforsakring", "arbetsformedlingen.se", "Arbetsförmedlingen"),
  site("arbete-socialforsakring", "forsakringskassan.se", "Försäkringskassan"),
  site("arbete-socialforsakring", "pensionsmyndigheten.se", "Pensionsmyndigheten"),
  site("arbete-socialforsakring", "av.se", "Arbetsmiljöverket"),
  site("arbete-socialforsakring", "iaf.se", "Inspektionen för arbetslöshetsförsäkringen"),
  site("arbete-socialforsakring", "mi.se", "Medlingsinstitutet"),
  site("arbete-socialforsakring", "arbetsgivarverket.se", "Arbetsgivarverket"),

  // Hälsa och vård
  site("halsa-vard", "1177.se", "1177 – vård och hälsa"),
  site("halsa-vard", "folkhalsomyndigheten.se", "Folkhälsomyndigheten"),
  site("halsa-vard", "socialstyrelsen.se", "Socialstyrelsen"),
  site("halsa-vard", "lakemedelsverket.se", "Läkemedelsverket"),
  site("halsa-vard", "tlv.se", "Tandvårds- och läkemedelsförmånsverket"),
  site("halsa-vard", "ivo.se", "Inspektionen för vård och omsorg"),
  site("halsa-vard", "ehalsomyndigheten.se", "E-hälsomyndigheten"),
  site("halsa-vard", "sbu.se", "SBU – Statens beredning för medicinsk och social utvärdering"),
  site("halsa-vard", "vardanalys.se", "Myndigheten för vård- och omsorgsanalys"),

  // Migration, id-handlingar och resor
  site("migration-id-resor", "migrationsverket.se", "Migrationsverket"),
  site("migration-id-resor", "informationsverige.se", "Information Sverige – för nyanlända"),
  site("migration-id-resor", "swedenabroad.se", "Sveriges ambassader och konsulat"),

  // Utbildning och forskning
  site("utbildning-forskning", "skolverket.se", "Skolverket"),
  site("utbildning-forskning", "skolinspektionen.se", "Skolinspektionen"),
  site("utbildning-forskning", "csn.se", "CSN – studiemedel"),
  site("utbildning-forskning", "uhr.se", "Universitets- och högskolerådet"),
  site("utbildning-forskning", "antagning.se", "Antagning.se"),
  site("utbildning-forskning", "universityadmissions.se", "University Admissions in Sweden"),
  site("utbildning-forskning", "studera.nu", "Studera.nu"),
  site("utbildning-forskning", "myh.se", "Myndigheten för yrkeshögskolan"),
  site("utbildning-forskning", "uka.se", "Universitetskanslersämbetet"),
  site("utbildning-forskning", "spsm.se", "Specialpedagogiska skolmyndigheten"),
  site("utbildning-forskning", "vr.se", "Vetenskapsrådet"),

  // Bostad, miljö och energi
  site("bostad-miljo-energi", "boverket.se", "Boverket"),
  site("bostad-miljo-energi", "naturvardsverket.se", "Naturvårdsverket"),
  site("bostad-miljo-energi", "energimyndigheten.se", "Energimyndigheten"),
  site("bostad-miljo-energi", "smhi.se", "SMHI"),
  site("bostad-miljo-energi", "havochvatten.se", "Havs- och vattenmyndigheten"),
  site("bostad-miljo-energi", "jordbruksverket.se", "Jordbruksverket"),
  site("bostad-miljo-energi", "livsmedelsverket.se", "Livsmedelsverket"),
  site("bostad-miljo-energi", "skogsstyrelsen.se", "Skogsstyrelsen"),
  site("bostad-miljo-energi", "sgu.se", "Sveriges geologiska undersökning"),
  site("bostad-miljo-energi", "ssm.se", "Strålsäkerhetsmyndigheten"),
  site("bostad-miljo-energi", "kemi.se", "Kemikalieinspektionen"),
  site("bostad-miljo-energi", "sva.se", "Statens veterinärmedicinska anstalt"),

  // Säkerhet och kris
  site("sakerhet-kris", "krisinformation.se", "Krisinformation.se"),
  site("sakerhet-kris", "mcf.se", "Myndigheten för civilt försvar"),
  site("sakerhet-kris", "msb.se", "MSB (numera Myndigheten för civilt försvar)"),
  site("sakerhet-kris", "forsvarsmakten.se", "Försvarsmakten"),
  site("sakerhet-kris", "sakerhetspolisen.se", "Säkerhetspolisen"),
  site("sakerhet-kris", "kustbevakningen.se", "Kustbevakningen"),
  site("sakerhet-kris", "pliktverket.se", "Plikt- och prövningsverket – totalförsvarsplikt"),

  // Trafik och transport
  site("trafik-transport", "transportstyrelsen.se", "Transportstyrelsen – körkort, fordon"),
  site("trafik-transport", "trafikverket.se", "Trafikverket – vägar, järnväg, förarprov"),
  site("trafik-transport", "trafa.se", "Trafikanalys"),

  // Kultur, familj och samhälle
  site("kultur-familj-samhalle", "barnombudsmannen.se", "Barnombudsmannen"),
  site("kultur-familj-samhalle", "mfof.se", "Myndigheten för familjerätt och föräldraskapsstöd"),
  site("kultur-familj-samhalle", "mucf.se", "Myndigheten för ungdoms- och civilsamhällesfrågor"),
  site("kultur-familj-samhalle", "mfd.se", "Myndigheten för delaktighet"),
  site("kultur-familj-samhalle", "jamstalldhetsmyndigheten.se", "Jämställdhetsmyndigheten"),
  site("kultur-familj-samhalle", "kb.se", "Kungliga biblioteket"),
  site("kultur-familj-samhalle", "riksarkivet.se", "Riksarkivet"),
  site("kultur-familj-samhalle", "raa.se", "Riksantikvarieämbetet"),
  site("kultur-familj-samhalle", "kulturradet.se", "Kulturrådet"),
  site("kultur-familj-samhalle", "isof.se", "Institutet för språk och folkminnen"),
  site("kultur-familj-samhalle", "skr.se", "Sveriges Kommuner och Regioner"),

  // Regioner
  site("region", "regionstockholm.se", "Region Stockholm"),
  site("region", "regionuppsala.se", "Region Uppsala"),
  site("region", "regionsormland.se", "Region Sörmland"),
  site("region", "regionostergotland.se", "Region Östergötland"),
  site("region", "rjl.se", "Region Jönköpings län"),
  site("region", "regionkronoberg.se", "Region Kronoberg"),
  site("region", "regionkalmar.se", "Region Kalmar län"),
  site("region", "gotland.se", "Region Gotland"),
  site("region", "regionblekinge.se", "Region Blekinge"),
  site("region", "skane.se", "Region Skåne"),
  site("region", "regionhalland.se", "Region Halland"),
  site("region", "vgregion.se", "Västra Götalandsregionen"),
  site("region", "regionvarmland.se", "Region Värmland"),
  site("region", "regionorebrolan.se", "Region Örebro län"),
  site("region", "regionvastmanland.se", "Region Västmanland"),
  site("region", "regiondalarna.se", "Region Dalarna"),
  site("region", "regiongavleborg.se", "Region Gävleborg"),
  site("region", "rvn.se", "Region Västernorrland"),
  site("region", "regionjh.se", "Region Jämtland Härjedalen"),
  site("region", "regionvasterbotten.se", "Region Västerbotten"),
  site("region", "norrbotten.se", "Region Norrbotten"),

  // Kommuner (the largest — extend as needed)
  site("kommun", "stockholm.se", "Stockholms stad"),
  site("kommun", "goteborg.se", "Göteborgs stad"),
  site("kommun", "malmo.se", "Malmö stad"),
  site("kommun", "uppsala.se", "Uppsala kommun"),
  site("kommun", "linkoping.se", "Linköpings kommun"),
  site("kommun", "orebro.se", "Örebro kommun"),
  site("kommun", "vasteras.se", "Västerås stad"),
  site("kommun", "helsingborg.se", "Helsingborgs stad"),
  site("kommun", "norrkoping.se", "Norrköpings kommun"),
  site("kommun", "jonkoping.se", "Jönköpings kommun"),
  site("kommun", "umea.se", "Umeå kommun"),
  site("kommun", "lund.se", "Lunds kommun"),
  site("kommun", "boras.se", "Borås stad"),
  site("kommun", "huddinge.se", "Huddinge kommun"),
  site("kommun", "eskilstuna.se", "Eskilstuna kommun"),
  site("kommun", "nacka.se", "Nacka kommun"),
  site("kommun", "gavle.se", "Gävle kommun"),
  site("kommun", "halmstad.se", "Halmstads kommun"),
  site("kommun", "sodertalje.se", "Södertälje kommun"),
  site("kommun", "vaxjo.se", "Växjö kommun"),
  site("kommun", "karlstad.se", "Karlstads kommun"),
  site("kommun", "sundsvall.se", "Sundsvalls kommun"),
  site("kommun", "lulea.se", "Luleå kommun"),
  site("kommun", "kristianstad.se", "Kristianstads kommun"),
]

/**
 * Searched when the model names no sites. Broad portals that between them
 * answer most everyday questions — a query can only carry a handful of
 * `site:` filters before search engines start treating it as abuse.
 */
export const DEFAULT_SEARCH_DOMAINS = [
  "regeringen.se",
  "riksdagen.se",
  "skatteverket.se",
  "forsakringskassan.se",
  "verksamt.se",
  "1177.se",
  "migrationsverket.se",
  "krisinformation.se",
]

export const MAX_SITES_PER_SEARCH = 8

const DOMAINS = new Set(GOV_SITES.map((s) => s.domain))

/** `www.Skatteverket.se.` → `www.skatteverket.se` */
const normalizeHost = (host: string) => host.toLowerCase().replace(/\.$/, "")

/** The catalog entry covering this hostname (exact or a subdomain of it), if any. */
export const findGovSite = (hostname: string): GovSite | undefined => {
  const host = normalizeHost(hostname)
  const parts = host.split(".")
  // Walk up: a.b.skatteverket.se → b.skatteverket.se → skatteverket.se
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".")
    if (DOMAINS.has(candidate)) return GOV_SITES.find((s) => s.domain === candidate)
  }
  return undefined
}

/** "Skatteverket – skatt, folkbokföring, id-kort" → "Skatteverket", for display. */
export const displayName = (site: GovSite) => site.name.split(" – ")[0]

/** Display name for any URL: the agency's name, or the bare host. */
export const siteNameForUrl = (raw: string): string => {
  try {
    const { hostname } = new URL(raw)
    const site = findGovSite(hostname)
    return site ? displayName(site) : hostname.replace(/^www\./, "")
  } catch {
    return raw
  }
}

/** True only for https/http URLs on a catalogued government host. */
export const isGovUrl = (raw: string): boolean => {
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" && url.protocol !== "http:") return false
    if (url.username || url.password) return false
    return findGovSite(url.hostname) !== undefined
  } catch {
    return false
  }
}

/**
 * Maps whatever the model asked for ("Skatteverket.se", "https://www.csn.se/")
 * onto catalogued domains, dropping anything that isn't one.
 */
export const resolveSearchDomains = (requested: string[] | undefined): string[] => {
  const resolved = new Set<string>()
  for (const raw of requested ?? []) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    let host = trimmed
    try {
      host = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname
    } catch {
      continue
    }
    const match = findGovSite(host)
    if (match) resolved.add(match.domain)
    if (resolved.size >= MAX_SITES_PER_SEARCH) break
  }
  return resolved.size > 0 ? [...resolved] : DEFAULT_SEARCH_DOMAINS
}

/** The catalog as compact prompt text, grouped by category. */
export const catalogForPrompt = (): string =>
  (Object.keys(CATEGORY_LABELS) as GovSiteCategory[])
    .map((category) => {
      const lines = GOV_SITES.filter((s) => s.category === category).map(
        (s) => `- ${s.domain} — ${s.name}`,
      )
      return `### ${CATEGORY_LABELS[category]}\n${lines.join("\n")}`
    })
    .join("\n\n")
