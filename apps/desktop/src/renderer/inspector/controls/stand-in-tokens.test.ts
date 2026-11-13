import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vite-plus/test"

// docs/editor.md, The style sections on the approved controls: the panel takes the project's tokens, never these.

const here = dirname(fileURLToPath(import.meta.url))
const standIns = resolve(here, "stand-in-tokens.ts")
const panel = resolve(here, "../../chrome/StyleSections.tsx")

/**
 * Each module a file imports at runtime, by its own relative path: type-only imports are left out, as they're erased,
 * and so are stylesheets and other files read as text (`./scrollbars.css?raw`), which import nothing.
 */
function runtimeImports(file: string): string[] {
  const source = readFileSync(file, "utf8")

  return [...source.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"(\.[^"]+)"/gm)].flatMap(([, typeOnly, path]) =>
    typeOnly === undefined && path !== undefined && /\.tsx?$/.test(path) ? [resolve(dirname(file), path)] : []
  )
}

/** The chain of imports from `start` to `target`, or nothing when `start` never reaches it. */
function importChain(start: string, target: string): string[] | undefined {
  const from = new Map<string, string | undefined>([[start, undefined]])
  const queue = [start]

  for (const file of queue) {
    if (file === target) {
      const chain: string[] = []

      for (let at: string | undefined = file; at !== undefined; at = from.get(at)) {
        chain.unshift(at)
      }

      return chain
    }

    for (const next of runtimeImports(file)) {
      if (!from.has(next)) {
        from.set(next, file)
        queue.push(next)
      }
    }
  }

  return undefined
}

describe("the stand-in tokens", () => {
  it("are imported by nothing the Design tab's style sections draw", () => {
    expect(importChain(panel, standIns)).toBeUndefined()
  })
})
