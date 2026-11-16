import { defineExtension, type Parity } from "@parity-app/extension"
import { detectRsbuild, rsbuildAppStyles } from "./builder.ts"

/*
 * Rsbuild as an extension (PAR-1148), using only Parity's public API. Its builder provider asks the project's own Rsbuild
 * whether it builds the project, with its version and config file, and which global stylesheets the app loads. What
 * builds and serves the guest is its entry module (`./builder`, named in the manifest), which runs in the builder
 * process; the manifest also names the config files whose coming or going means the project is detected again.
 */

export default defineExtension({ activate })

function activate(parity: Parity): void {
  const { root } = parity.project
  const status = parity.status.item("rsbuild.status")
  status.set({ value: "Rsbuild", tooltip: "Builds the project" })
  parity.subscriptions.push(status)

  parity.subscriptions.push(
    parity.providers.register("builder", { detect: () => detectRsbuild(root), styles: () => rsbuildAppStyles(root) })
  )
}
