import type { Parity } from "@parity-app/extension-api"
import { viteAppStyles } from "./app-styles.ts"
import { detectVite } from "./builder.ts"

/*
 * Vite as an extension (PAR-1095), using only Parity's public API. Its builder provider asks the project's own Vite
 * whether it serves the project, with its version and config file, and which global stylesheets the app loads. What starts the dev server is its entry module
 * (`./builder`, named in the manifest), which runs in the builder process; the manifest also names the config files
 * whose coming or going means the project is detected again. The status bar names it.
 */

export function activate(parity: Parity): void {
  const { root } = parity.project
  const status = parity.status.item("vite.status")
  status.set({ value: "Vite", tooltip: "Builds the project" })
  parity.subscriptions.push(status)

  parity.subscriptions.push(
    parity.providers.register("builder", { detect: () => detectVite(root), styles: () => viteAppStyles(root) })
  )
}
