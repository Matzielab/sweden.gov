// @ts-check
import { defineConfig } from "astro/config"

// A static site: the page talks to the Hono api directly (PUBLIC_API_URL),
// the same way watzie's web app calls its api cross-origin.
export default defineConfig({
  server: { port: 4321 },
  devToolbar: { enabled: false },
})
