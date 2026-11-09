import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { type ComponentInfo, type ComponentSource, jsonText } from "@parity-app/core"
import { detectionFingerprint, readTsconfig } from "@parity-app/project"
import { z } from "zod"
import { environment } from "./environment.ts"
import { checkerVersion } from "./props.ts"

/**
 * A saved component's or its props' outer shape, which is all that's checked: the file outlives app updates, but the
 * props records inside are large, and they're the checker's own output from a version with the same fingerprint.
 */
const sourceShape = z.looseObject({ path: z.string(), export: z.string() })
const infoShape = z.looseObject({ name: z.string(), path: z.string(), props: z.array(z.unknown()) })
const savedSource = z.custom<ComponentSource>((value) => sourceShape.safeParse(value).success)
const savedInfo = z.custom<ComponentInfo>((value) => infoShape.safeParse(value).success)

/**
 * What the type checker and props found in a project, saved outside it under a fingerprint of what they read, so
 * reopening it unchanged doesn't start over: copacker's took 10 seconds and over a gigabyte.
 */
const savedDetectionFile = z.object({
  fingerprint: z.string(),
  /** The components once the checker had read them. */
  sources: z.record(z.string(), savedSource),
  props: z.record(z.string(), savedInfo),
  /** The exports the checker left out, with why. */
  leftOut: z
    .array(
      z.object({
        name: z.string(),
        path: z.string(),
        export: z.string(),
        reason: z.string(),
        undecided: z.literal(true).optional()
      })
    )
    .optional()
})

export type SavedDetection = z.infer<typeof savedDetectionFile>

const savedText = jsonText(savedDetectionFile)

const cacheDir = environment().PARITY_CACHE_DIR ?? join(homedir(), ".parity", "cache", "detection")

function cacheFile(root: string): string {
  return join(cacheDir, `${createHash("sha256").update(root).digest("hex").slice(0, 24)}.json`)
}

/**
 * The project's fingerprint as discovered, from the files discovery gives the checker and its list with the person's
 * corrections, and what was saved under it last time, if anything.
 */
export async function savedDetection(
  root: string,
  files: string[],
  discovered: Record<string, ComponentSource>
): Promise<{ fingerprint: string; saved?: SavedDetection }> {
  const fingerprint = await fingerprintOf(root, files, discovered)
  // None yet, one cut short, or one this version can't read: the checker reads the project again.
  const text = await readFile(cacheFile(root), "utf8").catch(() => undefined)
  const saved = text === undefined ? undefined : savedText.safeParse(text).data

  return saved?.fingerprint === fingerprint ? { fingerprint, saved } : { fingerprint }
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
  if ((await fingerprintOf(root, files, discovered)) !== fingerprint) {
    return
  }

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
