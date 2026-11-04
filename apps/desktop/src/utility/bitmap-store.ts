import { createHash } from "node:crypto"
import { mkdir, open, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type CachedFile, type ComponentSource, cacheRemovals, pngText, withPngText } from "@parity-app/core"
import type { CodeSnapshot } from "@parity-app/project"
import type { PreviewImage, RenderJob } from "../shared/protocol.ts"
import { drawnComponents } from "../shared/render-job.ts"

/**
 * Frame bitmaps and component previews kept on disk, so a project opened again shows them at once (PAR-158, PAR-207).
 * They live in Parity's app data, which main names (`PARITY_BITMAP_DIR`), one folder per project. A frame bitmap is a
 * PNG named by what it shows: the project's code as the guest drawing it was loaded (`codeSnapshot`), the render job,
 * less the guest's address, which is new each time the project opens, and where the components it draws come from.
 * Each PNG carries its frame's height. Component previews are in the project's `previews` folder, two PNGs each, named
 * by `previewKey`, with an index of each component's latest. Without a folder, as in tests, nothing is kept.
 */

/**
 * What a guest's address was first served, which kept bitmaps and previews are named by: the project's code
 * (`codeSnapshot`) and its fingerprint, and the components the guest was served with.
 */
export interface ServedCode {
  code: Promise<CodeSnapshot>
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
  try {
    const file = bitmapFile(await served.fingerprint, served, job)
    await writeWhole(file, withPngText(Buffer.from(png, "base64"), heightKeyword, String(height)))
  } catch (error) {
    console.warn(`[service] couldn't keep a frame bitmap: ${message(error)}`)
    return
  }
  wrote()
}

/** The sizes a preview is kept at: the thumbnail rows, tiles and picker items show, and the card's large one. */
export type PreviewSize = "thumb" | "large"

/**
 * What the index says of a component's latest preview: the key it was made for, and why it couldn't be drawn when it
 * couldn't. The pictures themselves say whether they're made.
 */
export interface PreviewRecord {
  key: string
  error?: string
}

/** Each component's latest preview by id, for a project, as kept in its `previews/index.json`. */
const indexes = new Map<string, Promise<Map<string, PreviewRecord>>>()
/** Index writes by project, one after another, so a later one never lands under an earlier one. */
const indexWrites = new Map<string, Promise<void>>()

/** The index of a project's component previews, read from disk the first time it's asked for. */
export function previewIndex(projectId: string): Promise<Map<string, PreviewRecord>> {
  let index = indexes.get(projectId)
  if (!index) {
    index = readIndex(projectId)
    indexes.set(projectId, index)
  }
  return index
}

/** A preview's pictures, when both are on disk for its key, with the large one's size read from its header. */
export async function storedPreview(projectId: string, key: string): Promise<PreviewImage | undefined> {
  if (!folder) return undefined
  const thumb = await stat(previewFile(projectId, key, "thumb")).catch(() => undefined)
  const size = thumb?.isFile() ? await pngSize(previewFile(projectId, key, "large")) : undefined
  return size && previewImage(projectId, key, size)
}

/**
 * Keeps a component's preview: its two pictures, when it was made, and the index's record of it as the component's
 * latest. A preview that failed keeps only its record, so the same code doesn't fail again on every open. Gives the
 * pictures as the window shows them, once they're kept.
 */
export async function storePreview(
  projectId: string,
  component: string,
  record: PreviewRecord,
  pictures?: Record<PreviewSize, Buffer>,
  size?: { width: number; height: number }
): Promise<PreviewImage | undefined> {
  if (!folder) return undefined
  try {
    if (pictures) {
      await writeWhole(previewFile(projectId, record.key, "thumb"), pictures.thumb)
      await writeWhole(previewFile(projectId, record.key, "large"), pictures.large)
    }
  } catch (error) {
    console.warn(`[service] couldn't keep a component preview: ${message(error)}`)
    return undefined
  }
  const index = await previewIndex(projectId)
  index.set(component, record)
  const write = (indexWrites.get(projectId) ?? Promise.resolve()).then(() => writeIndex(projectId, index))
  indexWrites.set(projectId, write)
  await write
  if (!pictures || !size) return undefined
  wrote()
  return previewImage(projectId, record.key, size)
}

/** Where the window loads a preview's picture from: main serves `parity-preview:` from the store. */
export function previewAddress(projectId: string, key: string, size: PreviewSize): string {
  return `parity-preview://${projectName(projectId)}/${key}-${size}.png`
}

function previewImage(projectId: string, key: string, size: { width: number; height: number }): PreviewImage {
  return {
    thumb: previewAddress(projectId, key, "thumb"),
    large: previewAddress(projectId, key, "large"),
    ...size
  }
}

/** A PNG's size, from its header; nothing when it isn't one or can't be read. */
async function pngSize(file: string): Promise<{ width: number; height: number } | undefined> {
  const handle = await open(file).catch(() => undefined)
  if (!handle) return undefined
  try {
    const header = Buffer.alloc(24)
    const { bytesRead } = await handle.read(header, 0, 24, 0)
    if (bytesRead < 24 || header.toString("latin1", 12, 16) !== "IHDR") return undefined
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
  } finally {
    await handle.close()
  }
}

/**
 * Removes what the cache shouldn't keep (see `cacheRemovals`): partial files a write left behind, projects not opened
 * for 30 days, and the least recently used bitmaps and previews once there's more than 200 MB.
 */
export function sweepBitmaps(now = Date.now()): Promise<void> {
  if (!folder) return Promise.resolve()
  writes = 0
  sweeping ??= sweep(folder, now).finally(() => (sweeping = undefined))
  return sweeping
}

/**
 * Removes every kept bitmap and preview, as Clear bitmap cache does. Bitmaps on the canvas now are taken again as
 * they're needed, and previews are made again.
 */
export async function clearBitmaps(): Promise<void> {
  if (!folder) return
  await sweeping
  await Promise.all(indexWrites.values())
  indexes.clear()
  await rm(folder, { recursive: true, force: true })
}

async function sweep(root: string, now: number): Promise<void> {
  const files: CachedFile[] = []
  const list = async (project: string, path: string) => {
    for (const name of await readdir(path).catch(() => [])) {
      const file = join(path, name)
      const info = await stat(file).catch(() => undefined)
      if (info?.isDirectory() && name === previewsName) await list(project, file)
      if (!info?.isFile()) continue
      const partial = name.endsWith(".partial")
      files.push({ path: file, project, size: info.size, used: info.mtimeMs, ...(partial ? { partial } : {}) })
    }
  }
  for (const project of await readdir(root).catch(() => [])) await list(project, join(root, project))
  const removed = cacheRemovals(files, now)
  for (const path of removed) await rm(path, { force: true }).catch(() => undefined)
  // A project's index that went names pictures it no longer has; read again, it's empty.
  if (removed.some((path) => path.endsWith(indexName))) indexes.clear()
  for (const project of await readdir(root).catch(() => [])) {
    const previews = join(root, project, previewsName)
    if ((await readdir(previews).catch(() => ["?"])).length === 0) await rm(previews, { recursive: true, force: true })
    if ((await readdir(join(root, project)).catch(() => ["?"])).length === 0) {
      await rm(join(root, project), { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

const previewsName = "previews"
const indexName = "index.json"

/** The index's format; an index of another is read as empty. */
const indexFormat = 1

async function readIndex(projectId: string): Promise<Map<string, PreviewRecord>> {
  const index = new Map<string, PreviewRecord>()
  if (!folder) return index
  try {
    const parsed: unknown = JSON.parse(await readFile(join(previewFolder(projectId), indexName), "utf8"))
    if (!isObject(parsed) || parsed.format !== indexFormat || !isObject(parsed.components)) return index
    for (const [component, record] of Object.entries(parsed.components)) {
      if (isRecord(record)) index.set(component, record)
    }
  } catch {
    // None yet, or one a crash cut short: every preview is looked for again.
  }
  return index
}

async function writeIndex(projectId: string, index: Map<string, PreviewRecord>): Promise<void> {
  try {
    await mkdir(previewFolder(projectId), { recursive: true })
    const contents = JSON.stringify({ format: indexFormat, components: Object.fromEntries(index) })
    await writeWhole(join(previewFolder(projectId), indexName), Buffer.from(contents))
  } catch (error) {
    console.warn(`[service] couldn't keep the component preview index: ${message(error)}`)
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRecord(value: unknown): value is PreviewRecord {
  if (!isObject(value) || typeof value.key !== "string" || !/^[0-9a-f]{40}$/.test(value.key)) return false
  return value.error === undefined || typeof value.error === "string"
}

/** Writes a file beside its name and then renames it, so a reader never finds half of it. */
async function writeWhole(file: string, contents: Uint8Array): Promise<void> {
  const partial = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.partial`
  try {
    await mkdir(join(file, ".."), { recursive: true })
    await writeFile(partial, contents)
    await rename(partial, file)
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined)
    throw error
  }
}

function wrote(): void {
  if (++writes >= sweepEvery) void sweepBitmaps()
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** A project's folder's name: its id hashed, so any root makes a safe name. */
function projectName(projectId: string): string {
  return createHash("sha256").update(projectId).digest("hex").slice(0, 24)
}

function projectFolder(projectId: string): string {
  return join(folder!, projectName(projectId))
}

function previewFolder(projectId: string): string {
  return join(projectFolder(projectId), previewsName)
}

function previewFile(projectId: string, key: string, size: PreviewSize): string {
  return join(previewFolder(projectId), `${key}-${size}.png`)
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
