import { modeGlobals, type RenderNode, type ResolvedMode } from "@parity-app/core"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { RenderJob } from "../../shared/protocol.ts"
import type { ProjectSession } from "../workspace.ts"

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
/** How many frames on the canvas show each bitmap. One nothing waits for is skipped when its turn comes. */
const wanted = new Map<string, number>()
/** One capture at a time, so agents' renders and exports still get their turn in the offscreen window. */
let queue: Promise<unknown> = Promise.resolve()

const guests = new WeakMap<object, number>()
let nextGuest = 1

/** What a frame shows, as keys, and the job that draws it offscreen. */
export interface FrameShows {
  /**
   * What the frame's design renders: the project's guest and the revision of its code, the mode and the design's tree.
   * The live frame draws again when it changes; its size and previewed tokens it follows by itself.
   */
  drawn: string
  /** `drawn`, with the size and the tokens previewed: everything a bitmap shows. Bitmaps, skeletons and sleep go by it. */
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
  width: number,
  height: number | undefined,
  scale: number
): FrameShows {
  const previews = useSyncExternalStore(session.tokens.subscribe, session.tokens.previews)
  const { guest } = session.loaded
  const revision = guest.revision ?? noRevision
  const code = useSyncExternalStore(revision.subscribe, revision.get)
  const treeKey = useMemo(() => JSON.stringify(tree), [tree])
  const { guestUrl, theme } = session.info
  const { added } = session
  const job = useMemo<RenderJob>(
    () => ({
      projectId: session.id,
      guestUrl,
      ...(added ? { components: added } : {}),
      theme,
      tree,
      mode: {
        width,
        height,
        classNames: mode.classNames,
        attributes: mode.attributes,
        globals: modeGlobals(mode)
      },
      scale: bitmapScale * scale,
      ...(previews.length > 0 ? { previews: [...previews] } : {})
    }),
    [session.id, guestUrl, added, theme, tree, mode, width, height, scale, previews]
  )
  const previewsKey = useMemo(() => JSON.stringify(previews), [previews])
  const drawn = [
    guestId(guest),
    code,
    guestUrl,
    JSON.stringify([mode.classNames, mode.attributes, job.mode.globals]),
    treeKey
  ].join("|")
  const key = [drawn, previewsKey, width, height, scale].join("|")
  return useMemo(() => ({ drawn, key, job }), [drawn, key, job])
}

/**
 * A bitmap of a frame as it's drawn now, taken offscreen once the frame has stayed the same for a moment: nothing while
 * it's being taken, or when the frame didn't render.
 */
export function useFrameBitmap({ key, job }: FrameShows): string | undefined {
  const [shown, setShown] = useState<{ key: string; src?: string }>()
  // A new job for the same key draws the same, so it doesn't start the wait or the retries again: each try takes the
  // latest.
  const latest = useRef(job)
  useEffect(() => {
    latest.current = job
  }, [job])

  useEffect(() => {
    let current = true
    let timer: ReturnType<typeof setTimeout>
    want(key, 1)
    // A capture that failed, as the offscreen window's can on a busy machine, is tried again later rather than leaving
    // the frame without a bitmap for good.
    const take = (attempt: number) =>
      void capture(key, latest.current).then((src) => {
        if (!current) return
        if (src === failed) timer = setTimeout(() => take(attempt + 1), retryMs * Math.min(2 ** attempt, 8))
        else setShown({ key, src })
      })
    timer = setTimeout(() => take(0), bitmaps.has(key) ? 0 : settleMs)
    return () => {
      current = false
      want(key, -1)
      clearTimeout(timer)
    }
  }, [key])

  return shown?.key === key ? shown.src : undefined
}

export function capture(key: string, job: RenderJob): Promise<string | undefined | typeof failed> {
  const known = bitmaps.get(key)
  if (known) {
    bitmaps.delete(key)
    bitmaps.set(key, known)
    return known
  }
  const taking = queue.then(async () => {
    if (!wanted.has(key)) {
      bitmaps.delete(key)
      return undefined
    }
    const { png } = await window.canvasHost.request("frames.capture", { job })
    return png === undefined ? undefined : `data:image/png;base64,${png}`
  })
  const settled = taking.catch((): typeof failed => {
    if (bitmaps.get(key) === settled) bitmaps.delete(key)
    return failed
  })
  queue = settled
  bitmaps.set(key, settled)
  for (const old of bitmaps.keys()) {
    if (bitmaps.size <= kept) break
    bitmaps.delete(old)
  }
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
