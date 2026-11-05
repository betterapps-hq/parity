import { useEffect, useState } from "react"
import { react, type Signal } from "tldraw"

/**
 * Where a board is, for its frames' sleep: whether they may sleep, zoomed far out and the board not selected, and
 * whether the board is near the view. They're signals rather than props, so the camera moving draws no board again:
 * only a frame falling asleep or waking does.
 */
export interface BoardRest {
  dormant: Signal<boolean>
  near: Signal<boolean>
}

/**
 * How long a tab stays hidden before its frames sleep, so flipping through tabs doesn't take every frame apart and draw
 * it again each time (PAR-153).
 */
export const hiddenSleepMs = 3000

/**
 * Whether a board's frames are to sleep (`BoardRest.dormant`): every board of a tab that's been hidden a while, once
 * it's been drawn, so its frames have a size to keep; and zoomed far out, every board but the selected one.
 */
export function boardDormant(at: { hidden: boolean; drawn: boolean; far: boolean; selected: boolean }): boolean {
  return (at.hidden && at.drawn) || (at.far && !at.selected)
}

/** Frames waiting to wake, in the order they asked. */
const waking = new Set<() => void>()
let frame = 0

/**
 * Whether a frame's design is drawn. Zoomed far out, a frame showing its bitmap (`canSleep`) sleeps: it lets go of its
 * design's React root and elements, most of what each frame holds, and keeps its size and its bitmap. It wakes once
 * it's no longer to sleep and its board is near the view, one frame each animation frame, since waking a whole
 * project's frames at once kept the page busy for seconds. One out of view stays asleep, showing its bitmap, until it
 * comes near, unless what it shows changes (`shows`, as its bitmap is keyed): then it wakes wherever it is, so its
 * board takes the new size, which agents read. Without `rest`, as outside a canvas, a frame never sleeps.
 */
export function useAwake(canSleep: boolean, rest: BoardRest | undefined, shows: string): boolean {
  // What the frame showed when it fell asleep; nothing while it's awake.
  const [slept, setSlept] = useState<string>()
  const awake = slept === undefined
  const changed = !awake && slept !== shows
  useEffect(() => {
    if (!rest) return undefined
    if (awake) {
      if (!canSleep) return undefined
      // It falls asleep just after the effects run, not while they do. Waking a project's frames one by one, each
      // falling asleep from its effect kept React's effect pass scheduling another render dozens of times in a row,
      // which React's development build reports as "Maximum update depth exceeded" (PAR-606).
      let live = true
      const stop = react("frame sleeps", () => {
        if (!rest.dormant.get()) return
        queueMicrotask(() => {
          if (live && rest.dormant.get()) setSlept(shows)
        })
      })
      return () => {
        live = false
        stop()
      }
    }
    let cancel: (() => void) | undefined
    const stop = react("frame wakes", () => {
      if (changed || (rest.near.get() && !(canSleep && rest.dormant.get()))) {
        cancel ??= wakeSoon(() => setSlept(undefined))
      } else {
        cancel?.()
        cancel = undefined
      }
    })
    return () => {
      stop()
      cancel?.()
    }
  }, [awake, canSleep, rest, shows, changed])
  return awake
}

function wakeSoon(wake: () => void): () => void {
  waking.add(wake)
  frame ||= requestAnimationFrame(wakeNext)
  return () => {
    waking.delete(wake)
  }
}

function wakeNext(): void {
  frame = 0
  const [next] = waking
  if (!next) return
  waking.delete(next)
  next()
  if (waking.size > 0) frame = requestAnimationFrame(wakeNext)
}
