import { modeGlobals, type RenderNode, type ResolvedMode } from "@parity-app/core"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
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

/** Bitmaps by what they show, as data URLs: nothing for a frame that didn't render. */
const bitmaps = new Map<string, Promise<string | undefined>>()
/** How many frames on the canvas show each bitmap. One nothing waits for is skipped when its turn comes. */
const wanted = new Map<string, number>()
/** One capture at a time, so agents' renders and exports still get their turn in the offscreen window. */
let queue: Promise<unknown> = Promise.resolve()

const guests = new WeakMap<object, number>()
let nextGuest = 1

/**
 * A bitmap of a frame as it's drawn now, taken offscreen once the frame has stayed the same for a moment: nothing while
 * it's being taken, or when the frame didn't render. `key` says what the frame shows, for its skeleton.
 */
export function useFrameBitmap(
  session: ProjectSession,
  tree: RenderNode[],
  mode: ResolvedMode,
  width: number,
  height: number | undefined,
  scale: number
): { key: string; bitmap?: string } {
  const previews = useSyncExternalStore(session.tokens.subscribe, session.tokens.previews)
  const treeKey = useMemo(() => JSON.stringify(tree), [tree])
  const { guestUrl, theme } = session.info
  const job = useMemo<RenderJob>(
    () => ({
      projectId: session.id,
      guestUrl,
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
    [session.id, guestUrl, theme, tree, mode, width, height, scale, previews]
  )
  const previewsKey = useMemo(() => JSON.stringify(previews), [previews])
  const key = [
    guestId(session.loaded.guest),
    guestUrl,
    previewsKey,
    width,
    height,
    scale,
    JSON.stringify([mode.classNames, mode.attributes, job.mode.globals]),
    treeKey
  ].join("|")
  const [shown, setShown] = useState<{ key: string; src?: string }>()

  useEffect(() => {
    let current = true
    want(key, 1)
    const timer = setTimeout(
      () => void capture(key, job).then((src) => current && setShown({ key, src })),
      bitmaps.has(key) ? 0 : settleMs
    )
    return () => {
      current = false
      want(key, -1)
      clearTimeout(timer)
    }
  }, [key, job])

  return { key, ...(shown?.key === key && shown.src ? { bitmap: shown.src } : {}) }
}

function capture(key: string, job: RenderJob): Promise<string | undefined> {
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
  const settled = taking.catch(() => undefined)
  queue = settled
  bitmaps.set(key, settled)
  for (const old of bitmaps.keys()) {
    if (bitmaps.size <= kept) break
    bitmaps.delete(old)
  }
  return settled
}

function want(key: string, change: 1 | -1): void {
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
