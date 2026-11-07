import { useEffect, useRef } from "react"

/**
 * The frames on the canvas, for Parity's errors and failed renders (PAR-624). An error from the window carries the list
 * of frames on the canvas, and a frame whose offscreen render fails the bitmap it last showed, as a WebP, since replays
 * leave frames out (`replay.ts`) and the offscreen windows aren't recorded.
 */
export interface FrameOnScreen {
  project: string
  design: string
  /** The design's key, `<document path>#<container id>`, which a render job names its design by. */
  designKey: string
  state: string
  stateId: string
  mode: string
  modeId: string
  width: number
  height?: number
  /** What it shows, as the canvas keys its bitmaps. */
  key: string
  /** The bitmap it last showed, as a data URL, which may be from before an edit: none until it has shown one. */
  bitmap?: string
}

/** The design a render drew, as a render job names it. */
export interface RenderedDesign {
  key: string
  state?: string
  mode?: string
}

/** An attachment as Sentry takes one, which the window's transport hands to main with its event. */
export interface FrameAttachment {
  filename: string
  data: string | Uint8Array
  contentType: string
}

const onScreen = new Set<FrameOnScreen>()

/** Notes a frame on the canvas while it's there, with the bitmap it shows now or last showed. */
export function useFrameOnScreen(frame: FrameOnScreen): void {
  const { project, design, designKey, state, stateId, mode, modeId, width, height, key, bitmap } = frame
  const last = useRef<string>(undefined)
  useEffect(() => {
    if (bitmap !== undefined) last.current = bitmap
    const noted: FrameOnScreen = { project, design, designKey, state, stateId, mode, modeId, width, key }
    if (height !== undefined) noted.height = height
    if (last.current !== undefined) noted.bitmap = last.current
    onScreen.add(noted)
    return () => {
      onScreen.delete(noted)
    }
  }, [project, design, designKey, state, stateId, mode, modeId, width, height, key, bitmap])
}

/** The frames on the canvas now. */
export function framesOnScreen(): FrameOnScreen[] {
  return [...onScreen]
}

/** The list of frames on the canvas, as an event's `frames.json`, saying which have a bitmap rather than giving it. */
export function framesAttachment(frames: FrameOnScreen[]): FrameAttachment {
  // Without its key, which holds the whole design it draws.
  const listed = frames.map(({ bitmap, key: _key, ...frame }) => ({ ...frame, bitmap: bitmap !== undefined }))
  return { filename: "frames.json", data: JSON.stringify(listed, undefined, 2), contentType: "application/json" }
}

/** The bitmap the frame drawing a design last showed, as an attachment. None when it isn't on the canvas or has none. */
export function bitmapAttachment(frames: FrameOnScreen[], drawn: RenderedDesign): FrameAttachment | undefined {
  const frame = frames.find(
    ({ designKey, stateId, modeId, bitmap }) =>
      bitmap !== undefined && designKey === drawn.key && stateId === drawn.state && modeId === drawn.mode
  )
  const picture = frame?.bitmap && /^data:(image\/(?:webp|png));base64,(.*)$/s.exec(frame.bitmap)
  if (!picture) return undefined
  const [, contentType = "image/webp", base64 = ""] = picture
  const data = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return { filename: contentType === "image/png" ? "frame.png" : "frame.webp", data, contentType }
}

type FailedRenderListener = (error: unknown, drawn: RenderedDesign) => void
const failedRenderListeners = new Set<FailedRenderListener>()
/**
 * What's been reported failing, by a hash of its key, so a capture tried again until it works is reported once. A key
 * holds the whole design it draws, too much to keep for each.
 */
const reported = new Set<number>()

/** Calls `listener` with each frame render that fails, once for each thing it shows. */
export function onFailedRender(listener: FailedRenderListener): () => void {
  failedRenderListeners.add(listener)
  return () => {
    failedRenderListeners.delete(listener)
  }
}

/** Tells listeners a frame's render failed, unless it already failed showing the same thing. */
export function failedRender(key: string, error: unknown, drawn: RenderedDesign | undefined): void {
  const hash = hashOf(key)
  if (!drawn || reported.has(hash)) return
  if (reported.size >= 1000) reported.clear()
  reported.add(hash)
  for (const listener of failedRenderListeners) listener(error, drawn)
}

/** FNV-1a, 32 bits: a key that collides with another reported one only goes unreported. */
function hashOf(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
