import type { Connector } from "./connector.ts"
import { mobbin } from "./mobbin.ts"
import { pixabay } from "./pixabay.ts"
import { unsplash } from "./unsplash.ts"

export * from "./connector.ts"

export * from "./recent.ts"

export * from "./request.ts"

export { mobbin } from "./mobbin.ts"

export { pixabay } from "./pixabay.ts"

export { unsplash } from "./unsplash.ts"

/**
 * Every connector Parity has, in the order the app lists them, whether or not it's offered: one that isn't still says
 * what its results and the project's images from it are called and where they're from.
 */
export const connectors: readonly Connector[] = [mobbin, pixabay, unsplash]

/**
 * The connectors the app searches with, for the window and agents. Pixabay finds photos in place of Unsplash, whose
 * terms ask for more and which has no videos; Unsplash's connector is kept to go back to.
 */
export const offered: readonly Connector[] = [mobbin, pixabay]

/** A connector by its id, offered or not, for naming where a result or a project's image came from. */
export function connectorById(id: string): Connector | undefined {
  return connectors.find(({ info }) => info.id === id)
}

/** Each connector's key from the environment, by its id, as a development copy sets them. Blank counts as unset. */
export function keysFromEnvironment(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    connectors.flatMap(({ info }) => {
      const key = info.auth.type === "key" ? env[info.auth.variable]?.trim() : undefined

      return key ? [[info.id, key]] : []
    })
  )
}

/**
 * What a key's variable looks like, as each connector names it: `PARITY_MOBBIN_API_KEY`. In any letter case, since
 * Windows reads a variable whatever its case, so one set as `parity_mobbin_api_key` is still a key to keep away.
 */
export const keyVariable = /^PARITY_\w+_KEY$/i

/**
 * The environment without any connector's key, for a process that mustn't have them. It leaves out every variable
 * that looks like one, as `pnpm dev` passes on every such variable from `.env.local`, not only the ones named today.
 */
export function withoutKeys(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !keyVariable.test(name)))
}
