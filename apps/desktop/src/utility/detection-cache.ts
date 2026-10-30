import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import type { ComponentInfo, ComponentSource, LeftOutExport } from "@parity-app/core"
import { type DiscoveredProject, detectionFingerprint, readTsconfig } from "@parity-app/project"
import { checkerVersion } from "./props.ts"

/**
 * What the type checker and props found in a project, saved outside it under a fingerprint of what they read, so
 * reopening it unchanged doesn't start over: copacker's took 10 seconds and over a gigabyte.
 */
export interface SavedDetection {
  fingerprint: string
  /** The components once the checker had read them. */
  sources: Record<string, ComponentSource>
  props: Record<string, ComponentInfo>
  /** The exports the checker left out, with why. */
  leftOut?: LeftOutExport[]
}

const cacheDir = process.env.PARITY_CACHE_DIR ?? join(homedir(), ".parity", "cache", "detection")

function cacheFile(root: string): string {
  return join(cacheDir, `${createHash("sha256").update(root).digest("hex").slice(0, 24)}.json`)
}

/** The project's fingerprint as discovered, and what was saved under it last time, if anything. */
export async function savedDetection(
  root: string,
  config: DiscoveredProject
): Promise<{ fingerprint: string; saved?: SavedDetection }> {
  const fingerprint = await fingerprintOf(root, config.componentFiles, config.components)
  try {
    const saved = JSON.parse(await readFile(cacheFile(root), "utf8")) as SavedDetection
    return saved.fingerprint === fingerprint ? { fingerprint, saved } : { fingerprint }
  } catch {
    return { fingerprint }
  }
}

/**
 * Saves what the checker and props found, unless the project's files changed while they read it: the results then
 * belong to neither version. `discovered` is the list as discovery made it, which the fingerprint was taken of.
 */
export async function saveDetection(
  root: string,
  files: string[],
  discovered: Record<string, ComponentSource>,
  fingerprint: string,
  found: Omit<SavedDetection, "fingerprint">
): Promise<void> {
  if ((await fingerprintOf(root, files, discovered)) !== fingerprint) return
  try {
    await mkdir(cacheDir, { recursive: true })
    await writeFile(cacheFile(root), JSON.stringify({ fingerprint, ...found }))
  } catch (error) {
    console.warn(
      `[service] couldn't save what the type checker found: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

function fingerprintOf(root: string, files: string[], sources: Record<string, ComponentSource>): Promise<string> {
  return detectionFingerprint(root, files, sources, readTsconfig(root), checkerVersion)
}
