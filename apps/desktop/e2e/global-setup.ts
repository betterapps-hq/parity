import type { TestProject } from "vite-plus/test/node"
import { type Launched, launch } from "./launch.ts"

declare module "vite-plus/test" {
  export interface ProvidedContext {
    app: Launched
  }
}

/** Starts one copy of Parity for the whole run, and stops it and removes its files afterwards, failed or not. */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const started = Date.now()
  const app = await launch().catch((error: unknown) => {
    // Vitest can't always print an error from here with its stack, so the message goes out first.
    console.error(error instanceof Error ? error.message : error)
    throw error
  })
  console.log(
    `Parity started in ${Math.round((Date.now() - started) / 1000)}s on ports ${app.uiPort} and ${app.debugPort}`
  )
  project.provide("app", { uiPort: app.uiPort, debugPort: app.debugPort, project: app.project })
  return () => app.stop()
}
