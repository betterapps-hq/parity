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
import { previewName } from "../shared/render-job.ts"
import { track } from "../shared/tracing.ts"
import { previewIndex, storedPreview, storePreview } from "./bitmap-store.ts"
import { cacheUse } from "./cache-use.ts"
import { logNote } from "./log.ts"
import type { OpenProjects } from "./projects.ts"
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

/** What component previews need of the open projects. */
export type PreviewProjects = Pick<OpenProjects, "codeServedAt" | "previewProject">

/** What component previews do: look up what's kept of them, and make one. */
export interface ComponentPreviews {
  lookupPreviews: (previews: PreviewJob[]) => Promise<ComponentPreview[]>
  makePreview: (preview: PreviewJob, priority: "visible" | "idle") => Promise<ComponentPreview>
}

/** Component previews of the projects open in `projects`. */
export function componentPreviews(projects: PreviewProjects): ComponentPreviews {
  /** Previews being made, by project and key, so asking twice draws once. */
  const making = new Map<string, Promise<ComponentPreview>>()

  async function lookup(preview: PreviewJob): Promise<ComponentPreview | undefined> {
    const { component, job } = preview
    const key = await keyFor(projects, preview)

    if (!key) {
      return undefined
    }

    const image = await storedPreview(job.projectId, key)

    if (image) {
      return { component, key, image }
    }

    const record = (await previewIndex(job.projectId)).get(component)

    if (record?.key === key && record.error) {
      return { component, key, error: record.error }
    }

    if (record?.key === key && record.empty) {
      return { component, key, empty: true }
    }

    const last = record && !record.error && !record.empty ? await storedPreview(job.projectId, record.key) : undefined

    return last ? { component, key, last } : { component, key }
  }

  return {
    /** What's kept of each preview for its job's code, in the order asked; one whose project isn't open is left out. */
    async lookupPreviews(previews) {
      const found = (await Promise.all(previews.map(lookup))).filter((preview) => preview !== undefined)

      // What's kept for its code, a picture or that it failed or drew nothing, is a hit, since it isn't drawn again; one
      // kept only for older code, or never drawn, is a miss.
      for (const { image, error, empty } of found) {
        cacheUse.preview(image !== undefined || error !== undefined || !!empty)
      }

      return found
    },

    /**
     * Makes a component's preview, unless it's made for its key already, failed to draw for it or drew nothing to see,
     * and keeps it. A draw that failed or showed nothing is kept as such, so the same code isn't drawn again on every
     * open; one that didn't finish, as when the offscreen window closed under it, isn't, and is tried again when it's
     * next asked for.
     */
    async makePreview(preview, priority) {
      const looked = await lookup(preview)

      if (!looked) {
        throw new Error("The project's code isn't known yet")
      }

      if (looked.image || looked.error || looked.empty) {
        return looked
      }

      const id = `${preview.job.projectId}\0${looked.key}`
      let made = making.get(id)

      if (!made) {
        made = make(preview, looked, priority).finally(() => making.delete(id))
        making.set(id, made)
      }

      return made
    }
  }
}

async function make(
  { component, job }: PreviewJob,
  looked: ComponentPreview,
  priority: "visible" | "idle"
): Promise<ComponentPreview> {
  const { key } = looked
  const started = performance.now()
  const took = () => Math.round(performance.now() - started)

  const drawn = await renderPreview(job, previewRootId, priority).catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause)
    track("preview.failed", { component, reason: "not finished", message, durationMs: took() })
    throw cause
  })

  if ("error" in drawn) {
    track("preview.failed", { component, reason: "render threw", message: drawn.error, durationMs: took() })
    await storePreview(job.projectId, component, { key, error: drawn.error })

    return { component, key, error: drawn.error }
  }

  // A picture of nothing isn't kept, only that there was nothing to see, so it isn't drawn again on every open.
  if ("empty" in drawn) {
    track("preview.failed", { component, reason: "drew nothing", durationMs: took() })
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
  track("preview.made", { component, durationMs: took(), width, height, bytes })
  logNote(`[service] preview of ${component}: ${width}x${height}, ${Math.round(bytes / 1024)} KB, ${took()} ms`)

  return image ? { component, key, image } : looked
}

/**
 * A preview's key: its job as `previewName` names it, and the files it depends on, as the address the job draws from
 * first served them. Unsaved token previews aren't drawn in previews, so a token being tried changes none of them;
 * saved, it changes the stylesheet, and so every one.
 */
async function keyFor(projects: PreviewProjects, { job }: PreviewJob): Promise<string | undefined> {
  const project = projects.previewProject(job.projectId)
  const served = projects.codeServedAt(job.projectId, job.guestUrl)

  if (!project || !served) {
    return undefined
  }

  const snapshot = await served.code

  // A library's components are its package, which the lockfile stands for.
  // SAFETY: the window builds a preview's tree with `componentPreviewTree`, which gives render nodes; the service's
  // checks leave the tree as it came, since only the render window draws it.
  const entries = [...new Set(renderedComponents(job.tree as RenderNode[]))].flatMap((id) => {
    const own = project.sources[id]

    if (own?.library) {
      return []
    }

    const path = own?.path ?? job.components?.[id]?.path

    return path ? [path.replace(/^\.\//, "")] : []
  })

  const closure = await moduleClosure([...entries, ...project.stylesheets], (path) =>
    importsOf(project.root, snapshot, path)
  )

  return previewKey({
    drawn: previewName(job),
    files: [...closure, ...sharedPreviewFiles(snapshot)],
    snapshot,
    salt: `${previewFormat}:${snapshot.salt}`
  })
}

function importsOf(root: string, snapshot: CodeSnapshot, path: string): Promise<string[]> {
  if (!snapshot.files.has(path)) {
    return Promise.resolve([])
  }

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
