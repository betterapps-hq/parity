import { posix } from "node:path"
import type { ComponentSource } from "@parity-app/core"

const moduleExtensions = [".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx", "/index.js"]

/**
 * The key of the project's component that the file at `importer` imports as `imported`, if it's one: a library's by
 * its package name, the project's own by the module the specifier resolves to, relative or through an alias.
 */
export async function componentFor(
  importer: string,
  imported: { specifier: string; name: string },
  components: Record<string, Pick<ComponentSource, "path" | "export" | "library">>,
  resolveAlias: (specifier: string) => Promise<string | undefined>
): Promise<string | undefined> {
  const { specifier, name } = imported

  // A library component is imported by its package name.
  const fromPackage = Object.entries(components).find(
    ([, source]) => source.library && source.path === specifier && source.export === name
  )

  if (fromPackage) {
    return fromPackage[0]
  }

  const base = specifier.startsWith(".")
    ? posix.normalize(posix.join(posix.dirname(importer), specifier))
    : await resolveAlias(specifier)

  if (!base) {
    return undefined
  }

  const stem = base.replace(/\.[cm]?[jt]sx?$/, "")
  const candidates = new Set([base, ...moduleExtensions.map((extension) => stem + extension)])

  const match = Object.entries(components).find(
    ([, source]) => !source.library && candidates.has(source.path) && source.export === name
  )

  return match?.[0]
}
