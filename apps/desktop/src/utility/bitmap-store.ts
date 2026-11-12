import { createHash } from "node:crypto"
import { mkdir, open, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type FrameTrace, frameTrace } from "@parity-app/change-detection"
import {
  type CachedFile,
  type ComponentSource,
  cacheRemovals,
  jsonText,
  plainObject,
  webpSize,
  webpText,
  withWebpText
} from "@parity-app/core"
import type { CodeSnapshot } from "@parity-app/project"
import { z } from "zod"
import type { PreviewImage, RenderJob } from "../shared/protocol.ts"
import { bitmapName } from "../shared/render-job.ts"
import { degraded } from "./degraded.ts"
import { environment } from "./environment.ts"

/**
 * Frame bitmaps and component previews kept on disk, so a project opened again shows them at once (PAR-158, PAR-207).
 * They live in Parity's app data, which main names (`PARITY_BITMAP_DIR`), one folder per project, as lossless WebP
 * (PAR-535). A frame bitmap is named by the render job, as `bitmapName` names it, and carries its frame's height and
 * its trace: the files the frame read and the digest of their contents (PAR-994). It's the frame as drawn now while its
 * trace holds, and otherwise stands in, stale, while the frame is captured again for new code (PAR-993).
 * Component previews are in the project's `previews`
 * folder, two pictures each, named by `previewKey`, with an index of each component's latest. Without a folder, as in
 * tests, nothing is kept.
 */

/**
 * What a guest's address was first served, which kept bitmaps and previews are named by: the project's code
 * (`codeSnapshot`), whose salt says what draws it, and the components the guest was served with.
 */
export interface ServedCode {
  code: Promise<CodeSnapshot>
  sources: Readonly<Record<string, Pick<ComponentSource, "path" | "export">>>
}

const folder = environment().PARITY_BITMAP_DIR

/** Writes since the cache was last swept; it's swept again after this many, and when the service starts. */
const sweepEvery = 50
let writes = 0
let sweeping: Promise<void> | undefined

/** The text the frame's height is kept under, inside the WebP. */
const heightKeyword = "parity:height"

/** The text the frame's trace is kept under, inside the WebP, as JSON (PAR-994). */
const traceKeyword = "parity:trace"

/** A kept bitmap, as a lossless WebP in base64, with its frame's height when it was captured. */
export interface StoredBitmap {
  webp: string
  height: number
  /** Its trace doesn't hold: it's of other code, and stands in until the frame is captured for this code (PAR-993). */
  stale?: true
}

/**
 * The bitmap kept for a job, and the frame's height when it was captured; stale unless `holds` says its trace still
 * holds, as when none of the files the frame read has changed (PAR-994). Showing it counts as using it.
 */
export async function storedBitmap(
  served: ServedCode,
  job: RenderJob,
  holds: (trace: FrameTrace) => Promise<boolean>
): Promise<StoredBitmap | undefined> {
  if (!folder) {
    return undefined
  }

  const file = bitmapFile(served, job)

  try {
    const webp = await readFile(file)
    const height = Number(webpText(webp, heightKeyword))

    // Every bitmap kept says how tall its frame was; one that doesn't isn't one this version wrote.
    if (!(height > 0)) {
      return undefined
    }

    const now = new Date()
    void utimes(file, now, now).catch(() => undefined)
    const trace = keptTrace(webpText(webp, traceKeyword))
    const kept = { webp: webp.toString("base64"), height }

    return trace && (await holds(trace).catch(() => false)) ? kept : { ...kept, stale: true }
  } catch {
    return undefined
  }
}

/** The trace kept inside a bitmap, when it has one this version wrote. */
function keptTrace(text: string | undefined): FrameTrace | undefined {
  if (text === undefined) {
    return undefined
  }

  try {
    const parsed = frameTrace.safeParse(JSON.parse(text))

    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/**
 * Keeps a captured bitmap, as a lossless WebP, with the frame's height in its own CSS pixels and its trace inside it,
 * the trace taken before the capture, so a file changed during the capture leaves the bitmap stale rather than current.
 * Without a trace it's kept to stand in, stale. It's written beside its name and then renamed, so a reader never finds
 * half a file.
 */
export async function storeBitmap(
  served: ServedCode,
  job: RenderJob,
  webp: Uint8Array,
  height: number,
  trace: FrameTrace | undefined
): Promise<void> {
  if (!folder) {
    return
  }

  try {
    const sized = withWebpText(webp, heightKeyword, String(height))

    // Only the files and their digest: which component reads which says what changed in it, not whether the bitmap holds.
    const kept = trace
      ? withWebpText(sized, traceKeyword, JSON.stringify({ files: trace.files, digest: trace.digest }))
      : sized

    await writeWhole(bitmapFile(served, job), kept)
  } catch (error) {
    degraded("frame_bitmap", "couldn't keep a frame bitmap", error, job.projectId)

    return
  }

  wrote()
}

/** The sizes a preview is kept at: the thumbnail rows, tiles and picker items show, and the card's large one. */
export type PreviewSize = "thumb" | "large"

/**
 * What the index says of a component's latest preview: the key it was made for, why it couldn't be drawn when it
 * couldn't, and whether it drew nothing to see. The pictures themselves say whether they're made.
 */
const previewRecord = z.object({
  key: z.string().regex(/^[0-9a-f]{40}$/, "expected a preview key"),
  error: z.string().optional(),
  /** It drew, but its picture showed nothing but the page (PAR-517). */
  empty: z.literal(true).optional()
})

export type PreviewRecord = z.infer<typeof previewRecord>

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
  if (!folder) {
    return undefined
  }

  const thumb = await stat(previewFile(projectId, key, "thumb")).catch(() => undefined)
  const size = thumb?.isFile() ? await pictureSize(previewFile(projectId, key, "large")) : undefined

  return size && previewImage(projectId, key, size)
}

/**
 * Keeps a component's preview: its two pictures, as lossless WebP, when it was made, and the index's record of it as the
 * component's latest. A preview that failed keeps only its record, so the same code doesn't fail again on every open. Gives the
 * pictures as the window shows them, once they're kept.
 */
export async function storePreview(
  projectId: string,
  component: string,
  record: PreviewRecord,
  pictures?: Record<PreviewSize, Buffer>,
  size?: { width: number; height: number }
): Promise<PreviewImage | undefined> {
  if (!folder) {
    return undefined
  }

  try {
    if (pictures) {
      await writeWhole(previewFile(projectId, record.key, "thumb"), pictures.thumb)
      await writeWhole(previewFile(projectId, record.key, "large"), pictures.large)
    }
  } catch (error) {
    degraded("component_preview", "couldn't keep a component preview", error, projectId)

    return undefined
  }

  const index = await previewIndex(projectId)
  index.set(component, record)
  const write = (indexWrites.get(projectId) ?? Promise.resolve()).then(() => writeIndex(projectId, index))
  indexWrites.set(projectId, write)
  await write

  if (!pictures || !size) {
    return undefined
  }

  wrote()

  return previewImage(projectId, record.key, size)
}

/** Where the window loads a preview's picture from: main serves `parity-preview:` from the store. */
export function previewAddress(projectId: string, key: string, size: PreviewSize): string {
  return `parity-preview://${projectName(projectId)}/${key}-${size}.webp`
}

function previewImage(projectId: string, key: string, size: { width: number; height: number }): PreviewImage {
  return {
    thumb: previewAddress(projectId, key, "thumb"),
    large: previewAddress(projectId, key, "large"),
    ...size
  }
}

/** A WebP's size, from its header; nothing when it isn't one or can't be read. */
async function pictureSize(file: string): Promise<{ width: number; height: number } | undefined> {
  const handle = await open(file).catch(() => undefined)

  if (!handle) {
    return undefined
  }

  try {
    const header = Buffer.alloc(30)
    const { bytesRead } = await handle.read(header, 0, 30, 0)

    return webpSize(header.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

/**
 * Removes what the cache shouldn't keep (see `cacheRemovals`): partial files a write left behind, projects not opened
 * for 30 days, and the least recently used bitmaps and previews once there's more than 200 MB.
 */
export function sweepBitmaps(now = Date.now()): Promise<void> {
  if (!folder) {
    return Promise.resolve()
  }

  writes = 0
  sweeping ??= sweep(folder, now).finally(() => (sweeping = undefined))

  return sweeping
}

/**
 * Removes every kept bitmap and preview, as Clear bitmap cache does. Bitmaps on the canvas now are taken again as
 * they're needed, and previews are made again.
 */
export async function clearBitmaps(): Promise<void> {
  if (!folder) {
    return
  }

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

      if (info?.isDirectory() && name === previewsName) {
        await list(project, file)
      }

      if (!info?.isFile()) {
        continue
      }

      const partial = name.endsWith(".partial")
      files.push({ path: file, project, size: info.size, used: info.mtimeMs, partial })
    }
  }

  for (const project of await readdir(root).catch(() => [])) {
    await list(project, join(root, project))
  }

  const removed = cacheRemovals(files, now)

  for (const path of removed) {
    await rm(path, { force: true }).catch(() => undefined)
  }

  // A project's index that went names pictures it no longer has; read again, it's empty.
  if (removed.some((path) => path.endsWith(indexName))) {
    indexes.clear()
  }

  for (const project of await readdir(root).catch(() => [])) {
    const previews = join(root, project, previewsName)

    if ((await readdir(previews).catch(() => ["?"])).length === 0) {
      await rm(previews, { recursive: true, force: true })
    }

    if ((await readdir(join(root, project)).catch(() => ["?"])).length === 0) {
      await rm(join(root, project), { recursive: true, force: true }).catch(() => undefined)
    }
  }
}

const previewsName = "previews"
const indexName = "index.json"

/** The index's format; an index of another is read as empty. */
const indexFormat = 1

/** An index file: its format, and each component's record, read one by one so one bad record loses only itself. */
const indexFile = jsonText(z.object({ format: z.literal(indexFormat), components: plainObject }))

async function readIndex(projectId: string): Promise<Map<string, PreviewRecord>> {
  const index = new Map<string, PreviewRecord>()

  if (!folder) {
    return index
  }

  const text = await readFile(join(previewFolder(projectId), indexName), "utf8").catch(() => undefined)
  // None yet, one a crash cut short or one of another format: every preview is looked for again.
  const read = text === undefined ? undefined : indexFile.safeParse(text).data

  for (const [component, value] of Object.entries(read?.components ?? {})) {
    const record = previewRecord.safeParse(value)

    if (record.success) {
      index.set(component, record.data)
    }
  }

  return index
}

async function writeIndex(projectId: string, index: Map<string, PreviewRecord>): Promise<void> {
  try {
    await mkdir(previewFolder(projectId), { recursive: true })
    const contents = JSON.stringify({ format: indexFormat, components: Object.fromEntries(index) })
    await writeWhole(join(previewFolder(projectId), indexName), Buffer.from(contents))
  } catch (error) {
    degraded("preview_index", "couldn't keep the component preview index", error, projectId)
  }
}

/** Writes a file beside its name and then renames it, so a reader never finds half a file. */
export async function writeWhole(file: string, contents: Uint8Array): Promise<void> {
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
  if (++writes >= sweepEvery) {
    void sweepBitmaps()
  }
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
  return join(previewFolder(projectId), `${key}-${size}.webp`)
}

/**
 * A bitmap's file, named by the job as `bitmapName` names it, whatever code drew it: its trace says which (PAR-994). The
 * prefix keeps it apart from bitmaps kept before traces, named by the whole project's code, which age out.
 */
function bitmapFile(served: ServedCode, job: RenderJob): string {
  const name = createHash("sha256").update("latest\0").update(bitmapName(job, served.sources)).digest("hex")

  return join(projectFolder(job.projectId), `latest-${name.slice(0, 40)}.webp`)
}
