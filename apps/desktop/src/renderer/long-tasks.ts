import type { LongFrame } from "@parity-app/extension-host/main-thread"
import { type registeredEvents, slowThresholdMs, type Telemetry } from "@parity-app/telemetry"
import type { Attributes } from "./chrome/event-attributes.ts"

/** The inputs a long task is put down to, when one came just before it or during it. */
const inputs = ["pointerdown", "pointerup", "keydown", "wheel", "drop", "paste"] as const

/** How long before a task an input may come and still count as what started it, in milliseconds. */
const inputLeadMs = 100

/**
 * Records `renderer.long_task` for each task in the window that runs over 200 ms, through `PerformanceObserver`, with
 * the input that started it (PAR-631).
 */
export function watchLongTasks(telemetry: Telemetry<typeof registeredEvents>): void {
  if (!PerformanceObserver.supportedEntryTypes.includes("longtask")) {
    return
  }

  let last: { type: string; at: number } | undefined

  for (const type of inputs) {
    addEventListener(type, (event) => (last = { type, at: event.timeStamp }), { capture: true, passive: true })
  }

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration <= slowThresholdMs) {
        continue
      }

      const during = last && last.at >= entry.startTime - inputLeadMs && last.at <= entry.startTime + entry.duration
      const task: Attributes<"renderer.long_task"> = { durationMs: Math.round(entry.duration) }

      if (during && last) {
        task.action = last.type
      }

      telemetry.track("renderer.long_task", task)
    }
  }).observe({ type: "longtask", buffered: true })
}

/** A `long-animation-frame` entry's script, as Chromium gives it: `PerformanceScriptTiming`, which TypeScript lacks. */
interface ScriptTiming {
  sourceURL: string
  duration: number
}

/** A `long-animation-frame` entry: `PerformanceLongAnimationFrameTiming`, which TypeScript lacks. */
interface FrameTiming extends PerformanceEntry {
  blockingDuration: number
  scripts: readonly ScriptTiming[]
}

/**
 * Gives `frame` each animation frame over 50 ms, through `PerformanceObserver`, with the scripts it ran and their files,
 * which `longtask` entries can't name. Window modules' time is put down to them by those files (`extension-time.ts`).
 */
export function watchLongFrames(frame: (frame: LongFrame) => void): void {
  if (!PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
    return
  }

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // SAFETY: entries of this type are long animation frames.
      const timing = entry as FrameTiming

      frame({
        durationMs: timing.duration,
        blockingMs: timing.blockingDuration,
        scripts: timing.scripts.map((script) => ({ sourceURL: script.sourceURL, durationMs: script.duration }))
      })
    }
  }).observe({ type: "long-animation-frame", buffered: false })
}
