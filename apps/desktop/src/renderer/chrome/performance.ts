import { useSyncExternalStore } from "react"
import type { ProcessUsage } from "../../shared/protocol.ts"
import { windowStore } from "../store.ts"

/** One second of measurements. */
export interface Sample {
  /** Frames this window drew in the last second. */
  fps: number
  /** The longest gap between two frames in that second, in milliseconds. */
  longestFrame: number
  processes: ProcessUsage[]
  /** This window's JavaScript heap, in bytes, where Chromium reports it. */
  heap?: { used: number; limit: number }
}

export interface PerformanceStats {
  latest?: Sample
  /** Frames per second for up to the last minute, oldest first. */
  history: number[]
}

const historyLength = 60
const empty: PerformanceStats = { history: [] }
const stats = windowStore(() => empty)

/** How many views show the stats; the sampler runs while any do. */
let watchers = 0
let stop: (() => void) | undefined

/** Chromium's non-standard `performance.memory`. */
type MemoryInfo = { usedJSHeapSize: number; jsHeapSizeLimit: number }

/**
 * Counts frames with requestAnimationFrame and reads every process's CPU and memory from the main process once a
 * second. Only one sampler runs, however many tabs show the stats, and only while something shows them.
 */
function start(): () => void {
  let frames = 0
  let longest = 0
  let last = performance.now()
  let since = last
  let processes: ProcessUsage[] = []

  let frame = requestAnimationFrame(function tick(now) {
    frames += 1
    longest = Math.max(longest, now - last)
    last = now
    frame = requestAnimationFrame(tick)
  })

  const timer = setInterval(() => {
    const now = performance.now()
    const fps = Math.round((frames * 1000) / (now - since))
    const longestFrame = Math.round(Math.max(longest, now - last))
    frames = 0
    longest = 0
    since = now
    // SAFETY: Chromium adds `performance.memory`, which the DOM types leave out; it's optional for other engines.
    const memory = (performance as Performance & { memory?: MemoryInfo }).memory
    const heap = memory ? { used: memory.usedJSHeapSize, limit: memory.jsHeapSizeLimit } : undefined

    const publish = () => {
      if (!stop) {
        return
      }

      const latest: Sample = { fps, longestFrame, processes }

      if (heap) {
        latest.heap = heap
      }

      stats.update((now) => ({ latest, history: [...now.history, fps].slice(-historyLength) }))
    }

    window.canvasHost.metrics().then((next) => {
      processes = next
      publish()
    }, publish)
  }, 1000)

  return () => {
    cancelAnimationFrame(frame)
    clearInterval(timer)
  }
}

function subscribe(listener: () => void): () => void {
  const unsubscribe = stats.subscribe(listener)
  watchers += 1

  if (!stop) {
    stop = start()
  }

  return () => {
    unsubscribe()
    watchers -= 1

    if (watchers > 0) {
      return
    }

    stop?.()
    stop = undefined
    stats.reset()
  }
}

export function usePerformanceStats(): PerformanceStats {
  return useSyncExternalStore(subscribe, stats.get)
}
