import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ServiceMethods } from "../shared/protocol.ts"
import { getProject } from "./projects.ts"

/** Image types that can be pasted in, by media type, with the extension each is saved under. */
const pastedTypes: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg"
}

/** The largest pasted image saved, in bytes. */
const pastedLimit = 20 * 1024 * 1024

/**
 * Saves an image pasted onto the canvas under `public/images/`, named after it with a short hash of its content, so
 * pasting the same image twice reuses one file.
 */
export async function importImage({
  projectId,
  name,
  type,
  data
}: ServiceMethods["images.import"]["params"]): Promise<ServiceMethods["images.import"]["result"]> {
  const { info } = getProject(projectId)
  const extension = pastedTypes[type]
  if (!extension) throw new Error(`${type} images can't be pasted. Paste a PNG, JPEG, GIF, WebP or SVG.`)
  const bytes = Buffer.from(data, "base64")
  if (bytes.length > pastedLimit) throw new Error("The image is larger than 20 MB")
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8)
  const base =
    name
      .replaceAll(/[^a-z0-9-]+/gi, "-")
      .replaceAll(/^-|-$/g, "")
      .toLowerCase() || "image"
  const file = `${base}-${hash}.${extension}`
  const folder = join(info.root, "public", "images")
  const path = join(folder, file)
  if (!existsSync(path)) {
    await mkdir(folder, { recursive: true })
    await writeFile(path, bytes)
  }
  return { src: `/images/${file}`, path: `public/images/${file}` }
}
