import { type FrameGeometry, offscreenWindows, type RenderNode, type ResolvedMode, turns } from "@parity-app/core"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { react } from "tldraw"
import type { RenderJob } from "../../shared/protocol.ts"
import { renderJobMode } from "../../shared/render-job.ts"
import { request } from "../service.ts"
import type { ProjectSession } from "../workspace.ts"
import type { BoardRest } from "./frame-sleep.ts"

/**
 * How much smaller than a frame its bitmap is. Zoomed out until a frame is drawn no larger than that, the canvas shows
 * the bitmap in its place, which looks the same and costs a fraction of a whole screen's elements to draw.
 */
export const bitmapScale = 0.25

/** How long a frame stays the same before it's captured, so editing doesn't capture every step. */
const settleMs = 1000
/** Bitmaps kept, most recently asked for last. Each is a quarter-size PNG. */
const kept = 400
/** How long after a failed capture it's tried again, doubling each time it fails, up to eight times as long. */
const retryMs = 2000
/** What a capture that failed gives, which isn't kept, unlike a frame that didn't render. */
export const failed = Symbol("failed")

/** Bitmaps by what they show, as data URLs: nothing for a frame that didn't render. */
const bitmaps = new Map<string, Promise<string | undefined | typeof failed>>()
/** The frame's height in its own CSS pixels, for bitmaps read from disk, by what they show. */
const heights = new Map<string, number>()
/** How many frames on the canvas show each bitmap. One nothing waits for is skipped when its turn comes. */
const wanted = new Map<string, number>()
/**
 * One capture for each offscreen window at a time, so agents' renders and exports still get their turn there, and a
 * frame nothing waits for any more is skipped when its turn comes (PAR-523).
 */
const captures = turns(offscreenWindows)
/** Frames on the canvas still waiting for their first bitmap, kept or captured. */
let waiting = 0

/**
 * How many frames on the canvas are waiting for a bitmap: to settle, to be read from disk or to be captured. Component
 * previews wait until there are none, so the canvas's own bitmaps always come first (PAR-207). A frame whose capture
 * failed stops counting, so one that can't be captured doesn't hold previews back.
 */
export function bitmapsWaiting(): number {
  return waiting
}

const guests = new WeakMap<object, number>()
let nextGuest = 1

/** What a frame shows, as keys, and the job that draws it offscreen. */
export interface FrameShows {
  /**
   * What the frame's design renders: the project's guest and the revision of its code, the mode and the design's tree.
   * The live frame draws again when it changes; its size and previewed tokens it follows by itself.
   */
  drawn: string
  /**
   * `drawn`, with the size, its window and the tokens previewed: everything a bitmap shows. Bitmaps, skeletons and sleep
   * go by it.
   */
  key: string
  job: RenderJob
}

const noRevision = { get: () => 0, subscribe: () => () => undefined }

/**
 * What a frame shows. Worked out once for each frame, so the live frame and what stands in for it zoomed out (its
 * bitmap, its skeleton) can't disagree about when it changed. A component the guest is given from a new file, as the
 * type checker finds it, changes every frame's key, so each draws again and its bitmap is taken again; the job carries
 * those components, so the offscreen renderer draws them too.
 */
export function useFrameShows(
  session: ProjectSession,
  tree: RenderNode[],
  mode: ResolvedMode,
  frame: FrameGeometry,
  scale: number
): FrameShows {
  const previews = useSyncExternalStore(session.tokens.subscribe, session.tokens.previews)
  const { guest } = session.loaded
  const revision = guest.revision ?? noRevision
  const code = useSyncExternalStore(revision.subscribe, revision.get)
  const treeKey = useMemo(() => JSON.stringify(tree), [tree])
  const { guestUrl, theme } = session.info
  const { added } = session
  const { width, height } = frame
  const { width: viewportWidth, height: viewportHeight } = frame.viewport
  const job = useMemo<RenderJob>(
    () => ({
      projectId: session.id,
      guestUrl,
      ...(added ? { components: added } : {}),
      theme,
      tree,
      mode: renderJobMode(mode, {
        width,
        ...(height === undefined ? {} : { height }),
        viewport: { width: viewportWidth, height: viewportHeight }
      }),
      scale: bitmapScale * scale,
      ...(previews.length > 0 ? { previews: [...previews] } : {})
    }),
    [session.id, guestUrl, added, theme, tree, mode, width, height, viewportWidth, viewportHeight, scale, previews]
  )
  const previewsKey = useMemo(() => JSON.stringify(previews), [previews])
  const drawn = [
    guestId(guest),
    code,
    guestUrl,
    JSON.stringify([mode.classNames, mode.attributes, job.mode.globals]),
    treeKey
  ].join("|")
  const key = [drawn, previewsKey, width, height, viewportWidth, viewportHeight, scale].join("|")
  return useMemo(() => ({ drawn, key, job }), [drawn, key, job])
}

/** A frame's bitmap, as `useFrameBitmap` has it. */
export interface FrameBitmap {
  /** As a data URL: nothing while it's read or taken, or when the frame didn't render. */
  src?: string
  /** The frame's height in its own CSS pixels, kept with the bitmap. */
  height?: number
  /**
   * The bitmap is still to come: a kept one is being looked for, or the frame waits its turn to be captured or is being
   * captured. Not once a capture has failed, which is tried again later.
   */
  pending: boolean
}

/**
 * A bitmap of a frame as it's drawn now: one kept on disk from an earlier session, or else one taken offscreen once the
 * frame has stayed the same for a moment. `measure` gives the live frame's height as it's drawn when it's captured, which
 * is kept with the bitmap; nothing while it isn't drawn. `holding` says whether the frame is holding off drawing its
 * design for the bitmap (`useFirstDrawWaits`): then nothing is being edited, so what it first shows is captured without
 * the wait (PAR-525).
 */
export function useFrameBitmap(
  { key, job }: FrameShows,
  measure?: () => number | undefined,
  holding?: () => boolean
): FrameBitmap {
  const [shown, setShown] = useState<{ key: string; src?: string; height?: number }>()
  // The key whose capture failed, until a later try gives its bitmap.
  const [failedKey, setFailedKey] = useState<string>()
  // A new job for the same key draws the same, so it doesn't start the wait or the retries again: each try takes the
  // latest.
  const latest = useRef(job)
  const measured = useRef(measure)
  const held = useRef(holding)
  // What the frame showed first, which no edit led to.
  const first = useRef(key)
  useEffect(() => {
    latest.current = job
    measured.current = measure
    held.current = holding
  }, [job, measure, holding])

  useEffect(() => {
    let current = true
    let timer: ReturnType<typeof setTimeout>
    let counted = true
    waiting++
    const settle = () => {
      if (counted) waiting--
      counted = false
    }
    want(key, 1)
    // A capture that failed, as the offscreen window's can on a busy machine, is tried again later rather than leaving
    // the frame without a bitmap for good.
    const take = (attempt: number) =>
      void capture(key, latest.current, () => measured.current?.()).then((src) => {
        if (!current) return
        settle()
        if (src === failed) {
          setFailedKey(key)
          timer = setTimeout(() => take(attempt + 1), retryMs * Math.min(2 ** attempt, 8))
        } else setShown({ key, src, ...(heights.has(key) ? { height: heights.get(key) } : {}) })
      })
    if (bitmaps.has(key)) {
      timer = setTimeout(() => take(0), 0)
    } else {
      // One kept on disk from an earlier session shows as soon as it's read, without waiting for the frame to settle or
      // its turn to be captured (PAR-158). It's captured only once there's none, after what's left of the wait.
      const asked = performance.now()
      void stored(key, latest.current).then((kept) => {
        if (!current) return
        if (kept === undefined) {
          const settled = first.current === key && held.current?.() === true
          timer = setTimeout(() => take(0), settled ? 0 : Math.max(0, settleMs - (performance.now() - asked)))
        } else {
          settle()
          setShown({ key, ...kept })
        }
      })
    }
    return () => {
      current = false
      settle()
      want(key, -1)
      clearTimeout(timer)
    }
  }, [key])

  if (shown?.key === key) return { ...shown, pending: false }
  return { pending: failedKey !== key }
}

/**
 * What the frames in each board's first row show, by project, then design and mode: what a project's picture is taken
 * from (PAR-607), so it shows the bitmaps the canvas has rather than drawing its own.
 */
const firstRows = new Map<string, Map<string, FrameShows>>()

/** Notes what a frame in its board's first row shows, for the project's picture, while it's on the canvas. */
export function useFirstRowFrame(projectId: string, design: string, mode: string, shows: FrameShows, first: boolean) {
  useEffect(() => {
    if (!first) return undefined
    const frames = firstRows.get(projectId) ?? new Map<string, FrameShows>()
    firstRows.set(projectId, frames)
    const id = `${design}\n${mode}`
    frames.set(id, shows)
    return () => {
      if (frames.get(id) === shows) frames.delete(id)
      if (frames.size === 0 && firstRows.get(projectId) === frames) firstRows.delete(projectId)
    }
  }, [projectId, design, mode, shows, first])
}

/** What a board's frame in a mode shows, in its first row, while it's on the canvas. */
export function firstRowFrame(projectId: string, design: string, mode: string): FrameShows | undefined {
  return firstRows.get(projectId)?.get(`${design}\n${mode}`)
}

/**
 * The bitmap a frame shows now, as a data URL: the one the canvas has, else one kept on disk, else captured. Nothing
 * when the frame didn't render or couldn't be captured.
 */
export async function frameBitmap({ key, job }: FrameShows): Promise<string | undefined> {
  if (!bitmaps.has(key)) {
    const kept = await stored(key, job)
    if (kept) return kept.src
  }
  // Wanted while it's taken, so it's captured even where no frame on the canvas waits for it any more.
  want(key, 1)
  try {
    const src = await capture(key, job)
    return typeof src === "string" ? src : undefined
  } finally {
    want(key, -1)
  }
}

/** A frame that hasn't drawn its design yet, as `holdsFirstDraw` decides whether it waits. */
export interface UndrawnFrame {
  bitmap: FrameBitmap
  /** Whether it's awake, by `useAwake`: it falls asleep once its bitmap shows, where its board is dormant. */
  awake: boolean
  interactive: boolean
  /** Whether its board would put it to sleep (`BoardRest.dormant`): zoomed far out, and not the selected board. */
  dormant: boolean
}

/**
 * Whether a frame that hasn't drawn its design yet holds off drawing it, where it would only show its bitmap, showing a
 * placeholder at its size instead: while its bitmap is to come, kept from an earlier session or captured offscreen, and
 * once it has come, until the frame falls asleep on it (PAR-525). Not while interacting, where frames are the real thing,
 * nor once a capture failed or came without a height, as when the frame didn't render, so it draws and shows why.
 */
export function holdsFirstDraw({ bitmap, awake, interactive, dormant }: UndrawnFrame): boolean {
  return dormant && !interactive && (bitmap.pending || (bitmap.height !== undefined && awake))
}

/**
 * Whether a frame that hasn't drawn its design yet holds off drawing it (`holdsFirstDraw`). A frame waiting for its
 * bitmap, kept from an earlier session (PAR-179) or captured offscreen (PAR-525), then sleeps on it without ever drawing
 * its design, which opening a project spent seconds on, every frame drawn only to be taken apart again. Once it stops
 * waiting, it never waits again.
 */
export function useFirstDrawWaits(rest: BoardRest | undefined, frame: Omit<UndrawnFrame, "dormant">): boolean {
  const [done, setDone] = useState(!rest)
  const [dormant, setDormant] = useState(() => rest?.dormant.get() ?? false)
  useEffect(() => {
    if (done || !rest) return undefined
    return react("frame waits to draw", () => setDormant(rest.dormant.get()))
  }, [done, rest])
  const waits = !done && holdsFirstDraw({ ...frame, dormant })
  // Set while rendering, as React allows for state that follows from props, so stopping waiting draws no extra time.
  if (!done && !waits) setDone(true)
  return waits
}

/**
 * The height of the frame drawn in `tile`, in its own CSS pixels, as the canvas draws it at any zoom: nothing while it
 * hasn't drawn its design.
 */
export function drawnHeight(tile: HTMLElement | null, width: number): number | undefined {
  const host = tile?.querySelector<HTMLElement>("[data-frame]")
  if (!host?.shadowRoot?.querySelector("[data-canvas-node]")) return undefined
  const { width: drawnWidth, height } = host.getBoundingClientRect()
  return drawnWidth > 0 ? Math.round(((height * width) / drawnWidth) * 100) / 100 : undefined
}

/** A bitmap kept on disk, as a data URL, and its frame's height when it was kept. */
export interface KeptBitmap {
  src: string
  height?: number
}

/** Reads of kept bitmaps under way, by key, so frames showing the same one share a read. */
const reading = new Map<string, Promise<KeptBitmap | undefined>>()

/**
 * The bitmap kept on disk for a job, which then stands for its key as a capture would. Nothing when none was kept; when
 * the frame was captured meanwhile, that capture, without a height.
 */
export function stored(key: string, job: RenderJob): Promise<KeptBitmap | undefined> {
  let read = reading.get(key)
  if (!read) {
    read = readStored(key, job).finally(() => reading.delete(key))
    reading.set(key, read)
  }
  return read
}

async function readStored(key: string, job: RenderJob): Promise<KeptBitmap | undefined> {
  const { src, height } = await request("frames.stored", { job }).catch((): { src?: string; height?: number } => ({}))
  const captured = bitmaps.get(key)
  if (captured) {
    return captured.then((src) => {
      if (typeof src !== "string") return undefined
      const height = heights.get(key)
      return { src, ...(height === undefined ? {} : { height }) }
    })
  }
  if (src === undefined) return undefined
  bitmaps.set(key, Promise.resolve(src))
  if (height !== undefined) heights.set(key, height)
  forgetOldest()
  return { src, ...(height === undefined ? {} : { height }) }
}

/** Lets go of the bitmaps asked for least recently, past the most kept. */
function forgetOldest(): void {
  for (const old of bitmaps.keys()) {
    if (bitmaps.size <= kept) break
    bitmaps.delete(old)
    heights.delete(old)
  }
}

/**
 * The bitmap of a frame, taken offscreen, as many at once as there are offscreen windows. `measure` gives the live
 * frame's height just before it's taken, which is kept with it: the offscreen window lays the frame out at the bitmap's
 * small zoom, where text rounds to other heights, so its own measure can be a few pixels out.
 */
export function capture(
  key: string,
  job: RenderJob,
  measure?: () => number | undefined
): Promise<string | undefined | typeof failed> {
  const known = bitmaps.get(key)
  if (known) {
    bitmaps.delete(key)
    bitmaps.set(key, known)
    return known
  }
  const taking = captures.run(async () => {
    if (!wanted.has(key)) {
      bitmaps.delete(key)
      return undefined
    }
    const height = measure?.()
    const taken = await request("frames.capture", { job, ...(height ? { height } : {}) })
    if (taken.src === undefined) return undefined
    // The height kept with it: the live frame's, or the offscreen window's for a frame that hasn't drawn.
    if (taken.height !== undefined) heights.set(key, taken.height)
    return taken.src
  })
  const settled = taking.catch((): typeof failed => {
    if (bitmaps.get(key) === settled) bitmaps.delete(key)
    return failed
  })
  bitmaps.set(key, settled)
  forgetOldest()
  return settled
}

export function want(key: string, change: 1 | -1): void {
  const count = (wanted.get(key) ?? 0) + change
  if (count > 0) wanted.set(key, count)
  else wanted.delete(key)
}

/**
 * The project's guest module as the page loaded it. A reopened project loads a new one, at a new address, so bitmaps
 * drawn before never stand in for its frames.
 */
function guestId(guest: object): number {
  let id = guests.get(guest)
  if (id === undefined) {
    id = nextGuest++
    guests.set(guest, id)
  }
  return id
}
