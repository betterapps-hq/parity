import { canSplit } from "./decide.ts"
import { focusedGroup, groupOf, type Layout } from "./layout.ts"
import type { Lens } from "./lens.ts"

/** The lens in the group in focus's front tab, which the left panel and the inspector show. None with every tab closed. */
export function inFocus<Id extends string>(layout: Layout<Id>): Id | undefined {
  return focusedGroup(layout)?.open
}

/** Whether every tab is closed, which leaves the window empty until a lens is shown. */
export function isEmpty<Id extends string>(layout: Layout<Id>): boolean {
  return layout.groups.every((group) => group.tabs.length === 0)
}

/** How the lens bar marks a lens. */
export interface LensMark {
  /** It's the lens in focus. */
  focus: boolean
  /** It's open somewhere else: in a tab of the main window that isn't in focus, or in a window of its own. */
  elsewhere?: "tab" | "window"
  /** The project has nothing for it. */
  unavailable: boolean
}

export function markOf<Id extends string>(layout: Layout<Id>, lens: Lens<Id>): LensMark {
  const focus = inFocus(layout) === lens.id
  const where = groupOf(layout, lens.id)?.where
  const mark: LensMark = { focus, unavailable: !!lens.unavailable }

  if (!focus && where) {
    mark.elsewhere = where === "window" ? "window" : "tab"
  }

  return mark
}

/** Which of a lens's menu items do something now, as its menu in the lens bar and the View menu offer them. */
export interface LensMenu {
  openInNewTab: boolean
  splitRight: boolean
  moveToNewWindow: boolean
  moveToMainWindow: boolean
  close: boolean
}

export function menuOf<Id extends string>(layout: Layout<Id>, lens: Lens<Id>): LensMenu {
  const group = groupOf(layout, lens.id)
  const aloneInWindow = group?.where === "window" && group.tabs.length === 1

  return {
    // It's open once: opening it again shows it where it is.
    openInNewTab: !group,
    splitRight: canSplit(layout, lens.id),
    // A lens the project has nothing for stays in the main window, and one alone in its window is there already.
    moveToNewWindow: !lens.unavailable && !aloneInWindow,
    moveToMainWindow: group?.where === "window",
    close: !!group
  }
}
