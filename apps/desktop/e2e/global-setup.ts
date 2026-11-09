import type { TestProject } from "vite-plus/test/node"
import { print } from "../../../scripts/output.ts"
import { type Launched, launch } from "./launch.ts"

declare module "vite-plus/test" {
  export interface ProvidedContext {
    app: Launched
  }
}

/** Starts one copy of Parity for the whole run, and stops it and removes its files afterwards, failed or not. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const started = Date.now()

  const app = await launch().catch((cause: unknown) => {
    // Vitest can't always print an error from here with its stack, so the message goes out first.
    console.error(cause instanceof Error ? cause.message : cause)
    throw cause
  })

  print(`Parity started in ${Math.round((Date.now() - started) / 1000)}s on ports ${app.uiPort} and ${app.debugPort}`)
  project.provide("app", {
    uiPort: app.uiPort,
    debugPort: app.debugPort,
    project: app.project,
    profile: app.profile,
    log: app.log
  })

  return () => app.stop()
}
