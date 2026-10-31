import { stat } from "node:fs/promises"
import { basename, dirname, join, relative, resolve } from "node:path"
import { LOCKS } from "package-manager-detector/constants"

/** The lockfiles in one folder, by name, in the order package-manager-detector checks them. */
export interface FoundLockfiles {
  /** The folder, absolute. */
  folder: string
  /** Every recognized lockfile in it, the one detection reads first. */
  names: string[]
}

/**
 * The nearest folder from the root up that has a lockfile, and every one in it that `package-manager-detector`
 * recognizes (its `LOCKS`, which counts `npm-shrinkwrap.json`, `deno.lock` and `pnpm-workspace.yaml`). Detection names
 * the first as the project's lockfile, and the detection fingerprint hashes them all, since a package manager can read
 * one that isn't first: npm prefers `npm-shrinkwrap.json` to `package-lock.json`.
 */
export async function nearestLockfiles(root: string): Promise<FoundLockfiles | undefined> {
  for (let folder = resolve(root); ; folder = dirname(folder)) {
    const names: string[] = []
    for (const name of Object.keys(LOCKS)) if (await isFile(join(folder, name))) names.push(name)
    if (names.length > 0) return { folder, names }
    if (dirname(folder) === folder) return undefined
  }
}

/** {@link nearestLockfiles}, relative to the root with forward slashes, the one detection names first. */
export async function findLockfiles(root: string): Promise<string[]> {
  const found = await nearestLockfiles(root)
  return found ? found.names.map((name) => relative(root, join(found.folder, name)).replaceAll("\\", "/")) : []
}

/**
 * The folders whose lockfiles decide what {@link findLockfiles} finds, absolute: the root and each folder above it, up
 * to the one `lockfiles` (its answer) are in, or to the top when it found none. A lockfile appearing in any of them, as
 * `npm-shrinkwrap.json` beside `package-lock.json` or one nearer the root than the workspace's, changes the answer.
 */
export function lockfileFolders(root: string, lockfiles: readonly string[]): string[] {
  const found = lockfiles[0] === undefined ? undefined : dirname(resolve(root, lockfiles[0]))
  const folders: string[] = []
  for (let folder = resolve(root); ; folder = dirname(folder)) {
    folders.push(folder)
    if (folder === found || dirname(folder) === folder) return folders
  }
}

/** Whether a change to `file` (absolute) can change what {@link findLockfiles} finds, given {@link lockfileFolders}. */
export function changesLockfiles(file: string, folders: readonly string[]): boolean {
  const path = resolve(file)
  return basename(path) in LOCKS && folders.includes(dirname(path))
}

async function isFile(path: string): Promise<boolean> {
  return stat(path).then(
    (stats) => stats.isFile(),
    () => false
  )
}
