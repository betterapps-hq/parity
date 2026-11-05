import type { RenderedFrame, RenderJob } from "../shared/protocol.ts"
import type { MainMessage, ServiceMessage } from "../shared/service.ts"

let nextId = 1
const pending = new Map<
  number,
  { resolve(value: { frame: RenderedFrame; png?: string }): void; reject(error: Error): void }
>()

/**
 * Draws a frame in one of the offscreen render windows (owned by the main process) and measures it, optionally
 * capturing a PNG. The person's canvas is never touched.
 */
export function renderOffscreen(job: RenderJob, capture: boolean): Promise<{ frame: RenderedFrame; png?: string }> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    process.parentPort.postMessage({ type: "render", id, job, capture } satisfies ServiceMessage)
  })
}

export function handleRenderResult(result: Extract<MainMessage, { type: "render-result" }>): void {
  const request = pending.get(result.id)
  pending.delete(result.id)
  if (!request) return
  if (result.error || !result.frame) request.reject(new Error(result.error ?? "The preview didn't render"))
  else request.resolve({ frame: result.frame, png: result.png })
}

/** A component preview drawn offscreen: its pictures as base64 PNGs and the large one's size. */
export type PreviewPictures = NonNullable<Extract<MainMessage, { type: "preview-result" }>["pictures"]>

/** What drawing a preview gave: its pictures, nothing to see (PAR-517), or why its component didn't draw. */
export type PreviewDrawn = { pictures: PreviewPictures } | { empty: true } | { error: string }

const previews = new Map<number, { resolve(drawn: PreviewDrawn): void; reject(error: Error): void }>()

/**
 * Draws a component preview in the offscreen render window, once every canvas bitmap and agent render waiting has had
 * its turn, and gives its pictures cropped to the element `crop` names, or why its component didn't draw (PAR-207).
 */
export function renderPreview(job: RenderJob, crop: string, priority: "visible" | "idle"): Promise<PreviewDrawn> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    previews.set(id, { resolve, reject })
    process.parentPort.postMessage({ type: "preview", id, job, crop, priority } satisfies ServiceMessage)
  })
}

export function handlePreviewResult(result: Extract<MainMessage, { type: "preview-result" }>): void {
  const request = previews.get(result.id)
  previews.delete(result.id)
  if (!request) return
  if (result.pictures) request.resolve({ pictures: result.pictures })
  else if (result.empty) request.resolve({ empty: true })
  else if (result.error) request.resolve({ error: result.error })
  else request.reject(new Error(result.failed ?? "The preview didn't draw"))
}
