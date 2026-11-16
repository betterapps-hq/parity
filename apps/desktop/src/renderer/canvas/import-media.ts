import type { DesignNode } from "@parity-app/core"
import { mediumOfType, nodeForItem } from "@parity-app/editor"
import { request } from "../service.ts"

/**
 * Saves an image or a video pasted or dropped into the project, and gives the layer that shows it at its own
 * proportions (PAR-841). `type` is its media type, for a file the system gave none.
 */
export async function importMedia(projectId: string, blob: Blob, name: string, type = blob.type): Promise<DesignNode> {
  const kind = mediumOfType(type) === "video" ? "video" : "image"
  const [size, data] = await Promise.all([kind === "video" ? videoSize(blob) : imageSize(blob, type), base64(blob)])

  const { src } = await request("images.import", {
    projectId,
    name,
    type,
    data
  })

  return nodeForItem({ kind, src, width: size.width, height: size.height }, undefined, new Set())
}

interface Size {
  width: number
  height: number
}

/** An image's natural size, in pixels; SVGs without one count as square. */
function imageSize(blob: Blob, type: string): Promise<Size> {
  // An SVG only draws from a blob that says it's one.
  const url = URL.createObjectURL(blob.type === type ? blob : new Blob([blob], { type }))

  return new Promise<Size>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 })
    image.onerror = () => reject(new Error("The image couldn't be read"))
    image.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

/** A video's own size, in pixels, from its first part, without playing it. */
function videoSize(blob: Blob): Promise<Size> {
  const url = URL.createObjectURL(blob)

  return new Promise<Size>((resolve, reject) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.muted = true
    video.onloadedmetadata = () => resolve({ width: video.videoWidth || 16, height: video.videoHeight || 9 })
    video.onerror = () => reject(new Error("The video couldn't be read"))
    video.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    // A data URL, since it's read as one.
    reader.onload = () =>
      resolve(
        reader.result === null || reader.result instanceof ArrayBuffer ? "" : reader.result.replace(/^data:[^,]*,/, "")
      )
    reader.onerror = () => reject(reader.error ?? new Error("The file couldn't be read"))
    reader.readAsDataURL(blob)
  })
}
