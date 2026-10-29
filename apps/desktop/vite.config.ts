import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * A second copy of the app, such as the one `pnpm perf` starts, runs on its own port, with its own dependency cache so
 * the two servers never rewrite each other's.
 */
const port = Number(process.env.PARITY_UI_PORT ?? 5310)

/** The canvas UI itself. Customer projects are served by their own builder, not by this config. */
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "src/renderer") }
  },
  ...(port === 5310 ? {} : { cacheDir: resolve(import.meta.dirname, `node_modules/.vite-${port}`) }),
  server: {
    port,
    strictPort: true,
    // Forwarding wraps console.error and warn, so every message would seem to come from Vite's client. Parity tells a
    // project's messages from its own by the script that wrote them.
    forwardConsole: false
  },
  build: { outDir: "../../out/renderer", emptyOutDir: true }
})
