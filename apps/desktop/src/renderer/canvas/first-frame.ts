import type { FirstFrame } from "../opening.ts"

/**
 * Watches a newly opened project's frames for the first one seen on screen (PAR-711). A frame offers what it has to show
 * once it has it: its bitmap once decoded, or the element its design was drawn in. Whether either is seen depends on
 * styles, not on what the frame renders: a bitmap shows only for a frame asleep or zoomed far out, and a live frame is
 * skipped while its bitmap stands in. So each animation frame, while anything is offered and nothing has been seen, it
 * looks at what was offered, and stops for good once one is seen.
 */
export interface FirstFrameWatch {
  /** Offers something a frame shows. Gives back what takes it back, as when the frame unmounts or shows another. */
  offer(element: Element, from: FirstFrame): () => void
}

export interface WatchOptions {
  /** Whether an element is seen now. */
  seen?: (element: Element) => boolean
  schedule?: (tick: () => void) => number
  cancel?: (id: number) => void
}

/** Whether an element is drawn on screen: rendered, not skipped by `content-visibility`, and in the window. */
export function onScreen(element: Element): boolean {
  if (!element.isConnected || !element.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
    return false
  const box = element.getBoundingClientRect()
  return (
    box.width > 0 && box.height > 0 && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight
  )
}

/** Watches for the first frame seen, and calls `record` with how it was drawn, once. */
export function watchFirstFrame(
  record: (from: FirstFrame) => void,
  {
    seen = onScreen,
    schedule = (tick) => requestAnimationFrame(tick),
    cancel = (id) => cancelAnimationFrame(id)
  }: WatchOptions = {}
): FirstFrameWatch {
  const offered = new Map<Element, FirstFrame>()
  let pending: number | undefined
  let done = false
  const tick = () => {
    pending = undefined
    for (const [element, from] of offered) {
      if (!seen(element)) continue
      done = true
      offered.clear()
      record(from)
      return
    }
    if (offered.size > 0) pending = schedule(tick)
  }
  return {
    offer(element, from) {
      if (done) return () => undefined
      offered.set(element, from)
      pending ??= schedule(tick)
      return () => {
        if (offered.get(element) === from) offered.delete(element)
        if (offered.size === 0 && pending !== undefined) {
          cancel(pending)
          pending = undefined
        }
      }
    }
  }
}
