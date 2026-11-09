// Which React build the canvas UI's dev server gives Parity's window. `pnpm dev` runs the development build, for
// StrictMode's checks, Fast Refresh and React's warnings (PAR-550). `pnpm dev:prod`, and the copies `pnpm perf` starts,
// run the production build, which made selecting, editing and undo 3 to 10 times faster on the example project
// (PAR-519). The dev script takes the build as `--react production` and starts Vite in `reactProductionMode`, which the
// UI's Vite config reads; anything else that uses the config, such as Storybook, keeps the development build.
import { resolve } from "node:path"

export type ReactBuild = "production" | "development"

/** The Vite mode the dev script starts the UI's server in for React's production build. */
export const reactProductionMode = "react-production"

/** The build a `--react` flag names, where none is the development build. */
export function reactBuild(value: string | undefined): ReactBuild {
  if (value === undefined || value === "development") {
    return "development"
  }

  if (value === "production") {
    return "production"
  }

  throw new Error(`--react is ${JSON.stringify(value)}, but it takes "production" or "development"`)
}

/** The build `--react` names among a script's arguments, and the arguments left once it's taken out. */
export function reactFlag(args: readonly string[]): { build: ReactBuild; rest: string[] } {
  const index = args.indexOf("--react")

  if (index === -1) {
    return { build: "development", rest: [...args] }
  }

  const value = args[index + 1]

  if (value === undefined || value.startsWith("--")) {
    throw new Error('--react needs "production" or "development"')
  }

  return { build: reactBuild(value), rest: args.filter((_, at) => at !== index && at !== index + 1) }
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
  if (build === "development") {
    return { react: {}, alias: {}, dependencies: {} }
  }

  return {
    react: { include: noModule },
    alias: { "react/jsx-dev-runtime": jsxDevRuntimeStandIn },
    dependencies: { transform: { define: { "process.env.NODE_ENV": JSON.stringify("production") } } }
  }
}
