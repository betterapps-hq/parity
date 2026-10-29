import { existsSync, realpathSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

/**
 * The folder of a package installed for `from`: the first `node_modules/<name>` in it or a folder above, with links
 * followed, as pnpm links packages. Unlike `require.resolve` it never falls back to NODE_PATH, which pnpm's bin shims
 * point at Parity's own dependencies, so a project without the package isn't handed Parity's copy.
 */
export function installedPackage(from: string, name: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", name)
    if (existsSync(join(candidate, "package.json"))) return realpathSync(candidate)
    if (dirname(dir) === dir) return undefined
  }
}

/** The file an installed package's `require` export points at, resolved from inside it as a self-reference. */
export function packageEntry(dir: string, name: string): string {
  return createRequire(join(dir, "package.json")).resolve(name)
}
