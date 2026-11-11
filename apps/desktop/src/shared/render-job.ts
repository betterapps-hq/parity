import {
  type ComponentSource,
  type FrameGeometry,
  type GuestComponentSource,
  modeGlobals,
  type RenderNode,
  type ResolvedMode,
  withoutEmptyLayoutMarks
} from "@parity-app/core"
import { isComposite } from "@parity-app/core/values/evaluate"
import type { TokenChange } from "@parity-app/tokens"
import { z } from "zod"
import type { RenderJob } from "./protocol.ts"

/**
 * A render job (PAR-575): the frame the offscreen window draws, built here for the canvas's bitmaps, component previews
 * and agents' frames; the names each store keeps what it drew under; and the arithmetic between a frame's CSS pixels and
 * the device pixels it's drawn at. Each name picks the fields it's made of, so a field added to the job is in none of
 * them until it's added here.
 */

/** A node of a design tree that draws a component, by its id. */
const componentNode = z.looseObject({ kind: z.literal("component"), component: z.string() })

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
  /**
   * It stands in for a frame on the canvas, as a bitmap does, so its empty layouts keep the size and dashes the canvas
   * gives them to be seen and dropped into (see core's `emptyLayoutAttribute`). Any other frame, an agent's screenshot,
   * an export or a component preview, draws them as the code does, taking no room they wouldn't take there (PAR-888).
   */
  canvas?: boolean
}

/** The job that draws `frame` with `guest`. */
export function renderJob(guest: JobGuest, frame: JobFrame): RenderJob {
  const { audit, colorTokens, tokens } = frame
  // SAFETY: every caller passes a tree core resolved for a frame; it's `unknown` only because it crosses processes.
  const tree = frame.canvas ? frame.tree : withoutEmptyLayoutMarks(frame.tree as RenderNode[])

  const job: RenderJob = {
    projectId: guest.projectId,
    guestUrl: guest.guestUrl,
    theme: guest.theme,
    tree,
    mode: renderJobMode(frame.mode, frame.frame),
    scale: frame.scale
  }

  if (guest.components) {
    job.components = guest.components
  }

  if (audit) {
    job.audit = audit

    if (colorTokens?.length) {
      job.colorTokens = colorTokens
    }
  }

  if (frame.inlinePortals) {
    job.inlinePortals = true
  }

  if (tokens?.length) {
    job.previews = [...tokens]
  }

  if (frame.design) {
    job.design = frame.design
  }

  return job
}

/**
 * The mode of a frame the offscreen window draws: the frame's size and window as core's `frameGeometry` resolved them,
 * so it draws as the live frame does, and the mode's classes, attributes and options.
 */
export function renderJobMode(mode: ResolvedMode, frame: FrameGeometry): RenderJob["mode"] {
  const jobMode: RenderJob["mode"] = {
    width: frame.width,
    viewport: { width: frame.viewport.width, height: frame.viewport.height },
    classNames: mode.classNames,
    attributes: mode.attributes,
    globals: modeGlobals(mode)
  }

  if (frame.height !== undefined) {
    jobMode.height = frame.height
  }

  return jobMode
}

// The three names, side by side. The canvas names a frame in memory for as long as its guest lives, so it goes by the
// guest itself and leaves out the theme the guest was loaded with. The disk names outlive the guest's address, so they
// go by the code it was served instead, which the stores add; a bitmap goes by the tokens previewed and the project,
// and a preview by neither, since previews never draw unsaved tokens and each project keeps its own folder of them.
// Checking a frame (`audit`, `colorTokens`) changes nothing drawn, so it's in no name.

/** The guest a frame is drawn by on the canvas, which its memory key goes by: its id. */
export interface DrawingGuest {
  id: number
}

/** A frame's names in the canvas's memory: what it draws, and that with everything else its bitmap shows. */
export interface FrameKeys {
  /**
   * What the live frame draws: the guest, the code of the components the tree draws, the mode's classes, attributes and
   * options, and the tree. The live frame draws again when it changes; its size and the tokens previewed it follows by
   * itself. The code is each component the guest was given since it loaded, from the job's `components`: one that moved,
   * was added or taken back, or whose code changed on disk (PAR-165), changes only the frames that draw it.
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
    JSON.stringify(drawnComponents(job.tree, {}, job.components)),
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
  // JSON leaves out a field that's `undefined`, so a job without one has the name it had before the field existed.
  const drawn = {
    projectId: job.projectId,
    theme: job.theme,
    tree: job.tree,
    mode: drawnMode(job.mode),
    scale: job.scale,
    inlinePortals: job.inlinePortals,
    previews: job.previews
  }

  return `${JSON.stringify(drawn)}\0${JSON.stringify(drawnComponents(job.tree, served, job.components))}`
}

/**
 * What a component preview is named by, beside the files it depends on (PAR-207): what it draws and how, less where
 * it's drawn from, what the guest was given and the tokens previewed.
 */
export function previewName(job: RenderJob) {
  // JSON leaves out a field that's `undefined`, as `bitmapName` relies on.
  return {
    theme: job.theme,
    tree: job.tree,
    mode: drawnMode(job.mode),
    scale: job.scale,
    inlinePortals: job.inlinePortals
  }
}

/**
 * A job's mode as the disk names have it, field by field, so a field added to the mode is in neither. The names are
 * JSON, which leaves out `height` and `globals` when they're `undefined`.
 */
function drawnMode(mode: RenderJob["mode"]): RenderJob["mode"] {
  return {
    width: mode.width,
    height: mode.height,
    viewport: { width: mode.viewport.width, height: mode.viewport.height },
    classNames: mode.classNames,
    attributes: mode.attributes,
    globals: mode.globals
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
  tree: RenderJob["tree"],
  served: Readonly<Record<string, Pick<ComponentSource, "path" | "export">>>,
  given: RenderJob["components"] = {}
): [string, string | null][] {
  const ids = new Set<string>()

  const visit = (value: RenderJob["tree"]): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item)
      }
    } else if (isComposite(value)) {
      const component = componentNode.safeParse(value).data?.component

      if (component !== undefined) {
        ids.add(component)
      }

      for (const child of Object.values(value)) {
        visit(child)
      }
    }
  }

  visit(tree)

  const own = <T>(record: Readonly<Record<string, T>>, id: string) =>
    Object.hasOwn(record, id) ? record[id] : undefined

  return [...ids].sort().map((id) => {
    const source: GuestComponentSource | undefined = own(given, id) ?? own(served, id)

    if (!source) {
      return [id, null]
    }

    // A component whose code changed since its guest loaded (PAR-165) names the version, so its old bitmap isn't kept.
    return [id, `${source.path}#${source.export}${source.version === undefined ? "" : `@${source.version}`}`]
  })
}

// The scale. A job draws its frame `scale` device pixels to each of its CSS pixels: the offscreen window is sized and
// cropped in device pixels, and the frame measured back in CSS pixels.

/** A length of the frame's, in CSS pixels, as whole device pixels to size a window by: at least one. */
export function devicePixels(length: number, scale: number): number {
  return Math.max(1, Math.ceil(length * scale))
}

/** A rectangle in the frame, by its top left corner and size. */
export interface FrameRect {
  x: number
  y: number
  width: number
  height: number
}

/** A box in the frame, in CSS pixels, as the device pixels that cover it, to crop a capture to. */
export function deviceBox(box: FrameRect, scale: number): FrameRect {
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
): FrameRect {
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
