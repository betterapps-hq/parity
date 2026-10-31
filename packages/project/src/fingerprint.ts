import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { configInputs, type ProjectTsconfig } from "@parity-app/code"
import type { ComponentSource } from "@parity-app/core"
import { findLockfiles } from "./lockfile.ts"

/**
 * Every file the detection fingerprint reads, relative to the root and sorted: the app's files and its components'
 * own files, and the project's config inputs (`configInputs`): every tsconfig the config reader read (references and
 * `extends` bases included), package.json, and the lockfiles package-manager detection finds (see `findLockfiles`),
 * which pin what installed packages declare. A file outside the root, such as a workspace's lockfile or a shared base
 * config, starts with `../`.
 */
export async function fingerprintInputs(
  root: string,
  files: readonly string[],
  sources: Record<string, ComponentSource>,
  tsconfig: ProjectTsconfig
): Promise<string[]> {
  const own = Object.values(sources).flatMap((source) => {
    const file = source.declaration ?? (source.library ? undefined : source.path)
    return file && !file.includes("node_modules/") ? [file] : []
  })
  const { configs, lockfiles } = configInputs(tsconfig, await findLockfiles(root))
  const paths = new Set([...files, ...own, ...configs, ...lockfiles])
  return [...paths].sort()
}

/**
 * A fingerprint of what the type checker and props read in a project: the contents of its {@link fingerprintInputs},
 * and the components as listed. Equal fingerprints mean reading them again gives the same answers, so results saved
 * under one can be used. `salt` stands for the reader itself: a new version of it reads differently.
 */
export async function detectionFingerprint(
  root: string,
  files: readonly string[],
  sources: Record<string, ComponentSource>,
  tsconfig: ProjectTsconfig,
  salt: string
): Promise<string> {
  const hash = createHash("sha256").update(salt).update("\0")
  const ids = Object.keys(sources).sort()
  hash.update(JSON.stringify(ids.map((id) => [id, sources[id]])))
  for (const path of await fingerprintInputs(root, files, sources, tsconfig)) {
    const contents = await readFile(resolve(root, path)).catch(() => undefined)
    hash.update(`\0${path}\0`)
    if (contents) hash.update(contents)
  }
  return hash.digest("hex")
}
