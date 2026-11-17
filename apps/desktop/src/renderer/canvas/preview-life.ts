import type { DocChange } from "@parity-app/multiplayer"
import { track } from "../report-error.ts"
import { type Timers, windowTimers } from "./carried.ts"

/** What a preview moves: a board, layers in a layout, or an absolutely placed layer. */
export type PreviewKind = "board" | "layout" | "absolute"

/** How a preview ended: settled by its write, given up on, called off, or disposed by what made it. */
export type PreviewEnd = "write" | "timeout" | "cancel" | "disposed"

/** How long a preview waits for the write that covers its drop before it goes anyway. */
export const settleWithinMs = 2000

/** The share of previews settled by their write that `dragPreview.settled` records; every other ending is recorded. */
export const settledSample = 0.1

/** What `dragPreview.settled` says. */
export interface PreviewSettled {
  extension: string
  kind: PreviewKind
  items: number
  how: PreviewEnd
  durationMs: number
  /** Previews open at once, this one among them. */
  concurrent: number
}

/** A preview's life, from showing to ending once (see `previewLives`). */
export interface PreviewLife {
  /** Waits for the covering write: `wrote` ends it with `write`, or after `settleWithinMs` it ends with `timeout`. */
  awaitWrite(): void
  /** Whether it's waiting for its write. */
  readonly waiting: boolean
  /** Its write arrived: ends it, if it was waiting. Returns whether it did. */
  wrote(): boolean
  /** Ends it, once: what ended it is told, and `dragPreview.settled` recorded. */
  end(how: PreviewEnd): void
  readonly ended: boolean
}

export interface PreviewLives {
  /** Starts a preview's life; `ended` runs once, however it ends. */
  start(kind: PreviewKind, items: number, extension: string, ended: (how: PreviewEnd) => void): PreviewLife
  /** Previews open now. */
  readonly open: number
}

/**
 * Keeps previews' lives: how many are open, each one's wait for its write, and `dragPreview.settled` as each ends,
 * sampled to one in ten when it ends by its write, since that's how nearly all should end.
 */
export function previewLives({
  timers = windowTimers,
  now = () => performance.now(),
  random = () => Math.random(),
  settled = (ended: PreviewSettled) => track("dragPreview.settled", ended)
}: {
  timers?: Timers
  now?: () => number
  random?: () => number
  settled?: (ended: PreviewSettled) => void
} = {}): PreviewLives {
  let open = 0

  return {
    get open() {
      return open
    },
    start(kind, items, extension, ended) {
      const began = now()
      let timer: number | undefined
      let done = false
      open++

      const life: PreviewLife = {
        awaitWrite() {
          if (done || timer !== undefined) {
            return
          }

          timer = timers.set(() => life.end("timeout"), settleWithinMs)
        },
        get waiting() {
          return !done && timer !== undefined
        },
        wrote() {
          if (!life.waiting) {
            return false
          }

          life.end("write")

          return true
        },
        end(how) {
          if (done) {
            return
          }

          done = true

          if (timer !== undefined) {
            timers.clear(timer)
          }

          const concurrent = open
          open--

          if (how !== "write" || random() < settledSample) {
            settled({ extension, kind, items, how, durationMs: Math.round(now() - began), concurrent })
          }

          ended(how)
        },
        get ended() {
          return done
        }
      }

      return life
    }
  }
}

/**
 * Whether a document change is someone else's write to any of `designs`: what covers a preview of their drag, since the
 * drop it previews arrives as their write.
 */
export function coversDesigns(
  change: Pick<DocChange, "origin" | "designs" | "layers">,
  designs: ReadonlySet<string>
): boolean {
  if (change.origin !== "remote") {
    return false
  }

  const { layers } = change

  return (
    change.designs.changed.some(({ design }) => designs.has(design)) ||
    [...layers.added, ...layers.removed, ...layers.moved].some(({ design }) => designs.has(design)) ||
    layers.changed.some(({ address }) => designs.has(address.design))
  )
}

/** The window's previews' lives. */
export const lives = previewLives()
