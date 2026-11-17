import { defineExtension, type Parity } from "@parity-app/extension"
import { detectLibraries, readProjectFiles, shadcnCatalog, shadcnRemoval, shadcnSetup } from "./shadcn.ts"

/*
 * shadcn/ui as an extension (PAR-1226, PAR-1227), using only Parity's public API: a libraries provider that tells Parity
 * which registry file describes the components shadcn-sync generated or shadcn's CLI copied, and sets Shadcn up from the
 * Components panel through shadcn-sync, or takes it out again. It starts with any React project, so the catalog offers Shadcn before the
 * project has it.
 */

export default defineExtension({ activate })

function activate(parity: Parity): void {
  // Read afresh for each call, since setting Shadcn up changes them.
  const read = () => readProjectFiles((path) => parity.files.read(path))

  parity.subscriptions.push(
    parity.providers.register("libraries", {
      detect: async () => detectLibraries(await read()),
      catalog: async () => shadcnCatalog(await read()),
      async add({ library, settings }) {
        if (library !== "shadcn") {
          throw new Error(`shadcn/ui sets up Shadcn, not ${library}`)
        }

        return shadcnSetup(await read(), settings)
      },
      async remove({ library }) {
        if (library !== "shadcn") {
          throw new Error(`shadcn/ui takes out Shadcn, not ${library}`)
        }

        return shadcnRemoval(await read())
      }
    })
  )
}
