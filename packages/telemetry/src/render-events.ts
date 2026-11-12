import { z } from "zod"
import { ms } from "./attributes.ts"
import { defineEvent } from "./events.ts"

/*
 * Frames drawn offscreen, component previews and the bitmaps kept of them (PAR-638). Main draws every frame and preview
 * in its offscreen windows; the service makes previews and keeps bitmaps on disk. The rules that decide what's recorded
 * are here, so they're tested without Electron.
 */

const design = {
  design: z.string().optional().describe("The design's key, as the document names it. None for a component preview"),
  state: z.string().optional().describe("The design's state, when it draws one"),
  mode: z.string().optional().describe("The mode it draws in, by ID")
}

/**
 * Why a frame failed: its module didn't load, its code threw while drawing, it didn't finish in time, or its window's
 * renderer crashed under it.
 */
export type FrameFailure = "module not found" | "render threw" | "timed out" | "crashed"

const failure = z
  .enum(["module not found", "render threw", "timed out", "crashed"])
  .describe(
    "Why: its module didn't load, its code threw while drawing, it didn't finish in time, or its window's renderer crashed"
  )

export const frameRendered = defineEvent(
  "frame.rendered",
  z.object({
    ...design,
    priority: z.string().describe("The queue it waited in: render, visible or idle"),
    queuedMs: ms("How long it waited for an offscreen window"),
    whole: z.boolean().describe("Whether it was drawn whole, to capture or check it"),
    renderMs: ms("How long the guest took to draw and measure it").optional(),
    captureMs: ms("How long settling, checking and capturing it took after that, when it was drawn whole").optional(),
    width: z.number().nonnegative().describe("Its width in CSS pixels").optional(),
    height: z.number().nonnegative().describe("Its height in CSS pixels").optional(),
    nodes: z.number().int().nonnegative().describe("How many layers were measured").optional(),
    failure: failure.optional()
  }),
  {
    level: "debug",
    sentBy: ["main"],
    when: "An offscreen window draws a frame or a preview, from its turn to the end, under the trace that asked for it."
  }
)

export const frameFailed = defineEvent(
  "frame.failed",
  z.object({
    ...design,
    priority: z.string().describe("The queue it waited in: render, visible or idle"),
    failure,
    message: z.string().describe("The guest's error message, or what happened to its window"),
    stack: z.string().optional().describe("The guest's stack, when it threw an error that has one")
  }),
  {
    level: "warn",
    sentBy: ["main"],
    when: "A frame or preview drawn offscreen fails, or is still drawing 30 seconds after its turn came."
  }
)

export const previewMade = defineEvent(
  "preview.made",
  z.object({
    component: z.string().describe("The component it pictures, by ID"),
    durationMs: ms("From asking for it to keeping it, waiting for an offscreen window included"),
    width: z.number().nonnegative().describe("The large picture's width in pixels"),
    height: z.number().nonnegative().describe("The large picture's height in pixels"),
    bytes: z.number().int().nonnegative().describe("The size of both pictures kept, in bytes")
  }),
  { level: "info", sentBy: ["service"], when: "A component's preview is drawn and kept." }
)

export const previewFailed = defineEvent(
  "preview.failed",
  z.object({
    component: z.string().describe("The component it pictures, by ID"),
    reason: z
      .enum(["render threw", "drew nothing", "not finished"])
      .describe(
        "Why: its component failed to draw, it drew nothing to see, or the draw didn't finish, as when its window closed"
      ),
    message: z.string().optional().describe("What went wrong, when there's an error"),
    durationMs: ms("From asking for it to giving up")
  }),
  { level: "warn", sentBy: ["service"], when: "A component's preview can't be made." }
)

const count = (meaning: string) => z.number().int().nonnegative().describe(meaning)
const share = (meaning: string) => z.number().min(0).max(1).describe(meaning)

export const bitmapCacheUsed = defineEvent(
  "bitmapCache.used",
  z.object({
    frameHits: count("Frame bitmaps found kept on disk for the code they draw, this session"),
    frameMisses: count("Frame bitmaps looked for on disk and not kept for the code they draw, this session"),
    frameHitRate: share("The share of frame bitmap lookups found this session, from 0 to 1"),
    previewHits: count("Component previews found kept on disk for the code they draw, this session"),
    previewMisses: count("Component previews looked for on disk and not kept for the code they draw, this session"),
    previewHitRate: share("The share of component preview lookups found this session, from 0 to 1")
  }),
  {
    level: "info",
    sentBy: ["service"],
    when: "Each minute in which bitmaps or previews were looked up, with this session's totals so far."
  }
)

const showing = {
  bitmaps: count("Frames in view showing their bitmap"),
  skeletons: count("Frames in view showing their skeleton, measured from the frame, until its bitmap comes"),
  placeholders: count("Frames in view showing a plain placeholder, having never drawn, until their bitmap comes"),
  live: count("Frames in view drawing their design, having neither a bitmap nor a skeleton yet")
}

export const canvasRestedFar = defineEvent(
  "canvas.restedFar",
  z.object({
    zoom: z.number().positive().describe("The canvas's zoom, where 1 is 100%"),
    pixelRatio: z.number().positive().describe("The screen's device pixel ratio, which moves where the line is"),
    frames: count("Frames in view, leaving out the selected board's, which stay live"),
    ...showing,
    bitmapsAtRest: showing.bitmaps.describe("Frames in view showing their bitmap as the camera came to rest"),
    skeletonsAtRest: showing.skeletons.describe("Frames in view showing their skeleton as the camera came to rest"),
    placeholdersAtRest: showing.placeholders.describe(
      "Frames in view showing a placeholder as the camera came to rest"
    ),
    liveAtRest: showing.live.describe("Frames in view drawing their design as the camera came to rest"),
    untilBitmapsMs: ms("From coming to rest until every frame in view showed its bitmap, when they all did").optional(),
    ended: z
      .enum(["bitmaps", "waited", "moved"])
      .describe("Every frame in view showed its bitmap, 10 seconds passed first, or the camera moved first")
  }),
  {
    level: "info",
    sentBy: ["renderer"],
    when: "The camera rests zoomed out far enough for frames to show bitmaps, once every frame in view shows one, 10 seconds pass, or the camera moves."
  }
)

export const renderEvents = [
  frameRendered,
  frameFailed,
  previewMade,
  previewFailed,
  bitmapCacheUsed,
  canvasRestedFar
] as const

/** How long a frame may draw before it's recorded as timed out, in milliseconds. It's left to finish. */
export const frameTimeoutMs = 30_000

/** How often the bitmap cache's hit rate is recorded, in milliseconds. */
export const cacheEveryMs = 60_000

/** Messages that say a module or one it imports couldn't be loaded, as Chromium, Vite and Node word them. */
const moduleMissing =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|cannot find module|failed to resolve (import|module specifier)|does not provide an export named|module not found/i

/** Why a frame's guest failed, from its error message: a module that didn't load, or its code throwing. */
export function frameFailure(message: string): Exclude<FrameFailure, "timed out" | "crashed"> {
  return moduleMissing.test(message) ? "module not found" : "render threw"
}

/** A lookup's tally: found kept or not. */
interface Tally {
  hits: number
  misses: number
}

/** Counts the bitmap cache's lookups, and reports them when there are new ones. */
export interface CacheCounter {
  frame(hit: boolean): void
  preview(hit: boolean): void
  report(): z.input<typeof bitmapCacheUsed.schema> | undefined
}

/**
 * Counts the bitmap cache's lookups for a session, and gives `bitmapCache.used`'s attributes when `report` is called
 * after any lookup since the last report; nothing otherwise, so an idle session sends nothing.
 */
export function cacheCounter(): CacheCounter {
  const frames: Tally = { hits: 0, misses: 0 }
  const previews: Tally = { hits: 0, misses: 0 }
  let changed = false

  const count = (tally: Tally, hit: boolean) => {
    if (hit) {
      tally.hits++
    } else {
      tally.misses++
    }

    changed = true
  }

  const rate = ({ hits, misses }: Tally) =>
    hits + misses === 0 ? 0 : Math.round((hits / (hits + misses)) * 1000) / 1000

  return {
    frame: (hit) => count(frames, hit),
    preview: (hit) => count(previews, hit),
    report() {
      if (!changed) {
        return undefined
      }

      changed = false

      return {
        frameHits: frames.hits,
        frameMisses: frames.misses,
        frameHitRate: rate(frames),
        previewHits: previews.hits,
        previewMisses: previews.misses,
        previewHitRate: rate(previews)
      }
    }
  }
}

/** How long `canvas.restedFar` waits for every frame in view to show its bitmap, in milliseconds. */
export const restedFarWaitMs = 10_000

/** What the frames in view show, zoomed far out. */
export interface FramesShowing {
  bitmaps: number
  skeletons: number
  placeholders: number
  live: number
}

type RestedFar = z.input<typeof canvasRestedFar.schema>

/** Follows one rest of the camera zoomed far out, as `watchRestedFar` makes it. */
export interface RestedFarWatch {
  /** What the frames in view show at `at`: `canvas.restedFar`'s attributes once that ends the rest, else nothing. */
  saw(at: number, frames: FramesShowing): RestedFar | undefined
  /** The camera moved at `at`: the attributes, unless the rest already ended or had no frames in view. */
  moved(at: number, frames: FramesShowing): RestedFar | undefined
}

/**
 * Follows the camera resting zoomed far out, from `rest.at`, given what the frames in view show over time, and says how
 * it went once every frame in view shows its bitmap, `restedFarWaitMs` pass, or the camera moves: the frames' bitmaps,
 * skeletons, placeholders and live designs at rest (the first look that finds frames) and at the end, and how long the
 * bitmaps took. A rest with no frames in view says nothing, and a rest says it once.
 */
export function watchRestedFar(rest: { at: number; zoom: number; pixelRatio: number }): RestedFarWatch {
  let first: FramesShowing | undefined
  let ended = false

  const end = (at: number, frames: FramesShowing, how: RestedFar["ended"]): RestedFar | undefined => {
    ended = true
    const atRest = first ?? frames
    const total = frames.bitmaps + frames.skeletons + frames.placeholders + frames.live

    if (total === 0) {
      return undefined
    }

    const attributes: RestedFar = {
      zoom: rest.zoom,
      pixelRatio: rest.pixelRatio,
      frames: total,
      ...frames,
      bitmapsAtRest: atRest.bitmaps,
      skeletonsAtRest: atRest.skeletons,
      placeholdersAtRest: atRest.placeholders,
      liveAtRest: atRest.live,
      ended: how
    }

    if (how === "bitmaps") {
      attributes.untilBitmapsMs = Math.max(0, Math.round(at - rest.at))
    }

    return attributes
  }

  return {
    saw(at, frames) {
      if (ended) {
        return undefined
      }

      const total = frames.bitmaps + frames.skeletons + frames.placeholders + frames.live

      // The first look that finds frames is what showed at rest: one before they're laid out finds none.
      if (total > 0) {
        first ??= frames
      }

      if (total > 0 && frames.bitmaps === total) {
        return end(at, frames, "bitmaps")
      }

      return at - rest.at >= restedFarWaitMs ? end(at, frames, "waited") : undefined
    },
    moved(at, frames) {
      return ended ? undefined : end(at, frames, "moved")
    }
  }
}
