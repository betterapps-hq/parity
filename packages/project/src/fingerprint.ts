import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { dirname, join, relative, resolve } from "node:path"
import type { ComponentSource } from "@parity/core"
import type { ProjectTsconfig } from "./tsconfig.ts"

const lockfiles = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"]

/**
 * A fingerprint of what the type checker and props read in a project: the app's files and its components' files, by
 * contents, its tsconfigs and package.json, the lockfile (in its folder or the nearest above), which pins what installed
 * packages declare, and the components as listed. Equal fingerprints mean reading them again gives the same answers, so
 * results saved under one can be used. `salt` stands for the reader itself: a new version of it reads differently.
 */
export async function detectionFingerprint(
  root: string,
  files: readonly string[],
  sources: Record<string, ComponentSource>,
  tsconfig: ProjectTsconfig,
  salt: string
): Promise<string> {
  const own = Object.values(sources).flatMap((source) => {
    const file = source.declaration ?? (source.library ? undefined : source.path)
    return file && !file.includes("node_modules/") ? [file] : []
  })
  const paths = new Set([
    ...files,
    ...own,
    ...tsconfig.configs.map((config) => config.path),
    "package.json",
    ...(lockfileOf(root) ?? [])
  ])
  const hash = createHash("sha256").update(salt).update("\0")
  const ids = Object.keys(sources).sort()
  hash.update(JSON.stringify(ids.map((id) => [id, sources[id]])))
  for (const path of [...paths].sort()) {
    const contents = await readFile(resolve(root, path)).catch(() => undefined)
    hash.update(`\0${path}\0`)
    if (contents) hash.update(contents)
  }
  return hash.digest("hex")
}

/** The project's lockfile, relative to the root: in its folder, or a workspace's above it. */
function lockfileOf(root: string): string[] | undefined {
  for (let folder = resolve(root); ; folder = dirname(folder)) {
    const found = lockfiles.find((name) => existsSync(join(folder, name)))
    if (found) return [relative(root, join(folder, found)).replaceAll("\\", "/")]
    if (dirname(folder) === folder) return undefined
  }
}
