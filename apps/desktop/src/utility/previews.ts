import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { type RenderNode, renderedComponents } from "@parity-app/core"
import { previewRootId } from "@parity-app/editor"
import {
  type CodeSnapshot,
  importedFiles,
  moduleClosure,
  previewKey,
  readTsconfig,
  resolvePathAlias,
  sharedPreviewFiles
} from "@parity-app/project"
import type { ComponentPreview, PreviewJob } from "../shared/protocol.ts"
import { previewIndex, storedPreview, storePreview } from "./bitmap-store.ts"
import { codeServedAt, previewProject } from "./projects.ts"
import { renderPreview } from "./render.ts"
import { losslessWebp } from "./webp.ts"

/**
 * Component previews (PAR-207): pictures of what inserting a component would place, made in the offscreen window behind
 * the canvas's bitmaps and agents' renders and kept on disk, named by `previewKey`. A preview depends on what's drawn
 * and on the files its components import, as the guest drawing it was first served them, so an edit re-makes only the
 * previews of components that import what changed, once the guest draws it.
 */

/** Goes up when what's kept changes, so pictures made the old way aren't shown. */
const previewFormat = 3

/** What each file imports, by the snapshot it's read in: the code a guest draws doesn't change under it. */
const imports = new WeakMap<CodeSnapshot, Map<string, Promise<string[]>>>()
/** A project's tsconfig aliases, by snapshot, as `resolvePathAlias` reads them. */
const aliases = new WeakMap<CodeSnapshot, (specifier: string) => string | undefined>()
/** Previews being made, by project and key, so asking twice draws once. */
const making = new Map<string, Promise<ComponentPreview>>()

/** What's kept of each preview for its job's code, in the order asked; one whose project isn't open is left out. */
export async function lookupPreviews(previews: PreviewJob[]): Promise<ComponentPreview[]> {
  const found = await Promise.all(previews.map(lookup))
  return found.filter((preview) => preview !== undefined)
}

/**
 * Makes a component's preview, unless it's made for its key already, failed to draw for it or drew nothing to see, and
 * keeps it. A draw that failed or showed nothing is kept as such, so the same code isn't drawn again on every open; one
 * that didn't finish, as when the offscreen window closed under it, isn't, and is tried again when it's next asked for.
 */
export async function makePreview(preview: PreviewJob, priority: "visible" | "idle"): Promise<ComponentPreview> {
  const looked = await lookup(preview)
  if (!looked) throw new Error("The project's code isn't known yet")
  if (looked.image || looked.error || looked.empty) return looked
  const id = `${preview.job.projectId}\0${looked.key}`
  let made = making.get(id)
  if (!made) {
    made = make(preview, looked, priority).finally(() => making.delete(id))
    making.set(id, made)
  }
  return made
}

async function make(
  { component, job }: PreviewJob,
  looked: ComponentPreview,
  priority: "visible" | "idle"
): Promise<ComponentPreview> {
  const { key } = looked
  const started = performance.now()
  const drawn = await renderPreview(job, previewRootId, priority)
  if ("error" in drawn) {
    await storePreview(job.projectId, component, { key, error: drawn.error })
    return { component, key, error: drawn.error }
  }
  // A picture of nothing isn't kept, only that there was nothing to see, so it isn't drawn again on every open.
  if ("empty" in drawn) {
    await storePreview(job.projectId, component, { key, empty: true })
    return { component, key, empty: true }
  }
  const { thumb, large, width, height } = drawn.pictures
  // Kept as lossless WebP, as frame bitmaps are (PAR-535).
  const [thumbWebp, largeWebp] = await Promise.all(
    [thumb, large].map((picture) => losslessWebp(Buffer.from(picture, "base64")))
  )
  const pictures = { thumb: thumbWebp!, large: largeWebp! }
  const image = await storePreview(job.projectId, component, { key }, pictures, { width, height })
  const bytes = pictures.thumb.length + pictures.large.length
  console.log(
    `[service] preview of ${component}: ${width}x${height}, ${Math.round(bytes / 1024)} KB, ${Math.round(performance.now() - started)} ms`
  )
  return image ? { component, key, image } : looked
}

async function lookup(preview: PreviewJob): Promise<ComponentPreview | undefined> {
  const { component, job } = preview
  const key = await keyFor(preview)
  if (!key) return undefined
  const image = await storedPreview(job.projectId, key)
  if (image) return { component, key, image }
  const record = (await previewIndex(job.projectId)).get(component)
  if (record?.key === key && record.error) return { component, key, error: record.error }
  if (record?.key === key && record.empty) return { component, key, empty: true }
  const last = record && !record.error && !record.empty ? await storedPreview(job.projectId, record.key) : undefined
  return { component, key, ...(last ? { last } : {}) }
}

/**
 * A preview's key: what its job draws, less where it's drawn from and what the guest was given, and the files it
 * depends on, as the address the job draws from first served them. Unsaved token previews aren't drawn in previews, so
 * a token being tried changes none of them; saved, it changes the stylesheet, and so every one.
 */
async function keyFor({ job }: PreviewJob): Promise<string | undefined> {
  const project = previewProject(job.projectId)
  const served = codeServedAt(job.projectId, job.guestUrl)
  if (!project || !served) return undefined
  const snapshot = await served.code
  // A library's components are its package, which the lockfile stands for.
  const entries = [...new Set(renderedComponents(job.tree as RenderNode[]))].flatMap((id) => {
    const own = project.sources[id]
    if (own?.library) return []
    const path = own?.path ?? job.components?.[id]?.path
    return path ? [path.replace(/^\.\//, "")] : []
  })
  const closure = await moduleClosure([...entries, ...project.stylesheets], (path) =>
    importsOf(project.root, snapshot, path)
  )
  const {
    guestUrl: _address,
    components: _given,
    previews: _tokens,
    audit: _audit,
    colorTokens: _colors,
    projectId: _project,
    ...drawn
  } = job
  return previewKey({
    drawn,
    files: [...closure, ...sharedPreviewFiles(snapshot)],
    snapshot,
    salt: `${previewFormat}:${snapshot.salt}`
  })
}

function importsOf(root: string, snapshot: CodeSnapshot, path: string): Promise<string[]> {
  if (!snapshot.files.has(path)) return Promise.resolve([])
  let read = imports.get(snapshot)
  if (!read) {
    read = new Map()
    imports.set(snapshot, read)
  }
  let found = read.get(path)
  if (!found) {
    found = readFile(join(root, path), "utf8").then(
      (source) => importedFiles(path, source, snapshot.files, aliasesFor(root, snapshot)),
      () => []
    )
    read.set(path, found)
  }
  return found
}

function aliasesFor(root: string, snapshot: CodeSnapshot): (specifier: string) => string | undefined {
  let alias = aliases.get(snapshot)
  if (!alias) {
    const tsconfig = readTsconfig(root)
    alias = (specifier) => resolvePathAlias(root, tsconfig, specifier)
    aliases.set(snapshot, alias)
  }
  return alias
}
