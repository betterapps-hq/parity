import type { RenderedFrame, RenderJob } from "../shared/protocol.ts"
import type { PreviewDrawn } from "../shared/service.ts"
import { mainProcess } from "./main-process.ts"

/**
 * Draws a frame in one of the offscreen render windows (owned by the main process) and measures it, optionally
 * capturing a PNG. The person's canvas is never touched.
 */
export async function renderOffscreen(
  job: RenderJob,
  capture: boolean
): Promise<{ frame: RenderedFrame; png?: string }> {
  const { frame, png } = await mainProcess.request("render", { job, capture })

  if (!frame) {
    throw new Error("The preview didn't render")
  }

  return { frame, ...(png === undefined ? {} : { png }) }
}

/**
 * Draws a component preview in the offscreen render window, once every canvas bitmap and agent render waiting has had
 * its turn, and gives its pictures cropped to the element `crop` names, or why its component didn't draw (PAR-207).
 */
export function renderPreview(job: RenderJob, crop: string, priority: "visible" | "idle"): Promise<PreviewDrawn> {
  return mainProcess.request("preview", { job, crop, priority })
}
