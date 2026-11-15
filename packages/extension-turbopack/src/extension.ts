import type { Parity } from "@parity-app/extension-api"
import { nextAppStyles } from "@parity-app/next-builders"
import { detectTurbopack } from "./builder.ts"

/*
 * Turbopack as an extension (PAR-1149), using only Parity's public API. Its builder provider asks the project's own
 * Next whether its dev server runs Turbopack, with Next's version and config file, and which global stylesheets the
 * root layout loads. What builds and serves the guest is its entry module (`./builder`, named in the manifest), which
 * runs in the builder process; the manifest also names the files whose changing means the project is detected again.
 */

export function activate(parity: Parity): void {
  const { root } = parity.project
  const status = parity.status.item("turbopack.status")
  status.set({ value: "Turbopack", tooltip: "Builds the project" })
  parity.subscriptions.push(status)

  parity.subscriptions.push(
    parity.providers.register("builder", { detect: () => detectTurbopack(root), styles: () => nextAppStyles(root) })
  )
}
