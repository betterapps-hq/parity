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

const counts = (what: string) =>
  z
    .object({
      hits: z.number().int().nonnegative().describe(`${what} found kept for the code they draw`),
      misses: z.number().int().nonnegative().describe(`${what} looked for and not kept for the code they draw`),
      hitRate: z.number().min(0).max(1).describe("The share of lookups found, from 0 to 1")
    })
    .describe(`${what} looked up on disk this session`)

export const bitmapCacheUsed = defineEvent(
  "bitmapCache.used",
  z.object({ frames: counts("Frame bitmaps"), previews: counts("Component previews") }),
  {
    level: "info",
    sentBy: ["service"],
    when: "Each minute in which bitmaps or previews were looked up, with this session's totals so far."
  }
)

export const renderEvents = [frameRendered, frameFailed, previewMade, previewFailed, bitmapCacheUsed] as const

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

/**
 * Counts the bitmap cache's lookups for a session, and gives `bitmapCache.used`'s attributes when `report` is called
 * after any lookup since the last report; nothing otherwise, so an idle session sends nothing.
 */
export function cacheCounter(): {
  frame(hit: boolean): void
  preview(hit: boolean): void
  report(): z.input<typeof bitmapCacheUsed.schema> | undefined
} {
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

  const rate = ({ hits, misses }: Tally) => ({
    hits,
    misses,
    hitRate: hits + misses === 0 ? 0 : Math.round((hits / (hits + misses)) * 1000) / 1000
  })

  return {
    frame: (hit) => count(frames, hit),
    preview: (hit) => count(previews, hit),
    report() {
      if (!changed) {
        return undefined
      }

      changed = false

      return { frames: rate(frames), previews: rate(previews) }
    }
  }
}
