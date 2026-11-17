import { signal } from "../store.ts"

export interface Point {
  x: number
  y: number
}

/** Where a board is drawn instead of where the document puts it, until it's taken away (see `PlacedBoards`). */
export interface Placement {
  /** Draws the board somewhere else. */
  move(at: Point): void
  /** Takes the placement away: the board is drawn where the next placement puts it, or where the document says. */
  remove(): void
}

interface Placed {
  at: Point
}

/**
 * Boards drawn somewhere other than where the document puts them, without writing anything: held while an agent moves
 * them (`board-holds.ts`), or moved by someone else's drag (`drag-preview.ts`). The canvas draws a board where its latest
 * placement says, and never writes a placed board's shape back to the document.
 */
export class PlacedBoards {
  private readonly placed = new Map<string, Placed[]>()
  private readonly changes = signal()

  subscribe = this.changes.subscribe

  /** Where the canvas should draw a board instead of its stored position, while it's placed. */
  at(tab: string, design: string): Point | undefined {
    return this.placed.get(id(tab, design))?.at(-1)?.at
  }

  /** Draws a board at `at` until the placement is taken away. The newest placement of a board wins. */
  place(tab: string, design: string, at: Point): Placement {
    const key = id(tab, design)
    const placed: Placed = { at }
    this.placed.set(key, [...(this.placed.get(key) ?? []), placed])
    this.changes.notify()
    let removed = false

    return {
      move: (next) => {
        if (removed || (next.x === placed.at.x && next.y === placed.at.y)) {
          return
        }

        placed.at = next
        this.changes.notify()
      },
      remove: () => {
        if (removed) {
          return
        }

        removed = true
        const left = (this.placed.get(key) ?? []).filter((other) => other !== placed)

        if (left.length > 0) {
          this.placed.set(key, left)
        } else {
          this.placed.delete(key)
        }

        this.changes.notify()
      }
    }
  }
}

function id(tab: string, design: string): string {
  return `${tab}\n${design}`
}

/** The window's placed boards, which every tab's canvas reads. */
export const placedBoards = new PlacedBoards()
