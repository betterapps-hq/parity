import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { extname, join, relative, sep } from "node:path"
import {
  type CodeReference,
  codeReferences,
  type ImageFile,
  imagesFolder,
  limitOf,
  mediaExtension,
  mediaFolderOf,
  mediaFolders,
  mediaKinds,
  megabytes,
  mediumOfType,
  videosFolder
} from "@parity-app/editor"
import type { ServiceMethods } from "../shared/protocol.ts"
import { applyProjectEdit, type EditedProject } from "./edits.ts"

/**
 * Saves an image or video pasted or dropped onto the canvas, an image under `public/images/` and a video under
 * `public/videos/` (PAR-841), named after it with a short hash of its content, so adding the same file twice reuses
 * one. The types and the limits are the ones a drop checks first.
 */
export async function importImage(
  project: EditedProject,
  { name, type, data }: Pick<ServiceMethods["images.import"]["params"], "name" | "type" | "data">
): Promise<ServiceMethods["images.import"]["result"]> {
  return saveMedia(project, { name, type, bytes: Buffer.from(data, "base64") })
}

/** Saves a file's bytes as `importImage` describes, once its type and size are checked. */
async function saveMedia(
  project: EditedProject,
  { name, type, bytes }: { name: string; type: string; bytes: Buffer }
): Promise<ServiceMethods["images.import"]["result"]> {
  const extension = mediaExtension(type)
  const medium = mediumOfType(type)

  if (!extension || !medium) {
    throw new Error(`${type} files can't be added. Use a ${mediaKinds} file.`)
  }

  if (bytes.length > limitOf(type)) {
    throw new Error(`The ${medium} is larger than ${megabytes(limitOf(type))}`)
  }

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8)

  const base =
    name
      .replaceAll(/[^a-z0-9-]+/gi, "-")
      .replaceAll(/^-|-$/g, "")
      .toLowerCase() || medium

  const file = `${base}-${hash}.${extension}`
  const folder = medium === "video" ? videosFolder : imagesFolder
  const path = `${folder}/${file}`
  const saved = { src: `${folder.slice("public".length)}/${file}`, path }

  if (existsSync(join(project.info.root, path))) {
    return saved
  }

  const edit = await applyProjectEdit(project, {
    label: medium === "video" ? "Add video" : "Add image",
    files: [{ kind: "create", path, content: bytes }]
  })

  return { ...saved, edit }
}

/** The extensions of the media files a project's list shows, which are the types Parity saves. */
const mediaExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".mp4", ".webm"])

/** The code that can name an image file: scripts, styles, markup and the components frameworks write. */
const codeExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".vue",
  ".svelte",
  ".astro",
  ".md",
  ".mdx"
])

/** Folders that hold no code of the project's own, or only what's built from it. */
const skipped = new Set(["node_modules", ".git", "public", "dist", "build", "out", "coverage", "storybook-static"])

/** A code file larger than this is built or vendored, not written, so it isn't read. */
const codeLimit = 512 * 1024

/** How long fetching a picture or a video to save may take, in milliseconds. */
const saveTimeout = 90_000

/**
 * Saves a picture or a video from a link into the project, as `importImage` saves a pasted one, for a result whose link
 * stops working or may only show results, as Pixabay's (PAR-837, PAR-841). Refuses what isn't a type Parity takes, or
 * is too large.
 */
export async function saveImageFrom(
  project: EditedProject,
  { url, name }: { url: string; name: string },
  fetcher: (url: string, init: RequestInit) => Promise<Response>
): Promise<{ src: string; path: string }> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(saveTimeout) })

  if (!response.ok) {
    throw new Error(`the source answered ${response.status}`)
  }

  const type = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? ""

  const medium = mediumOfType(type)

  if (!medium) {
    throw new Error(`the link gave ${type || "something"} rather than a picture or a video`)
  }

  if (Number(response.headers.get("content-length") ?? 0) > limitOf(type)) {
    throw new Error(`the ${medium} is larger than ${megabytes(limitOf(type))}`)
  }

  const { src, path } = await saveMedia(project, { name, type, bytes: Buffer.from(await response.arrayBuffer()) })

  return { src, path }
}

/**
 * A project's media files under `public/images/` and `public/videos/`, and the lines of its code that name them
 * (PAR-834). Designs aren't read here: the window and agents have them, unsaved changes included, and `projectImages`
 * puts the two together.
 */
export async function scanImages(project: EditedProject): Promise<{ files: ImageFile[]; references: CodeReference[] }> {
  const root = project.info.root
  const files = await imageFiles(root)

  if (files.length === 0) {
    return { files, references: [] }
  }

  return { files, references: codeReferences(files, await codeFiles(root)) }
}

/**
 * Removes an image or video file from `public/images/` or `public/videos/` as a project edit, so undoing it puts the
 * file back. It refuses a path outside those folders, and a file the project's code names, which would break the app;
 * whether a design uses it is the caller's to check, since only the window and agents have the designs as they are.
 */
export async function removeImage(
  project: EditedProject,
  path: string
): Promise<ServiceMethods["images.remove"]["result"]> {
  const root = project.info.root
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "")
  const full = join(root, normalized)

  const folder = mediaFolderOf(normalized)

  if (!folder || relative(join(root, folder), full).startsWith("..")) {
    throw new Error(`Only files in ${imagesFolder}/ and ${videosFolder}/ can be removed, and ${path} isn't there.`)
  }

  if (!mediaExtensions.has(extname(normalized).toLowerCase())) {
    throw new Error(`${path} isn't an image or a video.`)
  }

  const { files, references } = await scanImages(project)

  if (!files.some((file) => file.path === normalized)) {
    throw new Error(`There's no file at ${path}.`)
  }

  const named = references.filter((reference) => reference.image === normalized)

  if (named.length > 0) {
    const places = named.map((reference) => `${reference.path} (line ${reference.line})`).join(", ")

    throw new Error(`${normalized} is still used in ${places}. Remove or replace it there first.`)
  }

  const edit = await applyProjectEdit(project, {
    label: folder === videosFolder ? "Remove video" : "Remove image",
    files: [{ kind: "delete", path: normalized, expected: await readFile(full) }]
  })

  return { path: normalized, edit }
}

async function imageFiles(root: string): Promise<ImageFile[]> {
  const found = await Promise.all(mediaFolders.map((folder) => filesIn(root, folder)))

  return found.flat()
}

/** The media files in one of a project's media folders, and in the folders inside it. */
async function filesIn(root: string, from: string): Promise<ImageFile[]> {
  const folder = join(root, from)

  if (!existsSync(folder)) {
    return []
  }

  const entries = await readdir(folder, { recursive: true, withFileTypes: true })
  const media = entries.filter((entry) => entry.isFile() && mediaExtensions.has(extname(entry.name).toLowerCase()))

  return Promise.all(
    media.map(async (entry) => {
      const full = join(entry.parentPath, entry.name)

      return { path: relative(root, full).split(sep).join("/"), bytes: (await stat(full)).size }
    })
  )
}

/** The project's own code, as text, without what's installed, built or served as it is. */
async function codeFiles(root: string): Promise<{ path: string; text: string }[]> {
  const found: { path: string; text: string }[] = []

  const visit = async (folder: string) => {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])

    for (const entry of entries) {
      const full = join(folder, entry.name)

      if (entry.isDirectory()) {
        if (!skipped.has(entry.name) && !entry.name.startsWith(".")) {
          await visit(full)
        }
      } else if (entry.isFile() && codeExtensions.has(extname(entry.name).toLowerCase())) {
        const { size } = await stat(full)

        if (size <= codeLimit) {
          found.push({ path: relative(root, full).split(sep).join("/"), text: await readFile(full, "utf8") })
        }
      }
    }
  }

  await visit(root)

  return found
}
