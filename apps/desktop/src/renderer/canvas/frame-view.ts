import { distanceFromView, type PlaceInView, viewRank } from "@parity-app/core"
import { type RefObject, useEffect, useMemo } from "react"
import { type Atom, atom } from "tldraw"

/**
 * How far around the view a frame counts as near, as boards do (see `ContainerUtil`): drawn before it scrolls in, and
 * woken before it's seen.
 */
const nearMargin = "25%"

/** Where a frame on the canvas is against the view, for what's drawn and captured first (PAR-955). */
export interface FrameView {
  /** How urgent work on the frame is, lowest first (`viewRank`): infinite until it's first seen. */
  rank: () => number
  /** Whether the frame is in or around the view. True until it's first seen, so nothing waits on that. */
  near: Atom<boolean>
}

interface Seen {
  place?: PlaceInView
  near: Atom<boolean>
}

/** Each frame's place, by its tile, as the canvas's observers last reported it. */
const seen = new WeakMap<Element, Seen>()

/** Each canvas's observer, of the view and a margin around it. */
const watchers = new WeakMap<Element, IntersectionObserver>()

/**
 * Where a frame is against the view, from an `IntersectionObserver` its canvas shares, of the view and a margin around
 * it. The browser reports a frame as it crosses that edge, with its box, so ranking the frames waiting to wake or be
 * captured reads what was reported rather than measuring each of them. One observer with no thresholds: a zoom moves
 * every frame on every frame, and each edge watched is checked and reported again for all of them. Each frame is
 * watched on its own, since a board with many states and modes is large, and part of it near the view says little about
 * the rest.
 */
export function useFrameView(tile: RefObject<HTMLElement | null>): FrameView {
  const view = useMemo<FrameView & { seen: Seen }>(() => {
    const record: Seen = { near: atom("frame near", true) }

    return {
      seen: record,
      near: record.near,
      rank: () => (record.place ? viewRank(record.place) : Number.POSITIVE_INFINITY)
    }
  }, [])

  useEffect(() => {
    const element = tile.current
    const area = element?.closest(".canvas-area")

    if (!element || !area) {
      return undefined
    }

    const watching = watcher(area)
    seen.set(element, view.seen)
    watching.observe(element)

    return () => {
      watching.unobserve(element)
      seen.delete(element)
    }
  }, [tile, view])

  return view
}

/** The canvas's observer, made the first time a frame on it asks. */
function watcher(area: Element): IntersectionObserver {
  const known = watchers.get(area)

  if (known) {
    return known
  }

  const made = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const record = seen.get(entry.target)

        if (!record || !entry.rootBounds) {
          continue
        }

        // The root's bounds take in the margin, a quarter of the view on each side, so the view is the middle of them.
        const outer = entry.rootBounds
        const width = outer.width / 1.5
        const height = outer.height / 1.5
        const view = { left: outer.left + width / 4, top: outer.top + height / 4, width, height }
        const box = entry.boundingClientRect

        record.place = {
          near: entry.isIntersecting,
          inView:
            box.right > view.left &&
            box.left < view.left + view.width &&
            box.bottom > view.top &&
            box.top < view.top + view.height,
          distance: distanceFromView(box, view)
        }
        record.near.set(entry.isIntersecting)
      }
    },
    { root: area, rootMargin: nearMargin }
  )

  watchers.set(area, made)

  return made
}
