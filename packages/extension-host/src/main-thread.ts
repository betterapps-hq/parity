import type { RecordExtensionEvent } from "./events.ts"
import type { CallMeter } from "./window-modules.ts"

/*
 * Window modules' time on the main thread (docs/proposals/extensions-in-the-window.md, "Time on the main thread"). The
 * window times each call core makes into a module, and puts each long animation frame down to the module whose chunk
 * ran most of its scripts. A call over 16 ms or a frame put down to a module records `extension.slow`, at most once per
 * extension a minute; once a minute, each module active in a visible tab records `extension.mainThread`. Past a budget,
 * the window is told, to say which extension is slowing the editor. Nothing here knows the browser: the window gives it
 * the frames `PerformanceObserver` sees.
 */

/** A long animation frame, as the window's `long-animation-frame` entries give it. */
export interface LongFrame {
  durationMs: number
  /** How long it kept input waiting, past 50 ms of each task. */
  blockingMs: number
  /** The scripts it ran, by the URL of the file each came from, and how long each ran. */
  scripts: readonly { sourceURL: string; durationMs: number }[]
}

/** A module active in a visible tab, at the end of a minute. */
export interface ActiveModule {
  extension: string
  /** How many layers it draws. */
  layers: number
}

export interface MainThreadOptions {
  record: RecordExtensionEvent
  /** Which extension's window module a script's file belongs to, if any (`scriptOwner`). */
  ownerOf(sourceURL: string): string | undefined
  /** The time, in milliseconds. `Date.now` unless given. */
  now?: () => number
  /** How much of the main thread a module may take in a minute before `overBudget` is told. 1000 ms unless given. */
  budgetMs?: number
  /** A module took more than its budget this minute. Told once per extension. */
  overBudget?(extension: string): void
  /** Whether layers' renders are counted, as React's Profiler counts them where it reports. Asked at each minute's end. */
  rendersCounted?: () => boolean
}

/** Window modules' time on the main thread, across the window's tabs. */
export interface MainThreadMeter extends CallMeter {
  /** A long animation frame ended. */
  frame(frame: LongFrame): void
  /** One of an extension's layers rendered. */
  rendered(extension: string): void
  /** A minute ended: records `extension.mainThread` for each module active in a visible tab, and starts another. */
  minute(active: readonly ActiveModule[]): void
}

/** A call into a module that takes longer than this, in milliseconds, records `extension.slow`. */
export const slowCallMs = 16

/** Past this, in milliseconds, a task keeps input waiting. */
const taskMs = 50

const minuteMs = 60_000

/** One extension's minute. */
interface Minute {
  callbacks: number
  callbackMs: number
  durations: number[]
  longFrames: number
  layerRenders: number
  /** Slow calls and frames this minute, recorded or not. */
  slow: number
  /** Time it took this minute: its calls, and the long frames put down to it. */
  spentMs: number
}

function blankMinute(): Minute {
  return { callbacks: 0, callbackMs: 0, durations: [], longFrames: 0, layerRenders: 0, slow: 0, spentMs: 0 }
}

/** Measures window modules' time on the main thread. */
export function mainThreadMeter(options: MainThreadOptions): MainThreadMeter {
  const now = options.now ?? (() => Date.now())
  const budgetMs = options.budgetMs ?? 1000
  const minutes = new Map<string, Minute>()
  /** When each extension last recorded `extension.slow`. */
  const lastSlow = new Map<string, number>()
  const warned = new Set<string>()

  const minuteOf = (extension: string) => {
    const found = minutes.get(extension) ?? blankMinute()
    minutes.set(extension, found)

    return found
  }

  const spent = (extension: string, minute: Minute, ms: number) => {
    minute.spentMs += ms

    if (minute.spentMs > budgetMs && !warned.has(extension)) {
      warned.add(extension)
      options.overBudget?.(extension)
    }
  }

  const slow = (
    extension: string,
    minute: Minute,
    attributes: { kind: "frame" | "callback"; api?: string; durationMs: number; blockingMs: number }
  ) => {
    minute.slow += 1
    const at = now()
    const last = lastSlow.get(extension)

    if (last !== undefined && at - last < minuteMs) {
      return
    }

    lastSlow.set(extension, at)
    const { kind, api, durationMs, blockingMs } = attributes
    const rounded = { extension, kind, durationMs: Math.round(durationMs), blockingMs: Math.round(blockingMs) }
    options.record("extension.slow", api === undefined ? rounded : { ...rounded, api })
  }

  return {
    called(extension, api, ms) {
      const minute = minuteOf(extension)
      minute.callbacks += 1
      minute.callbackMs += ms
      minute.durations.push(ms)
      spent(extension, minute, ms)

      if (ms > slowCallMs) {
        slow(extension, minute, { kind: "callback", api, durationMs: ms, blockingMs: Math.max(0, ms - taskMs) })
      }
    },
    frame(frame) {
      const owner = frameOwner(frame, (sourceURL) => options.ownerOf(sourceURL))

      if (owner === undefined) {
        return
      }

      const minute = minuteOf(owner)
      minute.longFrames += 1
      spent(owner, minute, frame.blockingMs)
      slow(owner, minute, { kind: "frame", durationMs: frame.durationMs, blockingMs: frame.blockingMs })
    },
    rendered(extension) {
      minuteOf(extension).layerRenders += 1
    },
    minute(active) {
      for (const { extension, layers } of active) {
        const minute = minutes.get(extension) ?? blankMinute()

        const attributes = {
          extension,
          callbacks: minute.callbacks,
          callbackMs: Math.round(minute.callbackMs),
          callbackP95Ms: Math.round(percentile(minute.durations, 0.95)),
          longFrames: minute.longFrames,
          slow: minute.slow,
          layers
        }

        options.record(
          "extension.mainThread",
          options.rendersCounted?.() ? { ...attributes, layerRenders: minute.layerRenders } : attributes
        )
      }

      minutes.clear()
    }
  }
}

/**
 * The extension whose window module ran most of a long frame's scripts, by time, if one did. A frame whose scripts are
 * mostly Parity's own, or nobody's, is no extension's.
 */
export function frameOwner(frame: LongFrame, ownerOf: (sourceURL: string) => string | undefined): string | undefined {
  const byOwner = new Map<string, number>()
  let total = 0

  for (const script of frame.scripts) {
    total += script.durationMs
    const owner = ownerOf(script.sourceURL)

    if (owner !== undefined) {
      byOwner.set(owner, (byOwner.get(owner) ?? 0) + script.durationMs)
    }
  }

  for (const [owner, ms] of byOwner) {
    if (ms > total / 2) {
      return owner
    }
  }

  return undefined
}

/**
 * Which of `extensions` a script's file belongs to: one under the extension's package folder, as the dev server serves
 * it, or its window module's chunk, which the build names `<package folder>-window-<hash>.js`.
 */
export function scriptOwner(sourceURL: string, extensions: Iterable<string>): string | undefined {
  const path = sourceURL.replaceAll("\\", "/").split(/[?#]/)[0] ?? ""

  for (const extension of extensions) {
    const folder = extension.slice(extension.lastIndexOf("/") + 1)

    if (path.includes(`/${folder}/`) || path.includes(`/${folder}-window-`)) {
      return extension
    }
  }

  return undefined
}

/** The value `share` of the way up `values`, sorted; 0 for none. */
function percentile(values: readonly number[], share: number): number {
  const sorted = values.toSorted((a, b) => a - b)

  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
}
