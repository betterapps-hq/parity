import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { extname, join, relative, sep } from "node:path"
import {
  type CodeReference,
  codeReferences,
  type ImageFile,
  imageExtension,
  imageLimit,
  imagesFolder
} from "@parity-app/editor"
import type { ServiceMethods } from "../shared/protocol.ts"
import { applyProjectEdit, type EditedProject } from "./edits.ts"

/**
 * Saves an image pasted or dropped onto the canvas under `public/images/`, named after it with a short hash of its
 * content, so adding the same image twice reuses one file. The types and the limit are the ones a drop checks first.
 */
export async function importImage(
  project: EditedProject,
  { name, type, data }: Pick<ServiceMethods["images.import"]["params"], "name" | "type" | "data">
): Promise<ServiceMethods["images.import"]["result"]> {
  const extension = imageExtension(type)

  if (!extension) {
    throw new Error(`${type} images can't be added. Use a PNG, JPEG, GIF, WebP or SVG.`)
  }

  const bytes = Buffer.from(data, "base64")

  if (bytes.length > imageLimit) {
    throw new Error("The image is larger than 20 MB")
  }

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8)

  const base =
    name
      .replaceAll(/[^a-z0-9-]+/gi, "-")
      .replaceAll(/^-|-$/g, "")
      .toLowerCase() || "image"

  const file = `${base}-${hash}.${extension}`
  const path = `public/images/${file}`
  const saved = { src: `/images/${file}`, path }

  if (existsSync(join(project.info.root, path))) {
    return saved
  }

  const edit = await applyProjectEdit(project, {
    label: "Add image",
    files: [{ kind: "create", path, content: bytes }]
  })

  return { ...saved, edit }
}

/** The extensions of the image files a project's list shows, which are the types Parity saves. */
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"])

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

/**
 * A project's image files under `public/images/`, and the lines of its code that name them (PAR-834). Designs aren't
 * read here: the window and agents have them, unsaved changes included, and `projectImages` puts the two together.
 */
/** How long fetching a picture to save may take, in milliseconds. */
const saveTimeout = 20_000

/**
 * Saves a picture from a link into `public/images/`, as `importImage` saves a pasted one, for a result whose link stops
 * working or may only show results, as Pixabay's (PAR-837). Refuses what isn't a picture Parity takes, or is too large.
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

  if (!imageExtension(type)) {
    throw new Error(`the link gave ${type || "something"} rather than a picture`)
  }

  if (Number(response.headers.get("content-length") ?? 0) > imageLimit) {
    throw new Error("the picture is larger than 20 MB")
  }

  const data = Buffer.from(await response.arrayBuffer()).toString("base64")
  const { src, path } = await importImage(project, { name, type, data })

  return { src, path }
}

export async function scanImages(project: EditedProject): Promise<{ files: ImageFile[]; references: CodeReference[] }> {
  const root = project.info.root
  const files = await imageFiles(root)

  if (files.length === 0) {
    return { files, references: [] }
  }

  return { files, references: codeReferences(files, await codeFiles(root)) }
}

/**
 * Removes an image file from `public/images/` as a project edit, so undoing it puts the file back. It refuses a path
 * outside that folder, and a file the project's code names, which would break the app; whether a design uses it is the
 * caller's to check, since only the window and agents have the designs as they are.
 */
export async function removeImage(
  project: EditedProject,
  path: string
): Promise<ServiceMethods["images.remove"]["result"]> {
  const root = project.info.root
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "")
  const full = join(root, normalized)

  if (!normalized.startsWith(`${imagesFolder}/`) || relative(join(root, imagesFolder), full).startsWith("..")) {
    throw new Error(`Only images in ${imagesFolder}/ can be removed, and ${path} isn't there.`)
  }

  if (!imageExtensions.has(extname(normalized).toLowerCase())) {
    throw new Error(`${path} isn't an image.`)
  }

  const { files, references } = await scanImages(project)

  if (!files.some((file) => file.path === normalized)) {
    throw new Error(`There's no image at ${path}.`)
  }

  const named = references.filter((reference) => reference.image === normalized)

  if (named.length > 0) {
    const places = named.map((reference) => `${reference.path} (line ${reference.line})`).join(", ")

    throw new Error(`${normalized} is still used in ${places}. Remove or replace it there first.`)
  }

  const edit = await applyProjectEdit(project, {
    label: "Remove image",
    files: [{ kind: "delete", path: normalized, expected: await readFile(full) }]
  })

  return { path: normalized, edit }
}

async function imageFiles(root: string): Promise<ImageFile[]> {
  const folder = join(root, imagesFolder)

  if (!existsSync(folder)) {
    return []
  }

  const entries = await readdir(folder, { recursive: true, withFileTypes: true })
  const images = entries.filter((entry) => entry.isFile() && imageExtensions.has(extname(entry.name).toLowerCase()))

  return Promise.all(
    images.map(async (entry) => {
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
