import { type FrameGeometry, modeGlobals, type ResolvedMode } from "@parity-app/core"
import type { RenderJob } from "./protocol.ts"

/**
 * The mode of a frame the offscreen window draws: the frame's size and window as core's `frameGeometry` resolved them,
 * so it draws as the live frame does, and the mode's classes, attributes and options. Bitmaps and agents' frames both
 * build theirs here.
 */
export function renderJobMode(mode: ResolvedMode, frame: FrameGeometry): RenderJob["mode"] {
  return {
    width: frame.width,
    ...(frame.height === undefined ? {} : { height: frame.height }),
    viewport: { width: frame.viewport.width, height: frame.viewport.height },
    classNames: mode.classNames,
    attributes: mode.attributes,
    globals: modeGlobals(mode)
  }
}

/**
 * The components the offscreen guest was given by an earlier job that this job's no longer carries: their source went
 * away, so it takes them back, as the canvas's guest does. A job that carries no components says nothing about them.
 */
export function componentsGone(
  given: RenderJob["components"] | undefined,
  now: RenderJob["components"] | undefined
): string[] {
  if (!given || !now) return []
  return Object.keys(given).filter((id) => !(id in now))
}
