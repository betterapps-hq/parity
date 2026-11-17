import { holdLimitMs } from "@parity-app/extension/internal"
import { track } from "../report-error.ts"
import { type Timers, windowTimers } from "./carried.ts"
import { type Placement, placedBoards, type PlacedBoards, type Point } from "./placed-boards.ts"

/** However long a hold lasts, it's let go after this, so a board an agent's write never came for doesn't stay put. */
export { holdLimitMs }

/** How a hold ended: let go, after `holdLimitMs`, by the person grabbing the board, or with what made it. */
export type HoldEnd = "released" | "timeout" | "grabbed" | "disposed"

/** A board held where it is while an agent moves it (see `BoardHolds`). */
export interface Held extends Disposable {
  /** Moves the held board. */
  update(at: Point): void
  /** Lets go: the board shows where the document says, unless another hold still has it. Disposing does the same. */
  release(): void
}

/** What `hold.released` says. */
export interface HoldReleased {
  extension: string
  how: HoldEnd
  heldMs: number
}

export interface BoardHolds {
  /**
   * Holds a board where it is, before the write that moves it is applied, so it never flashes in its new place. A board
   * already held stays where it's drawn, and is let go once every hold on it is. `extension` is what holds it, for
   * telemetry.
   */
  hold(tab: string, design: string, at: Point, extension?: string): Held
  /** Whether a board is held. */
  held(tab: string, design: string): boolean
  /** The person grabbed a board: every hold on it is let go, and their drag wins. Returns whether it was held. */
  grab(tab: string, design: string): boolean
}

interface Board {
  /** Where it's drawn, which every hold on it moves. */
  placement: Placement
  ends: Set<(how: HoldEnd) => void>
}

/**
 * Holds boards for agents' moves (the proposal's `canvas.hold`): an agent's write arrives before its cursor can drag
 * the board there, so the board is held where it was and drawn along the drag instead. Held boards are placed boards
 * (`PlacedBoards`), so the canvas draws them where they're held and doesn't write their shapes to the document.
 */
export function boardHolds({
  places = placedBoards,
  timers = windowTimers,
  now = () => performance.now(),
  released = (ended: HoldReleased) => track("hold.released", ended)
}: {
  places?: PlacedBoards
  timers?: Timers
  now?: () => number
  released?: (ended: HoldReleased) => void
} = {}): BoardHolds {
  const boards = new Map<string, Board>()

  return {
    hold(tab, design, at, extension = "core") {
      const key = id(tab, design)
      const board = boards.get(key) ?? { placement: places.place(tab, design, at), ends: new Set() }
      boards.set(key, board)
      const began = now()
      let timer = 0

      const end = (how: HoldEnd) => {
        if (!board.ends.delete(end)) {
          return
        }

        timers.clear(timer)

        if (board.ends.size === 0) {
          board.placement.remove()
          boards.delete(key)
        }

        released({ extension, how, heldMs: Math.round(now() - began) })
      }

      board.ends.add(end)
      timer = timers.set(() => end("timeout"), holdLimitMs)

      return {
        update(next) {
          if (board.ends.has(end)) {
            board.placement.move(next)
          }
        },
        release: () => end("released"),
        [Symbol.dispose]: () => end("disposed")
      }
    },
    held: (tab, design) => boards.has(id(tab, design)),
    grab(tab, design) {
      const board = boards.get(id(tab, design))

      if (!board) {
        return false
      }

      for (const end of Array.from(board.ends)) {
        end("grabbed")
      }

      return true
    }
  }
}

function id(tab: string, design: string): string {
  return `${tab}\n${design}`
}

/** The window's holds, which agent presence makes and every tab's canvas reads. */
export const holds = boardHolds()
