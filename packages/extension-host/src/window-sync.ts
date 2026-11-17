import type { Disposable } from "@parity-app/extension"
import { LineageError, type OpenFrom, type Sync } from "@parity-app/extension/internal"
import type { RecordSeamEvent, SeamAttributes } from "./events.ts"
import type { SurfaceContext, WindowSurface } from "./window-modules.ts"

/*
 * `parity.sync` for one project tab (docs/proposals/extensions-in-the-window.md, "parity.sync"). The document stays in
 * core; the extension that brings the room says how it opens and carries its changes. Core asks it through `open`
 * before the document opens, then `attach`es the document it opened. What the extension calls before then waits:
 * changes it passes in are applied, in order, once the document is open. Every change carries the document's lineage,
 * so bytes from another document are refused rather than merged. When the extension stops, the document stays open
 * here, alone, and this copy writes files.
 */

/** The open document, as the seam reads and writes it: Loro's updates, version vector and snapshot. */
export interface SyncDocument {
  /** Takes in another copy's changes. `pending` when some need changes this copy hasn't got yet. */
  receive(bytes: Uint8Array): { pending: boolean }
  version(): Uint8Array
  changesSince(version: Uint8Array): Uint8Array
  snapshot(): Uint8Array
  /** Told the changes of every commit made here. Returns what stops it. */
  onLocalChanges(listener: (bytes: Uint8Array) => void): () => void
}

/** What the tab's window does for the seam. */
export interface SyncPort {
  /** The format of the document's bytes, as `loro/1`. */
  format: string
  /** Starts or stops this copy writing files, resolving with what it wrote as it took over. */
  setWritesFiles(writes: boolean): Promise<{ filesWritten: number; stylesheetWritten: boolean }>
  writesFiles(): boolean
  /** Closes the project and opens it again, asking through `open`. */
  reopen(): Promise<void>
  /** The room went away while the document was shared, and this copy has saved: tells the person. */
  left?(saved: boolean): void
  record?: RecordSeamEvent
  /** A new lineage, for a document opened from files. Random unless given. */
  lineage?: () => string
  timers?: { set(callback: () => void, ms: number): number; clear(handle: number): void }
  now?: () => number
}

/** How the project opens, as the seam's `open` gives it to core. */
export type Opening = { from: "files"; lineage: string } | { from: "snapshot"; snapshot: Uint8Array; lineage: string }

/** The tab's `parity.sync`, and what core opens the project through. */
export interface SyncSeam extends WindowSurface, Disposable {
  /** Whether an extension has said how the project opens. */
  readonly handled: boolean
  /**
   * Asks the extension how the project opens, waiting up to 30 s. Nothing when none has said, or when it rejected or
   * took too long: the project then opens from files, alone, and sync is detached until it reopens.
   */
  open(): Promise<Opening | undefined>
  /** The document opened as `open` said: what waited for it goes on. */
  attach(document: SyncDocument, lineage: string): void
  /** The project is closing, as its tab closes or reopens: nothing is detached or saved for it. */
  close(): void
}

/** How long core waits for `onOpen`. */
export const openWaitMs = 30_000

/** How long changes may wait for others before `sync.pending` is recorded. */
const pendingWarnMs = 5000
const minuteMs = 60_000
const magic = [0x70, 0x31] as const

/** A change another copy made, and the lineage of the document it was made in. */
export interface Change {
  lineage: string
  bytes: Uint8Array
}

/** A change as the extension carries it: the document's lineage, then the document's own bytes. */
export function framed(lineage: string, bytes: Uint8Array): Uint8Array {
  const id = new TextEncoder().encode(lineage)

  if (id.length > 255) {
    throw new Error("A lineage is at most 255 bytes")
  }

  const frame = new Uint8Array(magic.length + 1 + id.length + bytes.length)
  frame.set(magic, 0)
  frame[magic.length] = id.length
  frame.set(id, magic.length + 1)
  frame.set(bytes, magic.length + 1 + id.length)

  return frame
}

/** The lineage and the document's bytes of a change the extension carried. */
export function unframed(frame: Uint8Array): Change {
  const length = frame[magic.length]

  if (frame[0] !== magic[0] || frame[1] !== magic[1] || length === undefined || frame.length < 3 + length) {
    throw new Error("These bytes aren't changes from parity.sync")
  }

  const start = magic.length + 1

  return {
    lineage: new TextDecoder().decode(frame.subarray(start, start + length)),
    bytes: frame.subarray(start + length)
  }
}

type State =
  /** Not open yet: what's called waits. */
  | { kind: "waiting" }
  /** Open and shared. */
  | { kind: "attached"; document: SyncDocument; lineage: string; stopLocal: () => void }
  /** Open alone: `onOpen` failed, or the room went away. */
  | { kind: "detached"; lineage: string }
  | { kind: "closed" }

/** A tab's sync seam, for `windowModules`'s `surfaces` and for core's opening of the project. */
export function windowSync(port: SyncPort): SyncSeam {
  const timers = port.timers ?? {
    set: (callback: () => void, ms: number) => Number(setTimeout(callback, ms)),
    clear: (handle: number) => clearTimeout(handle)
  }

  const now = port.now ?? (() => performance.now())
  const newLineage = port.lineage ?? (() => crypto.randomUUID())
  let state: State = { kind: "waiting" }
  let handler: { open: () => Promise<OpenFrom>; context: SurfaceContext } | undefined
  const opened = waiter()
  /** Receives and snapshots, one after another in the order called. */
  let receiving: Promise<unknown> = Promise.resolve()
  const listeners = new Set<(bytes: Uint8Array) => void>()
  let traffic = blankTraffic()
  let trafficTimer: number | undefined
  let pending: Pending | undefined

  const reportTraffic = () => {
    trafficTimer = undefined

    if (state.kind !== "attached") {
      return
    }

    if (traffic.changesOut + traffic.changesIn > 0) {
      const sorted = traffic.receiveMs.toSorted((a, b) => a - b)
      port.record?.("sync.traffic", {
        changesOut: traffic.changesOut,
        changesIn: traffic.changesIn,
        bytesOut: traffic.bytesOut,
        bytesIn: traffic.bytesIn,
        pendingReceives: traffic.pendingReceives,
        maxPendingMs: Math.round(traffic.maxPendingMs),
        receiveP95Ms: Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0)
      })
      traffic = blankTraffic()
    }

    trafficTimer = timers.set(reportTraffic, minuteMs)
  }

  const document = (api: string) => {
    if (state.kind === "attached") {
      return state
    }

    throw new Error(
      state.kind === "waiting"
        ? `sync.${api} needs the document, which hasn't opened yet`
        : `sync.${api} needs the document shared, and it's open alone here`
    )
  }

  /** The room went away while the document was shared: it stays open here, alone, and this copy writes files. */
  const detach = async () => {
    if (state.kind !== "attached") {
      return
    }

    const { lineage, stopLocal } = state
    stopLocal()
    state = { kind: "detached", lineage }
    stopTimers()
    opened.reject(new Error("The room went away, so the document is open alone here"))

    let saved = true

    try {
      await setWrites(true, "roomGone")
    } catch {
      saved = false
    }

    port.record?.("sync.detached", { why: "stopped", saved })
    port.left?.(saved)
  }

  const stopTimers = () => {
    if (trafficTimer !== undefined) {
      timers.clear(trafficTimer)
      trafficTimer = undefined
    }

    if (pending?.timer !== undefined) {
      timers.clear(pending.timer)
    }

    pending = undefined
  }

  function close() {
    if (state.kind === "attached") {
      state.stopLocal()
    }

    state = { kind: "closed" }
    stopTimers()
    opened.reject(new Error("The project closed"))
  }

  const setWrites = async (writes: boolean, why: "open" | "host" | "roomGone") => {
    const began = now()
    const result = await port.setWritesFiles(writes)
    port.record?.("sync.writesFiles", {
      writes,
      why,
      filesWritten: result.filesWritten,
      stylesheetWritten: result.stylesheetWritten,
      durationMs: Math.round(now() - began)
    })
  }

  /** Applies another copy's change, once the document is open. */
  const apply = async (frame: Uint8Array) => {
    await opened.promise
    const attached = document("receive")
    let change: Change

    try {
      change = unframed(frame)
    } catch (error) {
      port.record?.("sync.receiveFailed", { bytes: frame.length, ...errorOf(error) })
      throw error
    }

    if (change.lineage !== attached.lineage) {
      port.record?.("sync.lineageRefused", { lineage: attached.lineage, theirs: change.lineage })
      throw new LineageError(attached.lineage, change.lineage)
    }

    const began = now()
    let result: { pending: boolean }

    try {
      result = attached.document.receive(change.bytes)
    } catch (error) {
      port.record?.("sync.receiveFailed", { bytes: frame.length, ...errorOf(error) })
      throw error
    }

    traffic.changesIn += 1
    traffic.bytesIn += frame.length
    traffic.receiveMs.push(now() - began)

    if (result.pending) {
      traffic.pendingReceives += 1

      if (pending) {
        pending.bytes += frame.length
      } else {
        const waiting: Pending = { since: now(), bytes: frame.length, warned: false }
        waiting.timer = timers.set(() => {
          waiting.warned = true
          port.record?.("sync.pending", { pendingMs: Math.round(now() - waiting.since), pendingBytes: waiting.bytes })
        }, pendingWarnMs)
        pending = waiting
      }
    } else if (pending) {
      const waited = now() - pending.since

      if (pending.timer !== undefined) {
        timers.clear(pending.timer)
      }

      traffic.maxPendingMs = Math.max(traffic.maxPendingMs, waited)
      port.record?.("sync.caughtUp", {
        role: "asked",
        bytes: frame.length,
        durationMs: Math.round(waited),
        trigger: "pending"
      })
      pending = undefined
    }

    return { pending: result.pending }
  }

  return {
    capability: "sync",
    get handled() {
      return handler !== undefined
    },
    make(context) {
      const sync: Sync = {
        get format() {
          return port.format
        },
        get lineage() {
          return state.kind === "attached" || state.kind === "detached" ? state.lineage : ""
        },
        onOpen(open) {
          if (handler && handler.context !== context) {
            throw new Error("Another extension already says how this project opens")
          }

          const mine = { open, context }
          handler = mine

          const handle = once(() => {
            if (handler !== mine) {
              return
            }

            handler = undefined
            // The extension that brought the room stopped: the document stays, alone.
            void detach()
          })

          context.onEnd(() => handle.dispose())

          return handle
        },
        onLocalChanges(listener) {
          const heard = context.listener("sync.onLocalChanges", listener)
          listeners.add(heard)

          const handle = once(() => listeners.delete(heard))
          context.onEnd(() => handle.dispose())

          return handle
        },
        receive(bytes) {
          const applied = receiving.then(() => apply(bytes))
          receiving = applied.catch(() => undefined)

          return applied
        },
        version: () => document("version").document.version(),
        changesSince(version) {
          const attached = document("changesSince")
          const began = now()
          const bytes = framed(attached.lineage, attached.document.changesSince(version))
          port.record?.("sync.caughtUp", {
            role: "answered",
            bytes: bytes.length,
            durationMs: Math.round(now() - began),
            trigger: "reconnect"
          })

          return bytes
        },
        // After the changes passed in before it, so a joining copy gets them.
        snapshot() {
          const taken = receiving.then(async () => {
            await opened.promise

            return document("snapshot").document.snapshot()
          })

          receiving = taken.catch(() => undefined)

          return taken
        },
        setWritesFiles: (writes) => setWrites(writes, "host"),
        get writesFiles() {
          return port.writesFiles()
        },
        reopen: () => port.reopen()
      }

      return sync
    },
    async open() {
      const asked = handler

      if (!asked) {
        return undefined
      }

      const began = now()
      let timer: number | undefined

      try {
        const from = await Promise.race([
          asked.open(),
          new Promise<never>((_resolve, reject) => {
            timer = timers.set(() => reject(new TimedOut()), openWaitMs)
          })
        ])

        const waitMs = Math.round(now() - began)

        const opening: Opening =
          from.from === "files"
            ? { from: "files", lineage: newLineage() }
            : { from: "snapshot", snapshot: from.snapshot, lineage: from.lineage }

        const recorded: SeamAttributes<"sync.opened"> = {
          extension: asked.context.extension,
          from: opening.from,
          waitMs,
          lineage: opening.lineage,
          format: port.format
        }

        if (opening.from === "snapshot") {
          recorded.snapshotBytes = opening.snapshot.length
        }

        port.record?.("sync.opened", recorded)

        return opening
      } catch (error) {
        const failed: SeamAttributes<"sync.openFailed"> = {
          extension: asked.context.extension,
          reason: "timeout",
          waitMs: Math.round(now() - began)
        }

        if (!(error instanceof TimedOut)) {
          Object.assign(failed, { reason: "rejected" }, errorOf(error))
        }

        port.record?.("sync.openFailed", failed)
        port.record?.("sync.detached", { why: "openFailed", saved: true })
        state = { kind: "detached", lineage: "" }
        opened.reject(new Error("The room couldn't open the project, so it's open alone here"))

        return undefined
      } finally {
        if (timer !== undefined) {
          timers.clear(timer)
        }
      }
    },
    attach(document, lineage) {
      if (state.kind !== "waiting") {
        return
      }

      const stopLocal = document.onLocalChanges((bytes) => {
        const frame = framed(lineage, bytes)
        traffic.changesOut += 1
        traffic.bytesOut += frame.length

        for (const listener of listeners) {
          listener(frame)
        }
      })

      state = { kind: "attached", document, lineage, stopLocal }
      trafficTimer = timers.set(reportTraffic, minuteMs)
      opened.resolve()
    },
    close,
    dispose() {
      close()
      listeners.clear()
      handler = undefined
    }
  }
}

class TimedOut extends Error {}

/** Changes passed in that wait for others: since when, how many bytes, and the timer that warns of them. */
interface Pending {
  since: number
  bytes: number
  timer?: number
  warned: boolean
}

/** What crossed this minute, for `sync.traffic`. */
interface Traffic {
  changesOut: number
  changesIn: number
  bytesOut: number
  bytesIn: number
  pendingReceives: number
  maxPendingMs: number
  /** How long each change passed in took to take in, in milliseconds. */
  receiveMs: number[]
}

function blankTraffic(): Traffic {
  return { changesOut: 0, changesIn: 0, bytesOut: 0, bytesIn: 0, pendingReceives: 0, maxPendingMs: 0, receiveMs: [] }
}

/** A promise settled from outside. */
interface Waiter {
  resolve: () => void
  reject: (error: Error) => void
  promise: Promise<void>
}

/** A promise settled from outside, whose rejection nobody has to catch. */
function waiter(): Waiter {
  let resolve: () => void = () => undefined
  let reject: (error: Error) => void = () => undefined

  const promise = new Promise<void>((resolved, rejected) => {
    resolve = resolved
    reject = rejected
  })

  promise.catch(() => undefined)

  return { resolve, reject, promise }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- JavaScript can throw anything
function errorOf(thrown: unknown): { message: string; stack?: string } {
  const error = thrown instanceof Error ? thrown : new Error(String(thrown))

  return error.stack === undefined ? { message: error.message } : { message: error.message, stack: error.stack }
}

function once(dispose: () => void): Disposable {
  let done = false

  return {
    dispose() {
      if (!done) {
        done = true
        dispose()
      }
    }
  }
}
