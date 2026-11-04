import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type CachedFile, type ComponentSource, cacheRemovals, pngText, withPngText } from "@parity-app/core"
import type { RenderJob } from "../shared/protocol.ts"
import { drawnComponents } from "../shared/render-job.ts"

/**
 * Frame bitmaps kept on disk, so a project opened again shows them at once (PAR-158). They live in Parity's app data,
 * which main names (`PARITY_BITMAP_DIR`), one folder per project and one PNG per bitmap, named by what it shows: the
 * project's code as the guest drawing it was loaded (`codeFingerprint`), the render job, less the guest's address, which
 * is new each time the project opens, and where the components it draws come from. Each PNG carries its frame's height.
 * Without a folder, as in tests, nothing is kept.
 */

/**
 * What a guest's address was first served, which kept bitmaps are named by: the project's code (`codeFingerprint`), and
 * the components the guest was served with.
 */
export interface ServedCode {
  fingerprint: Promise<string>
  sources: Readonly<Record<string, Pick<ComponentSource, "path" | "export">>>
}
const folder = process.env.PARITY_BITMAP_DIR

/** Writes since the cache was last swept; it's swept again after this many, and when the service starts. */
const sweepEvery = 50
let writes = 0
let sweeping: Promise<void> | undefined

/** The PNG text the frame's height is kept under. */
const heightKeyword = "parity:height"

/**
 * The bitmap a job draws, as base64, and the frame's height when it was captured, if one was kept for the code it's
 * drawn with. Showing it counts as using it.
 */
export async function storedBitmap(
  served: ServedCode,
  job: RenderJob
): Promise<{ png: string; height: number } | undefined> {
  if (!folder) return undefined
  const file = bitmapFile(await served.fingerprint, served, job)
  try {
    const png = await readFile(file)
    const height = Number(pngText(png, heightKeyword))
    // Every bitmap kept says how tall its frame was; one that doesn't isn't one this version wrote.
    if (!(height > 0)) return undefined
    const now = new Date()
    void utimes(file, now, now).catch(() => undefined)
    return { png: png.toString("base64"), height }
  } catch {
    return undefined
  }
}

/**
 * Keeps a captured bitmap, with the frame's height in its own CSS pixels inside the PNG. It's written beside its name and
 * then renamed, so a reader never finds half a file.
 */
export async function storeBitmap(served: ServedCode, job: RenderJob, png: string, height: number): Promise<void> {
  if (!folder) return
  const file = bitmapFile(await served.fingerprint, served, job)
  const partial = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.partial`
  try {
    await mkdir(projectFolder(job.projectId), { recursive: true })
    await writeFile(partial, withPngText(Buffer.from(png, "base64"), heightKeyword, String(height)))
    await rename(partial, file)
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined)
    console.warn(`[service] couldn't keep a frame bitmap: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  if (++writes >= sweepEvery) void sweepBitmaps()
}

/**
 * Removes what the cache shouldn't keep (see `cacheRemovals`): partial files a write left behind, projects not opened
 * for 30 days, and the least recently used bitmaps once there's more than 200 MB.
 */
export function sweepBitmaps(now = Date.now()): Promise<void> {
  if (!folder) return Promise.resolve()
  writes = 0
  sweeping ??= sweep(folder, now).finally(() => (sweeping = undefined))
  return sweeping
}

/** Removes every kept bitmap, as Clear bitmap cache does. Bitmaps on the canvas now are taken again as they're needed. */
export async function clearBitmaps(): Promise<void> {
  if (!folder) return
  await sweeping
  await rm(folder, { recursive: true, force: true })
}

async function sweep(root: string, now: number): Promise<void> {
  const files: CachedFile[] = []
  for (const project of await readdir(root).catch(() => [])) {
    for (const name of await readdir(join(root, project)).catch(() => [])) {
      const path = join(root, project, name)
      const info = await stat(path).catch(() => undefined)
      if (!info?.isFile()) continue
      const partial = name.endsWith(".partial")
      files.push({ path, project, size: info.size, used: info.mtimeMs, ...(partial ? { partial } : {}) })
    }
  }
  for (const path of cacheRemovals(files, now)) await rm(path, { force: true }).catch(() => undefined)
  for (const project of await readdir(root).catch(() => [])) {
    if ((await readdir(join(root, project)).catch(() => ["?"])).length === 0) {
      await rm(join(root, project), { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

function projectFolder(projectId: string): string {
  return join(folder!, createHash("sha256").update(projectId).digest("hex").slice(0, 24))
}

/**
 * A bitmap's file, named by the code its guest was served and the job less the guest's address, which is new each time
 * the project opens. The components the job gave the guest are named with those it was served, by where each one the
 * frame draws comes from (`drawnComponents`), so the name is the same in a session whose guest was served them all.
 */
function bitmapFile(fingerprint: string, served: ServedCode, job: RenderJob): string {
  const { guestUrl: _address, components, ...drawn } = job
  const name = createHash("sha256")
    .update(fingerprint)
    .update("\0")
    .update(JSON.stringify(drawn))
    .update("\0")
    .update(JSON.stringify(drawnComponents(job.tree, served.sources, components)))
    .digest("hex")
  return join(projectFolder(job.projectId), `${name.slice(0, 40)}.png`)
}
