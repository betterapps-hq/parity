import type { ComponentExport, Parity, SourceFile } from "@parity-app/extension-api"
import { findComponents } from "./components.ts"

/*
 * React as an extension (PAR-1095), using only Parity's public API. Its renderer provider reads which components a
 * project's files export, from their syntax alone, a batch of files at a time. What draws them is its guest module
 * (`./guest`, named in the manifest), which the builder compiles into the project's own build so components render with
 * the project's own React; the manifest also names the packages and modules that guest runs on. The status bar names it.
 * Its peer dependencies say which versions Parity supports, and the renderer is found when the project has them all.
 */

/** The components each file exports, in the order the files are given: what its renderer provider answers. */
export function readComponents(files: readonly SourceFile[]): ComponentExport[][] {
  return files.map(({ file, source }) => findComponents(source, file))
}

export function activate(parity: Parity): void {
  const status = parity.status.item("react.status")
  status.set({ value: "React", tooltip: "Renders the project's components" })
  parity.subscriptions.push(status)

  parity.subscriptions.push(
    parity.providers.register("renderer", {
      components: async ({ files }) => readComponents(files)
    })
  )
}
