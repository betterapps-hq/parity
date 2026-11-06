import { type ComponentSource, type FrameGeometry, modeGlobals, type ResolvedMode } from "@parity-app/core"
import type { TokenChange } from "@parity-app/tokens"
import type { RenderJob } from "./protocol.ts"

/**
 * A render job (PAR-575): the frame the offscreen window draws, built here for the canvas's bitmaps, component previews
 * and agents' frames; the names each store keeps what it drew under; and the arithmetic between a frame's CSS pixels and
 * the device pixels it's drawn at. Each name picks the fields it's made of, so a field added to the job is in none of
 * them until it's added here.
 */

/** Where a job is drawn: the project, its guest, and what the guest draws with. */
export interface JobGuest {
  projectId: string
  guestUrl: string
  /** Components the guest is given since it loaded, as the type checker found them. */
  components?: RenderJob["components"]
  theme: RenderJob["theme"]
}

/** What a job draws, and how. */
export interface JobFrame {
  tree: unknown
  mode: ResolvedMode
  /** The frame's size and window, as core's `frameGeometry` resolved them, so it draws as the live frame does. */
  frame: FrameGeometry
  scale: number
  /** Every token value that differs from the compiled CSS. None, or an empty list, draws the compiled stylesheet. */
  tokens?: readonly TokenChange[]
  audit?: boolean
  /** When auditing, the color tokens to read the values of. */
  colorTokens?: string[]
  /** Draw what the frame's components portal out of it inside it, as a component preview does (PAR-517). */
  inlinePortals?: boolean
  /** The design it draws, for the console messages it writes (PAR-147). */
  design?: RenderJob["design"]
}

/** The job that draws `frame` with `guest`. */
export function renderJob(guest: JobGuest, frame: JobFrame): RenderJob {
  const { audit, colorTokens, tokens } = frame
  return {
    projectId: guest.projectId,
    guestUrl: guest.guestUrl,
    ...(guest.components ? { components: guest.components } : {}),
    theme: guest.theme,
    tree: frame.tree,
    mode: renderJobMode(frame.mode, frame.frame),
    scale: frame.scale,
    ...(audit ? { audit } : {}),
    ...(audit && colorTokens?.length ? { colorTokens } : {}),
    ...(frame.inlinePortals ? { inlinePortals: true as const } : {}),
    ...(tokens?.length ? { previews: [...tokens] } : {}),
    ...(frame.design ? { design: frame.design } : {})
  }
}

/**
 * The mode of a frame the offscreen window draws: the frame's size and window as core's `frameGeometry` resolved them,
 * so it draws as the live frame does, and the mode's classes, attributes and options.
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

// The three names, side by side. The canvas names a frame in memory for as long as its guest lives, so it goes by the
// guest itself and leaves out the theme the guest was loaded with. The disk names outlive the guest's address, so they
// go by the code it was served instead, which the stores add; a bitmap goes by the tokens previewed and the project,
// and a preview by neither, since previews never draw unsaved tokens and each project keeps its own folder of them.
// Checking a frame (`audit`, `colorTokens`) changes nothing drawn, so it's in no name.

/** The guest a frame is drawn by on the canvas, which its memory key goes by: its id, and its code's revision. */
export interface DrawingGuest {
  id: number
  code: number
}

/** A frame's names in the canvas's memory: what it draws, and that with everything else its bitmap shows. */
export interface FrameKeys {
  /**
   * What the live frame draws: the guest and its code, the mode's classes, attributes and options, and the tree. The live
   * frame draws again when it changes; its size and the tokens previewed it follows by itself.
   */
  drawn: string
  /**
   * `drawn`, with the tokens previewed, the frame's size and window, and the scale: everything its bitmap shows.
   * Bitmaps, skeletons and sleep go by it.
   */
  key: string
}

/** A frame's names in the canvas's memory, for the job that draws it with `guest`. */
export function frameKeys(job: RenderJob, guest: DrawingGuest): FrameKeys {
  const { mode } = job
  const drawn = [
    guest.id,
    guest.code,
    job.guestUrl,
    JSON.stringify([mode.classNames, mode.attributes, mode.globals]),
    JSON.stringify(job.tree)
  ].join("|")
  const key = [
    drawn,
    JSON.stringify(job.previews ?? []),
    mode.width,
    mode.height,
    mode.viewport.width,
    mode.viewport.height,
    job.scale
  ].join("|")
  return { drawn, key }
}

/**
 * What a frame's bitmap on disk is named by, beside the code its guest was served (PAR-158): the job less where it's
 * drawn from, which is new each time the project opens, and where each component the frame draws comes from
 * (`drawnComponents`), so the name is the same in a session whose guest was served them all (PAR-179).
 */
export function bitmapName(
  job: RenderJob,
  served: Readonly<Record<string, Pick<ComponentSource, "path" | "export">>>
): string {
  const drawn = {
    projectId: job.projectId,
    theme: job.theme,
    tree: job.tree,
    mode: drawnMode(job.mode),
    scale: job.scale,
    ...(job.inlinePortals ? { inlinePortals: true } : {}),
    ...(job.previews ? { previews: job.previews } : {})
  }
  return `${JSON.stringify(drawn)}\0${JSON.stringify(drawnComponents(job.tree, served, job.components))}`
}

/**
 * What a component preview is named by, beside the files it depends on (PAR-207): what it draws and how, less where
 * it's drawn from, what the guest was given and the tokens previewed.
 */
export function previewName(job: RenderJob): unknown {
  return {
    theme: job.theme,
    tree: job.tree,
    mode: drawnMode(job.mode),
    scale: job.scale,
    ...(job.inlinePortals ? { inlinePortals: true } : {})
  }
}

/** A job's mode as the disk names have it, field by field, so a field added to the mode is in neither. */
function drawnMode(mode: RenderJob["mode"]): RenderJob["mode"] {
  return {
    width: mode.width,
    ...(mode.height === undefined ? {} : { height: mode.height }),
    viewport: { width: mode.viewport.width, height: mode.viewport.height },
    classNames: mode.classNames,
    attributes: mode.attributes,
    ...(mode.globals ? { globals: mode.globals } : {})
  }
}

/**
 * Where each component a frame's tree draws comes from, as `path#export` in order of id: from the components the guest
 * was given since it loaded (`given`, a job's `components`) or else those it was served with. A kept bitmap is named by
 * these rather than by how they reached the guest, so a frame drawn while the type checker added components to the guest
 * is found again in a later session, whose guest is served them all from the start (PAR-179). A component it has no
 * source for is listed as `null`.
 */
export function drawnComponents(
  tree: unknown,
  served: Readonly<Record<string, Pick<ComponentSource, "path" | "export">>>,
  given: RenderJob["components"] = {}
): [string, string | null][] {
  const ids = new Set<string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
    } else if (value && typeof value === "object") {
      const node = value as { kind?: unknown; component?: unknown }
      if (node.kind === "component" && typeof node.component === "string") ids.add(node.component)
      for (const child of Object.values(value)) visit(child)
    }
  }
  visit(tree)
  const own = <T>(record: Readonly<Record<string, T>>, id: string) =>
    Object.hasOwn(record, id) ? record[id] : undefined
  return [...ids].sort().map((id) => {
    const source = own(given, id) ?? own(served, id)
    return [id, source ? `${source.path}#${source.export}` : null]
  })
}

// The scale. A job draws its frame `scale` device pixels to each of its CSS pixels: the offscreen window is sized and
// cropped in device pixels, and the frame measured back in CSS pixels.

/** A length of the frame's, in CSS pixels, as whole device pixels to size a window by: at least one. */
export function devicePixels(length: number, scale: number): number {
  return Math.max(1, Math.ceil(length * scale))
}

/** A box in the frame, in CSS pixels, as the device pixels that cover it, to crop a capture to. */
export function deviceBox(
  box: { x: number; y: number; width: number; height: number },
  scale: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.floor(box.x * scale),
    y: Math.floor(box.y * scale),
    width: devicePixels(box.width, scale),
    height: devicePixels(box.height, scale)
  }
}

/** A box the window measured, in device pixels, as the frame's CSS pixels from `origin`, to a tenth of a pixel. */
export function frameBox(
  box: { left: number; top: number; width: number; height: number },
  origin: { left: number; top: number },
  scale: number
): { x: number; y: number; width: number; height: number } {
  const css = (value: number) => Math.round((value / scale) * 10) / 10
  return {
    x: css(box.left - origin.left),
    y: css(box.top - origin.top),
    width: css(box.width),
    height: css(box.height)
  }
}

/** A height the window measured, in device pixels, as the frame's whole CSS pixels. */
export function frameHeight(height: number, scale: number): number {
  return Math.ceil(height / scale)
}
