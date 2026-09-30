import { ask, AskError, fetchSites, type AgentEvent, type ChatTurn, type Source } from "./api"
import { createCarousel } from "./carousel"
import { renderMarkdown } from "./markdown"

/**
 * The page: one prompt box, a thread of questions and answers, and a live
 * trail of what the agent searched and read. The conversation lives here in
 * the tab; the api is stateless.
 *
 * The prompt box has two homes: on the start page it floats over the hero
 * picture; once a question is asked it moves to a dock under the thread.
 * It's one form, moved between the two — not two forms kept in sync.
 */

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const thread = $<HTMLElement>("thread")
const form = $<HTMLFormElement>("composer")
const prompt = $<HTMLTextAreaElement>("prompt")
const send = $<HTMLButtonElement>("send")
const newQuestion = $<HTMLButtonElement>("new-question")
const composerHome = $<HTMLElement>("composer-home")
const composerDock = $<HTMLElement>("composer-dock")

const history: ChatTurn[] = []
let running: AbortController | null = null

// ---------- small DOM helpers ----------

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** `forsakringskassan.se/privatperson/foralder` — enough to recognise a page. */
const shortUrl = (url: string) => {
  try {
    const { hostname, pathname } = new URL(url)
    const path = pathname.length > 48 ? `${pathname.slice(0, 47)}…` : pathname
    return hostname.replace(/^www\./, "") + (path === "/" ? "" : path)
  } catch {
    return url
  }
}

const spinner = () => el("span", { className: "spinner", ariaHidden: "true" })

// ---------- composer ----------

const autosize = () => {
  prompt.style.height = "auto"
  prompt.style.height = `${Math.min(prompt.scrollHeight, 224)}px`
}

const syncComposer = () => {
  const busy = running !== null
  form.classList.toggle("busy", busy)
  send.disabled = !busy && prompt.value.trim().length === 0
  send.setAttribute("aria-label", busy ? "Avbryt svaret" : "Skicka fråga")
}

const examplePlaceholder = (question: string) => `Prova: ”${question}”`

const setConversationMode = (on: boolean) => {
  const hadFocus = document.activeElement === prompt
  document.body.classList.toggle("has-thread", on)
  newQuestion.hidden = !on
  ;(on ? composerDock : composerHome).append(form)
  carousel.setEnabled(!on)
  prompt.placeholder = on ? "Ställ en följdfråga…" : examplePlaceholder(carousel.current())
  // Moving an element in the DOM drops its focus
  if (hadFocus) prompt.focus({ preventScroll: true })
}

// ---------- one question/answer turn ----------

type TurnView = {
  root: HTMLElement
  activity: HTMLDetailsElement
  summary: HTMLElement
  steps: HTMLOListElement
  stepById: Map<string, HTMLLIElement>
  answer: HTMLElement
  text: string
  searches: number
  reads: number
}

const createTurn = (question: string): TurnView => {
  const summary = el("summary", {}, spinner(), " Letar efter svar…")
  const steps = el("ol")
  const activity = el("details", { className: "activity", open: true }, summary, steps)
  const answer = el("div", { className: "answer" })
  const root = el(
    "article",
    { className: "turn" },
    el("h2", { className: "question" }, question),
    activity,
    answer,
  )
  thread.append(root)
  return {
    root,
    activity,
    summary,
    steps,
    stepById: new Map(),
    answer,
    text: "",
    searches: 0,
    reads: 0,
  }
}

const addStep = (turn: TurnView, id: string, ...content: (Node | string)[]) => {
  const state = el("span", { className: "state" }, spinner())
  const li = el("li", {}, state, el("span", {}, ...content))
  turn.steps.append(li)
  turn.stepById.set(id, li)
}

const finishStep = (turn: TurnView, id: string, ok: boolean, suffix?: string) => {
  const li = turn.stepById.get(id)
  if (!li) return
  li.classList.add(ok ? "done" : "failed")
  li.querySelector(".state")!.replaceChildren(ok ? "✓" : "✕")
  if (suffix) li.lastElementChild!.append(el("span", { className: "muted" }, ` · ${suffix}`))
}

const describeSites = (sites: string[]) =>
  sites.length === 0
    ? "myndigheternas webbplatser"
    : sites.length <= 3
      ? sites.join(", ")
      : `${sites.slice(0, 3).join(", ")} m.fl.`

// Re-rendering markdown on every token is wasteful; once per frame is plenty
let renderQueued = false
const scheduleRender = (turn: TurnView) => {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    turn.answer.innerHTML = renderMarkdown(turn.text)
    keepInView()
  })
}

/**
 * Follow the answer as it grows — unless the reader has scrolled away. The
 * page continues below the conversation (about, footer), so "the end" is the
 * bottom of the prompt dock, not the bottom of the document.
 */
let followOutput = true
const conversationEnd = () =>
  composerDock.getBoundingClientRect().bottom + window.scrollY - window.innerHeight
const keepInView = () => {
  if (followOutput) window.scrollTo({ top: Math.max(0, conversationEnd()) })
}
window.addEventListener(
  "wheel",
  () => {
    followOutput = Math.abs(window.scrollY - conversationEnd()) < 160
  },
  { passive: true },
)

const summarize = (turn: TurnView) => {
  const parts: string[] = []
  if (turn.searches) parts.push(`${turn.searches} ${turn.searches === 1 ? "sökning" : "sökningar"}`)
  if (turn.reads) parts.push(`${turn.reads} ${turn.reads === 1 ? "sida läst" : "sidor lästa"}`)
  return parts.length ? `Underlag: ${parts.join(", ")}` : "Svar"
}

const renderSources = (turn: TurnView, sources: Source[]) => {
  if (sources.length === 0) return
  const items = sources.map((s) => {
    // "Pass och nationellt id-kort | Polisen" — the site is already shown above it
    const title = (s.title || "").replace(/\s+[|–—-]\s+[^|–—]+$/, "").trim()
    return el(
      "li",
      {},
      el(
        "a",
        { className: "source", href: s.url, target: "_blank", rel: "noopener noreferrer" },
        el("span", { className: "source-site" }, s.site),
        el(
          "span",
          { className: "source-title" },
          title && title !== s.site ? title : shortUrl(s.url),
        ),
        el("span", { className: "source-host" }, hostOf(s.url)),
      ),
    )
  })
  turn.root.append(
    el("section", { className: "sources" }, el("h3", {}, "Källor"), el("ol", {}, ...items)),
  )
}

const renderError = (turn: TurnView, message: string, question: string) => {
  const retry = el("button", { type: "button" }, "Försök igen")
  retry.addEventListener("click", () => {
    turn.root.remove()
    void submit(question)
  })
  turn.root.append(el("div", { className: "error", role: "alert" }, el("span", {}, message), retry))
}

const handleEvent = (turn: TurnView, event: AgentEvent) => {
  switch (event.type) {
    case "search":
      turn.searches++
      addStep(
        turn,
        event.id,
        `Söker på ${describeSites(event.sites)}: `,
        el("q", {}, event.query),
      )
      break
    case "search-results":
      finishStep(
        turn,
        event.id,
        !event.error,
        event.error ? "sökningen misslyckades" : `${event.count} träffar`,
      )
      break
    case "read":
      addStep(
        turn,
        event.id,
        `Läser ${event.site}: `,
        el("span", { className: "muted" }, shortUrl(event.url)),
      )
      break
    case "read-done":
      if (event.ok) turn.reads++
      finishStep(turn, event.id, event.ok, event.ok ? undefined : "gick inte att läsa")
      break
    case "text":
      if (!turn.text) {
        turn.answer.classList.add("streaming")
        turn.summary.replaceChildren(spinner(), " Skriver svar…")
      }
      turn.text += event.delta
      scheduleRender(turn)
      break
    case "text-reset":
      // The model narrated before a tool call; that text wasn't the answer
      turn.text = ""
      turn.answer.classList.remove("streaming")
      turn.answer.replaceChildren()
      turn.summary.replaceChildren(spinner(), " Letar efter svar…")
      break
    case "done":
      renderSources(turn, event.sources)
      break
    case "error":
      throw new AskError(event.message)
  }
}

// ---------- submit ----------

const submit = async (raw: string) => {
  const question = raw.trim()
  if (!question || running) return

  setConversationMode(true)
  prompt.value = ""
  autosize()

  // The first question becomes the page's URL, so an answer can be shared
  if (history.length === 0) {
    const url = new URL(location.href)
    url.searchParams.set("q", question)
    window.history.replaceState(null, "", url)
  }

  const turn = createTurn(question)
  followOutput = true
  keepInView()

  const controller = new AbortController()
  running = controller
  syncComposer()

  const messages: ChatTurn[] = [...history, { role: "user", content: question }]
  let completed = false

  try {
    await ask(messages, (event) => handleEvent(turn, event), controller.signal)
    if (!turn.text.trim()) throw new AskError("Inget svar kom tillbaka. Försök igen.")
    completed = true
  } catch (e) {
    if (controller.signal.aborted) {
      turn.root.append(el("p", { className: "muted" }, "Avbrutet."))
    } else {
      // Close any step still spinning, then say what went wrong
      for (const id of turn.stepById.keys()) {
        if (!turn.stepById.get(id)!.matches(".done, .failed")) finishStep(turn, id, false)
      }
      renderError(
        turn,
        e instanceof AskError ? e.message : "Något gick fel. Försök igen.",
        question,
      )
    }
  } finally {
    turn.answer.classList.remove("streaming")
    if (turn.text) turn.answer.innerHTML = renderMarkdown(turn.text)
    turn.summary.replaceChildren(summarize(turn))
    turn.activity.open = false
    if (turn.steps.children.length === 0) turn.activity.remove()

    // Only a finished answer joins the history a follow-up is asked against
    if (completed) {
      history.push({ role: "user", content: question }, { role: "assistant", content: turn.text })
    }
    running = null
    syncComposer()
    prompt.focus({ preventScroll: true })
  }
}

const reset = () => {
  running?.abort()
  running = null
  history.length = 0
  thread.replaceChildren()
  setConversationMode(false)
  window.history.replaceState(null, "", location.pathname)
  prompt.value = ""
  autosize()
  syncComposer()
  window.scrollTo({ top: 0 })
  prompt.focus()
}

// ---------- wiring ----------

const carousel = createCarousel({
  scenes: [...document.querySelectorAll<HTMLButtonElement>("#scenes .scene")],
  controls: document.querySelector<HTMLElement>(".carousel-controls")!,
  prev: $<HTMLButtonElement>("scene-prev"),
  next: $<HTMLButtonElement>("scene-next"),
  toggle: $<HTMLButtonElement>("scene-toggle"),
  hoverArea: document.querySelector<HTMLElement>(".scene-card")!,
  intervalMs: 6000,
  onChange: (question) => {
    if (!document.body.classList.contains("has-thread")) {
      prompt.placeholder = examplePlaceholder(question)
    }
  },
})

form.addEventListener("submit", (e) => {
  e.preventDefault()
  if (running) {
    running.abort()
    return
  }
  void submit(prompt.value)
})

prompt.addEventListener("keydown", (e) => {
  // Enter sends, Shift+Enter breaks the line; never mid-IME-composition
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    form.requestSubmit()
  }
})

prompt.addEventListener("input", () => {
  autosize()
  syncComposer()
})

// The hero scenes: clicking a picture asks its question
document.querySelectorAll<HTMLButtonElement>("[data-suggestion]").forEach((scene) => {
  scene.addEventListener("click", () => void submit(scene.dataset.suggestion ?? ""))
})

newQuestion.addEventListener("click", reset)
document.querySelectorAll<HTMLAnchorElement>("[data-reset]").forEach((link) => {
  link.addEventListener("click", (e) => {
    if (document.body.classList.contains("has-thread")) {
      e.preventDefault()
      reset()
    }
  })
})

// "Ställ en fråga" links: back up to the prompt box, wherever it is
document.querySelectorAll<HTMLAnchorElement>("[data-focus-prompt]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault()
    if (document.body.classList.contains("has-thread")) {
      composerDock.scrollIntoView({ behavior: "smooth", block: "end" })
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
    prompt.focus({ preventScroll: true })
  })
})

// ---------- menu ----------

const menuButton = $<HTMLButtonElement>("menu-button")
const menuPanel = $<HTMLElement>("menu-panel")

const setMenu = (open: boolean) => {
  menuPanel.hidden = !open
  menuButton.setAttribute("aria-expanded", String(open))
}
menuButton.addEventListener("click", () => setMenu(menuPanel.hidden))
menuPanel.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("a")) setMenu(false)
})
document.addEventListener("click", (e) => {
  if (!menuPanel.hidden && !(e.target as HTMLElement).closest(".menu")) setMenu(false)
})
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !menuPanel.hidden) {
    setMenu(false)
    menuButton.focus()
  }
})

// ---------- the list of searched sites ----------

const siteList = $<HTMLElement>("site-list")
const siteListBody = $<HTMLElement>("site-list-body")
const siteListToggle = $<HTMLButtonElement>("site-list-toggle")
let sitesRequested = false

const loadSites = async () => {
  if (sitesRequested) return
  sitesRequested = true
  try {
    const catalog = await fetchSites()
    siteListBody.replaceChildren(
      ...catalog.categories.map((category) =>
        el(
          "div",
          { className: "site-list-group" },
          el("h3", {}, `${category.label} `, el("span", {}, String(category.sites.length))),
          el(
            "ul",
            {},
            ...category.sites.map((s) =>
              el(
                "li",
                {},
                el(
                  "a",
                  { href: `https://${s.domain}`, target: "_blank", rel: "noopener noreferrer" },
                  s.name.split(" – ")[0],
                ),
              ),
            ),
          ),
        ),
      ),
    )
    siteList.dataset.state = "collapsed"
    siteListToggle.textContent = `Visa alla ${catalog.count} webbplatser`
    siteListToggle.hidden = false
  } catch {
    sitesRequested = false
    siteList.dataset.state = "error"
    siteListBody.replaceChildren(
      el("p", { className: "muted" }, "Listan kunde inte hämtas just nu."),
    )
  }
}

siteListToggle.addEventListener("click", () => {
  const expand = siteList.dataset.state === "collapsed"
  siteList.dataset.state = expand ? "expanded" : "collapsed"
  siteListToggle.textContent = expand
    ? "Visa färre"
    : `Visa alla ${siteListBody.querySelectorAll("li").length} webbplatser`
  if (!expand) siteList.scrollIntoView({ block: "nearest" })
})

// Fetched when the section comes near the viewport, not on page load
new IntersectionObserver(
  (entries, observer) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect()
      void loadSites()
    }
  },
  { rootMargin: "400px" },
).observe(siteList)

// Shared links: /?q=… asks straight away
const initial = new URLSearchParams(location.search).get("q")
if (initial) {
  void submit(initial)
} else if (window.matchMedia("(pointer: fine)").matches) {
  // Only with a mouse — on a phone, focusing would throw the keyboard up on load
  prompt.focus({ preventScroll: true })
}
syncComposer()
