import { registerHooks } from "node:module"

/**
 * Sends `react` to React 18 wherever Node loads it, as React 18's react-dom does. pnpm links that react-dom to the
 * package's React 19, its peer, and Vite's aliases don't reach a package Node loads itself.
 */
registerHooks({
  resolve(specifier, context, next) {
    const react18 = /^react(\/.*)?$/.exec(specifier)

    return react18
      ? next(`react-18${react18[1] ?? ""}`, { ...context, parentURL: import.meta.url })
      : next(specifier, context)
  }
})
