// Which React build the canvas UI's dev server gives Parity's window (PAR-519). `pnpm dev`, and the copies `pnpm perf`
// starts, ask for the production build, which made selecting, editing and undo 3 to 10 times faster on the example
// project; PARITY_REACT=development brings back the development build, for its warnings and StrictMode's checks. Other
// users of the UI's Vite config, such as Storybook, set nothing and keep the development build.
import { resolve } from "node:path"

export type ReactBuild = "production" | "development"

/** The build PARITY_REACT names, where unset is the development build. */
export function reactBuild(value: string | undefined): ReactBuild {
  if (value === undefined || value === "" || value === "development") return "development"
  if (value === "production") return "production"
  throw new Error(`PARITY_REACT is ${JSON.stringify(value)}, but it takes "production" or "development"`)
}

/** Stands in for `react/jsx-dev-runtime`, whose `jsxDEV` React's production build leaves out. */
export const jsxDevRuntimeStandIn = resolve(import.meta.dirname, "jsx-dev-runtime.ts")

/** plugin-react's options, the UI's aliases and the dependency optimizer's Rolldown options, for a build. */
export interface ReactBuildConfig {
  react: { include?: RegExp }
  alias: Record<string, string>
  dependencies: { transform?: { define: Record<string, string> } }
}

/** A filter no module's id matches. An empty list would match every module. */
const noModule = /(?!)/

/**
 * What the UI's Vite config adds for a build: nothing for the development build. For the production build, the
 * prebundled dependencies, React's among them, are built with `process.env.NODE_ENV` set to `production`, as
 * builder-vite's `productionDependencies` builds a project's for its frames (PAR-198). The app's own modules are still
 * served as in development and their JSX still calls `jsxDEV`, so `react/jsx-dev-runtime` goes to a stand-in that is
 * React's `jsx`. Fast Refresh is off, since it reaches React through its development build alone: an edited component
 * would be taken in and never drawn again, where without it the page reloads.
 */
export function reactBuildConfig(build: ReactBuild): ReactBuildConfig {
  if (build === "development") return { react: {}, alias: {}, dependencies: {} }
  return {
    react: { include: noModule },
    alias: { "react/jsx-dev-runtime": jsxDevRuntimeStandIn },
    dependencies: { transform: { define: { "process.env.NODE_ENV": JSON.stringify("production") } } }
  }
}
