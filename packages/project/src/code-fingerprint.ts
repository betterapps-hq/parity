import { createHash } from "node:crypto"
import { opendir, stat } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { findLockfiles } from "./lockfile.ts"

/** Folders a project builds into or tools fill, which the app's code never comes from. */
const skippedFolders = new Set(["node_modules", "dist", "build", "out", "coverage", "storybook-static"])

/** Most a project's files are listed, past which the rest go uncounted: a folder that size is no app's source. */
const mostFiles = 50_000

/** A project's code at one moment, as `codeSnapshot` takes it. */
export interface CodeSnapshot {
  /** The whole project: any file's change gives a new one. Kept frame bitmaps are named by it. */
  fingerprint: string
  /**
   * Each file's size and modification time (`"size:mtime"`), by its path relative to the root with forward slashes;
   * lockfiles above the root start with `../`. Component previews are named by the files they import (PAR-207).
   */
  files: ReadonlyMap<string, string>
  /** What it was taken with, for the code that draws it. */
  salt: string
}

/**
 * A project's code as its builder serves it: the path, size and modification time of every file in the project, and of
 * the lockfiles above it (see `findLockfiles`), with `salt` for the code that draws it. It skips dependencies, build
 * output, dot-folders and designs (`.par`), which a frame's tree already says. Any edit, CSS and config included, gives
 * a new fingerprint; a file only touched does too, which costs a cache miss at most.
 */
export async function codeSnapshot(root: string, salt: string): Promise<CodeSnapshot> {
  const hash = createHash("sha256").update(salt).update("\0")
  const listed: [string, string][] = []
  await list(resolve(root), resolve(root), listed)
  for (const lockfile of await findLockfiles(root)) {
    if (lockfile.startsWith("../")) listed.push([lockfile, resolve(root, lockfile)])
  }
  listed.sort(([a], [b]) => a.localeCompare(b, "en"))
  const files = new Map<string, string>()
  for (const [path, absolute] of listed) {
    const info = await stat(absolute).catch(() => undefined)
    const stamp = info ? `${info.size}:${Math.trunc(info.mtimeMs)}` : "-"
    hash.update(`${path}\0${stamp}\0`)
    if (info) files.set(path, stamp)
  }
  return { fingerprint: hash.digest("hex"), files, salt }
}

async function list(root: string, folder: string, files: [string, string][]): Promise<void> {
  const entries = await opendir(folder).catch(() => undefined)
  if (!entries) return
  for await (const entry of entries) {
    if (files.length >= mostFiles) return
    const absolute = join(folder, entry.name)
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && !skippedFolders.has(entry.name)) await list(root, absolute, files)
    } else if (entry.isFile() && !entry.name.endsWith(".par")) {
      files.push([relative(root, absolute).replaceAll("\\", "/"), absolute])
    }
  }
}
