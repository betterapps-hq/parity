import { readFile } from "node:fs/promises"
import { posix } from "node:path"

/*
 * Modules of the project's that only Next's server can compile. The guest module is a client module, so everything it
 * imports is built for the browser, and Next fails the whole guest page for one module it can't build there: a page or
 * layout that exports `metadata`, or one that imports `next/headers`, `server-only` or `next/document`, which only
 * Next's Pages Router renders. The guest app imports each of
 * those from a stand-in that throws why, so only that module's components fail, each with the reason.
 */

/** What only a server component may export, which Next refuses to build for the browser. */
const serverExports =
  /^\s*export\s+(?:(?:const|let|var)\s+(?:metadata|viewport)\b|(?:async\s+)?function\s+(?:generateMetadata|generateViewport)\b)|^\s*export\s*\{[^}]*\b(?:metadata|generateMetadata|viewport|generateViewport)\b[^}]*\}/m

/** What only a server component, or a Pages Router document, may import. */
const serverImports = /^\s*import\s+(?:[^"';]*?\bfrom\s*)?["'](server-only|next\/headers|next\/document)["']/m

/** A module that says it's a client module, which Next builds for the browser whatever it imports. */
const clientDirective = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/

/** What makes a module with this source one Next can't build for the browser, or nothing when it can. */
export function serverOnlyReason(source: string): string | undefined {
  if (clientDirective.test(source)) {
    return undefined
  }

  const exported = serverExports.exec(source)?.[0].match(/generateMetadata|generateViewport|metadata|viewport/)?.[0]

  if (exported) {
    return `exports ${exported}`
  }

  const imported = serverImports.exec(source)?.[1]

  if (imported) {
    return `imports ${imported}`
  }

  return undefined
}

/** Where the stand-ins are, from the guest app's folder. */
export const standInFolder = "app/server-only"

/** A stand-in for a module Next can't build for the browser: a file of the guest app that throws why. */
export interface StandIn {
  /** The project module's path, from the root. */
  module: string
  /** The stand-in's path, from the guest app's folder. */
  path: string
  text: string
}

/** Stand-ins for those of the project's modules, by path from the root, that only Next's server can compile. */
export async function serverOnlyStandIns(root: string, modules: readonly string[]): Promise<StandIn[]> {
  const reasons = await Promise.all(
    modules.map(async (module) => {
      const source = await readFile(posix.join(root.replaceAll("\\", "/"), module), "utf8").catch(() => "")

      return serverOnlyReason(source)
    })
  )

  return modules.flatMap((module, index) => {
    const reason = reasons[index]
    const kind = reason === "imports next/document" ? "a Pages Router document" : "a server component"

    return reason
      ? [
          {
            module,
            path: `${standInFolder}/${index}.js`,
            text: `throw new Error(${JSON.stringify(`${module} ${reason}, so it's ${kind}, which the canvas can't draw yet`)})\n`
          }
        ]
      : []
  })
}
