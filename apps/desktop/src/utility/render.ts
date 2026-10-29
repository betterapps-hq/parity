import type { RenderedFrame, RenderJob } from "../shared/protocol.ts"
import type { MainMessage, ServiceMessage } from "../shared/service.ts"

let nextId = 1
const pending = new Map<
  number,
  { resolve(value: { frame: RenderedFrame; png?: string }): void; reject(error: Error): void }
>()

/**
 * Draws a frame in the offscreen render window (owned by the main process) and measures it, optionally capturing a
 * PNG. The person's canvas is never touched.
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
  if (result.error || !result.frame) request.reject(new Error(result.error ?? "The frame didn't render"))
  else request.resolve({ frame: result.frame, png: result.png })
}
