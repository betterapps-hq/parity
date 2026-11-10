import type { Connector } from "./connector.ts"
import { mobbin } from "./mobbin.ts"
import { unsplash } from "./unsplash.ts"

export * from "./connector.ts"

export * from "./recent.ts"

export * from "./request.ts"

export { mobbin } from "./mobbin.ts"

export { unsplash } from "./unsplash.ts"

/** Every connector Parity has, in the order the app lists them. */
export const connectors: readonly Connector[] = [mobbin, unsplash]

/** Each connector's key from the environment, by its id, as a development copy sets them. Blank counts as unset. */
export function keysFromEnvironment(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    connectors.flatMap(({ info }) => {
      const key = info.auth.type === "key" ? env[info.auth.variable]?.trim() : undefined

      return key ? [[info.id, key]] : []
    })
  )
}

/** What a key's variable looks like, as each connector names it: `PARITY_MOBBIN_API_KEY`. */
export const keyVariable = /^PARITY_\w+_KEY$/

/**
 * The environment without any connector's key, for a process that mustn't have them. It leaves out every variable
 * that looks like one, as `pnpm dev` passes on every such variable from `.env.local`, not only the ones named today.
 */
export function withoutKeys(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !keyVariable.test(name)))
}
