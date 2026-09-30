import { marked } from "marked"
import DOMPurify from "dompurify"

/**
 * Model output → safe HTML. The text is written by a model that just read
 * arbitrary web pages, so it is sanitized like any untrusted input.
 */

marked.setOptions({ gfm: true, breaks: false })

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? ""
    if (/^https?:\/\//i.test(href)) {
      node.setAttribute("target", "_blank")
      node.setAttribute("rel", "noopener noreferrer")
    } else if (!href.startsWith("#")) {
      // Relative or odd links point nowhere useful on our page
      node.removeAttribute("href")
    }
  }
})

export const renderMarkdown = (text: string): string =>
  DOMPurify.sanitize(marked.parse(text, { async: false }), {
    FORBID_TAGS: ["img", "style", "iframe", "form", "input", "button"],
    FORBID_ATTR: ["style"],
  })
    // A wide table scrolls inside its own box instead of widening the page.
    // Safe after sanitizing: we only add our own attribute-free wrapper.
    .replace(/<table>/g, '<div class="table-scroll"><table>')
    .replace(/<\/table>/g, "</table></div>")
