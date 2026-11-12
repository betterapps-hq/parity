import { cloudflare } from "@cloudflare/vite-plugin"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite-plus"

/**
 * Parity's service (docs/proposals/service.md): a TanStack Start app that runs in a Cloudflare Worker. The Cloudflare
 * plugin runs the server in Workers' own runtime, in `vp dev` too, and has to come before Start's; React's comes after.
 */
export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), tanstackStart(), react()]
})
