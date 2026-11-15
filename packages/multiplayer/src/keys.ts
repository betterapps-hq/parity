import type { DesignKey } from "./types.ts"

/** The key of a design in a file, `app.par#home`, as `containerKey` in the window makes it today. */
export function designKey(path: string, id: string): DesignKey {
  return `${path}#${id}`
}

/** A design key's file and id, or undefined when it isn't one. */
export function splitKey(key: DesignKey): { path: string; id: string } | undefined {
  const split = key.lastIndexOf("#")

  return split > 0 && split < key.length - 1 ? { path: key.slice(0, split), id: key.slice(split + 1) } : undefined
}
