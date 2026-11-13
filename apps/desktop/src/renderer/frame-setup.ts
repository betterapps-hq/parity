import type { MountOptions } from "@parity-app/core"
import { frameAttributes, type ThemeAttributes } from "@parity-app/tokens"
import type { RenderJob } from "../shared/protocol.ts"
import type { FrameEnvironment } from "./frame.ts"

/**
 * The mode a frame mounts in, as a render job carries it (`renderJobMode` in shared/render-job.ts): the canvas's frames
 * and the offscreen page's describe a frame the same way, so they mount it the same way.
 */
export type FrameMode = Pick<RenderJob["mode"], "classNames" | "attributes" | "viewport" | "globals" | "touch">

/** What a frame is prepared with and what its guest mounts with, worked out from its mode. */
export interface FrameSetup {
  environment: FrameEnvironment
  options: Pick<MountOptions, "globals" | "viewport">
}

/**
 * How a frame in `mode` is prepared and mounted: its body takes the mode's classes, and the attributes that switch on
 * the project's themes for them (tokens' `frameAttributes`); its window is the mode's viewport, for its styles and for
 * the code that asks the window its size; and its decorators read the mode's options. `sheets` come after the
 * project's own styles, as the classes Parity writes for its layers do.
 */
export function frameSetup(
  mode: FrameMode,
  themes: Readonly<ThemeAttributes>,
  sheets: readonly CSSStyleSheet[] = []
): FrameSetup {
  const viewport = { width: mode.viewport.width, height: mode.viewport.height }

  const environment: FrameEnvironment = {
    classNames: [...mode.classNames],
    attributes: frameAttributes(mode, themes),
    viewport
  }

  if (mode.touch) {
    environment.touch = true
  }

  if (sheets.length > 0) {
    environment.sheets = sheets
  }

  const options: FrameSetup["options"] = { viewport }

  if (mode.globals) {
    options.globals = mode.globals
  }

  return { environment, options }
}
