import type { Connector } from "./connector.ts"
import { mobbin } from "./mobbin.ts"
import { unsplash } from "./unsplash.ts"

export * from "./connector.ts"

export * from "./request.ts"

export { mobbin } from "./mobbin.ts"

export { unsplash } from "./unsplash.ts"

/** Every connector Parity has, in the order the app lists them. */
export const connectors: readonly Connector[] = [mobbin, unsplash]

/** Each connector's key from the environment, by its id, as a development copy sets them. Blank counts as unset. */
export function keysFromEnvironment(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    connectors.flatMap(({ info }) => {
      const key = info.apiKey ? env[info.apiKey.variable]?.trim() : undefined

      return key ? [[info.id, key]] : []
    })
  )
}

/** The environment without any connector's key, for a process that mustn't have them. */
export function withoutKeys(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const variables = new Set(connectors.flatMap(({ info }) => (info.apiKey ? [info.apiKey.variable] : [])))

  return Object.fromEntries(Object.entries(env).filter(([name]) => !variables.has(name)))
}
