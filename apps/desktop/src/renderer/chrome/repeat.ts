import { resetWithWindow } from "../store.ts"
import type { ActionResult } from "./actions.ts"

/** Something Repeat last action can run again, on whatever's selected then. */
export interface Repeatable {
  label: string
  run(): ActionResult
  available?(): boolean
}

let last: Repeatable | undefined

// Nothing done yet, as a new window starts, so each story starts from nothing done.
resetWithWindow(() => {
  last = undefined
})

/**
 * Remembers what was just done, from a shortcut, a menu or Search actions, for Repeat last action (PAR-180). Only what
 * changes the selected layers or designs is remembered; moving around and undoing aren't.
 */
export function rememberAction(action: Repeatable): void {
  last = action
}

/** What Repeat last action would run, if anything's been done since the window opened. */
export function lastAction(): Repeatable | undefined {
  return last
}

/** Runs the last action again, when it applies to what's selected now. */
export function repeatLastAction(): void {
  if (last && last.available?.() !== false) {
    void last.run()
  }
}
