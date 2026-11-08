import {
  memoryEveryMs,
  type registeredEvents,
  type StartupStep,
  startupTimer,
  type Telemetry,
  type UpdatePhase,
  updateRecord
} from "@parity-app/telemetry"
import { app } from "electron"

/** Whether a window's event is `project.loaded`, and whether its project was restored, or nothing when it isn't. */
function projectLoadedOf(envelope: unknown): { restored: boolean } | undefined {
  if (typeof envelope !== "object" || envelope === null) return undefined
  const { name, attributes } = envelope as { name?: unknown; attributes?: { restored?: unknown } }
  if (name !== "project.loaded") return undefined
  return { restored: attributes?.restored === true }
}

/** What `process.memory` lists: each process's role and private memory in bytes. */
export type MemoryReading = () => Promise<{ role: string; memory: number }[]>

/**
 * Records the app's own life from main (PAR-631): how long it took to start, how it quit, each update step, and every
 * process's memory every 5 minutes and when a window hangs. Startup counts from the process starting, which is where
 * `performance.now()` begins.
 */
export function recordAppLife(telemetry: Telemetry<typeof registeredEvents>, readMemory: MemoryReading) {
  const startup = startupTimer(0)
  let lastWindowClosed = false
  let previousUpdate: UpdatePhase = { phase: "idle" }

  const recordMemory = (reason: "interval" | "hang") =>
    readMemory().then(
      (processes) =>
        telemetry.track("process.memory", {
          reason,
          processes: processes.map(({ role, memory }) => ({ role, memory: Math.round(memory) }))
        }),
      () => undefined
    )
  setInterval(() => void recordMemory("interval"), memoryEveryMs).unref()

  app.on("window-all-closed", () => (lastWindowClosed = true))
  // Before the local copy is written as the app quits, so it's in it.
  app.prependListener("will-quit", () => {
    let reason: "update" | "window closed" | "other" = lastWindowClosed ? "window closed" : "other"
    if (previousUpdate.phase === "installing") reason = "update"
    telemetry.track("app.quit", { reason, sessionMs: Math.round(performance.now()) })
  })

  return {
    /**
     * Marks a startup step the first time it happens: `app.started` goes once its steps are in, and
     * `app.first_project` when the first project shows.
     */
    mark(step: StartupStep, how?: { restored: boolean }): void {
      const record = startup(step, performance.now(), how)
      if (record?.name === "app.started") telemetry.track(record.name, record.attributes)
      else if (record) telemetry.track(record.name, record.attributes)
    },
    /** Marks the first project shown when a window's event says a project is ready to draw. */
    forwarded(envelope: unknown): void {
      const loaded = projectLoadedOf(envelope)
      if (loaded) this.mark("firstProject", loaded)
    },
    /** Records a change in the update state that's a step: checked, downloaded, installing or failed. */
    update(next: UpdatePhase & { beta: boolean }): void {
      const record = updateRecord(previousUpdate, next, { version: app.getVersion(), beta: next.beta })
      previousUpdate = next
      if (record?.name === "update.checked") telemetry.track(record.name, record.attributes)
      else if (record?.name === "update.failed") telemetry.track(record.name, record.attributes)
      else if (record) telemetry.track(record.name, record.attributes)
    },
    /** Records every process's memory as a window stops answering. */
    windowHung(): void {
      void recordMemory("hang")
    }
  }
}
