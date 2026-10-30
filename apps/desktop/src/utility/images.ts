import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { imageLimit, imageTypes } from "@parity-app/editor"
import type { ServiceMethods } from "../shared/protocol.ts"
import { applyProjectEdit } from "./edits.ts"
import { getProject } from "./projects.ts"

/**
 * Saves an image pasted or dropped onto the canvas under `public/images/`, named after it with a short hash of its
 * content, so adding the same image twice reuses one file. The types and the limit are the ones a drop checks first.
 */
export async function importImage({
  projectId,
  name,
  type,
  data
}: ServiceMethods["images.import"]["params"]): Promise<ServiceMethods["images.import"]["result"]> {
  const project = getProject(projectId)
  const extension = Object.hasOwn(imageTypes, type) ? imageTypes[type] : undefined
  if (!extension) throw new Error(`${type} images can't be added. Use a PNG, JPEG, GIF, WebP or SVG.`)
  const bytes = Buffer.from(data, "base64")
  if (bytes.length > imageLimit) throw new Error("The image is larger than 20 MB")
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8)
  const base =
    name
      .replaceAll(/[^a-z0-9-]+/gi, "-")
      .replaceAll(/^-|-$/g, "")
      .toLowerCase() || "image"
  const file = `${base}-${hash}.${extension}`
  const path = `public/images/${file}`
  const saved = { src: `/images/${file}`, path }
  if (existsSync(join(project.info.root, path))) return saved
  const edit = await applyProjectEdit(project, {
    label: "Add image",
    files: [{ kind: "create", path, content: bytes }]
  })
  return { ...saved, edit }
}
