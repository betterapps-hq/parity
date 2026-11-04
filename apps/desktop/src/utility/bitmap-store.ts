import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type CachedFile, cacheRemovals } from "@parity-app/core"
import type { RenderJob } from "../shared/protocol.ts"

/**
 * Frame bitmaps kept on disk, so a project opened again shows them at once (PAR-158). They live in Parity's app data,
 * which main names (`PARITY_BITMAP_DIR`), one folder per project and one PNG per bitmap, named by what it shows: the
 * project's code as the guest drawing it was loaded (`codeFingerprint`) and the render job, less the guest's address,
 * which is new each time the project opens. Without a folder, as in tests, nothing is kept.
 */
const folder = process.env.PARITY_BITMAP_DIR

/** Writes since the cache was last swept; it's swept again after this many, and when the service starts. */
const sweepEvery = 50
let writes = 0
let sweeping: Promise<void> | undefined

/** The bitmap a job draws, if one was kept for the code it's drawn with. Showing it counts as using it. */
export async function storedBitmap(fingerprint: string, job: RenderJob): Promise<string | undefined> {
  if (!folder) return undefined
  const file = bitmapFile(fingerprint, job)
  try {
    const png = await readFile(file)
    const now = new Date()
    void utimes(file, now, now).catch(() => undefined)
    return png.toString("base64")
  } catch {
    return undefined
  }
}

/** Keeps a captured bitmap. It's written beside its name and then renamed, so a reader never finds half a file. */
export async function storeBitmap(fingerprint: string, job: RenderJob, png: string): Promise<void> {
  if (!folder) return
  const file = bitmapFile(fingerprint, job)
  const partial = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.partial`
  try {
    await mkdir(projectFolder(job.projectId), { recursive: true })
    await writeFile(partial, Buffer.from(png, "base64"))
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

function bitmapFile(fingerprint: string, job: RenderJob): string {
  const { guestUrl: _address, ...drawn } = job
  const name = createHash("sha256").update(fingerprint).update("\0").update(JSON.stringify(drawn)).digest("hex")
  return join(projectFolder(job.projectId), `${name.slice(0, 40)}.png`)
}
