import { focusedGroup, type Group, groupOf, type Layout, mainGroup } from "./layout.ts"

/** A side of a group, where a new group goes beside it. */
export type Side = "left" | "right" | "above" | "below"

/** Where a tab goes: into a group, at an index or last; into a new group beside one; or the main window's right edge. */
export type Target = { group: string; index?: number } | { group: string; side: Side } | { edge: "right" }

/** A point on the screen, where a tab was let go. */
export interface Point {
  x: number
  y: number
}

/** A change to the dock, which its adapter makes, in order. */
export type DockOperation<Id extends string = string> =
  /** A tab for a lens that isn't open, put in front and in focus. */
  | { kind: "add"; lens: Id; to: Target }
  /** An open lens's tab, somewhere else. */
  | { kind: "move"; lens: Id; to: Target }
  /** An open lens's tab brought in front and in focus, with its window if it has one of its own. */
  | { kind: "reveal"; lens: Id }
  /** An open lens's tab moved to a window of its own, opened where it was let go, or beside the main window. */
  | { kind: "window"; lens: Id; at?: Point }
  | { kind: "close"; lens: Id }

/** Into a group, else at the main window's right edge. */
function into<Id extends string>(group: Group<Id> | undefined): Target {
  return group ? { group: group.id } : { edge: "right" }
}

/** Beside a group on its right, else at the main window's right edge. */
function besideRight<Id extends string>(group: Group<Id> | undefined): Target {
  return group ? { group: group.id, side: "right" } : { edge: "right" }
}

/** Shows a lens where it's open, else in place of `group`'s tab in front, else in a new tab in it. */
function showIn<Id extends string>(layout: Layout<Id>, lens: Id, group: Group<Id> | undefined): DockOperation<Id>[] {
  if (groupOf(layout, lens)) {
    return [{ kind: "reveal", lens }]
  }

  const before = group?.open

  if (group && before !== undefined) {
    return [
      { kind: "add", lens, to: { group: group.id, index: group.tabs.indexOf(before) } },
      { kind: "close", lens: before }
    ]
  }

  return [{ kind: "add", lens, to: into(group) }]
}

/**
 * Shows a lens as a link opens: where it's open, in any window, else in the main window's tab in focus, in place of
 * that tab's lens. With no tab there, it opens in a new one.
 */
export function show<Id extends string>(layout: Layout<Id>, lens: Id): DockOperation<Id>[] {
  return showIn(layout, lens, mainGroup(layout))
}

/** Shows a lens where it's open, else in a new tab in the main window's group in focus, as Ctrl+click opens a link. */
export function openTab<Id extends string>(layout: Layout<Id>, lens: Id): DockOperation<Id>[] {
  return groupOf(layout, lens) ? [{ kind: "reveal", lens }] : [{ kind: "add", lens, to: into(mainGroup(layout)) }]
}

/** Puts a lens in a new group to the right of the group in focus, moving its tab there if it's open. */
export function splitRight<Id extends string>(layout: Layout<Id>, lens: Id): DockOperation<Id>[] {
  const group = focusedGroup(layout)
  const open = groupOf(layout, lens)

  if (!open) {
    return [{ kind: "add", lens, to: besideRight(group) }]
  }

  return group && canSplit(layout, lens) ? [{ kind: "move", lens, to: { group: group.id, side: "right" } }] : []
}

/** Whether splitting a lens right would change anything: not when it's alone in the group in focus. */
export function canSplit<Id extends string>(layout: Layout<Id>, lens: Id): boolean {
  const open = groupOf(layout, lens)

  return !(open && open === focusedGroup(layout) && open.tabs.length === 1)
}

/** Moves a lens to a window of its own, opening it first in the main window if it isn't open; `at` is where it opens. */
export function toWindow<Id extends string>(layout: Layout<Id>, lens: Id, at?: Point): DockOperation<Id>[] {
  const move: DockOperation<Id> = at ? { kind: "window", lens, at } : { kind: "window", lens }

  return groupOf(layout, lens) ? [move] : [{ kind: "add", lens, to: into(mainGroup(layout)) }, move]
}

/** Moves a lens in a window of its own back into the main window's group, or a new group there with none. */
export function toMain<Id extends string>(layout: Layout<Id>, lens: Id): DockOperation<Id>[] {
  const open = groupOf(layout, lens)

  return open?.where === "window" ? [{ kind: "move", lens, to: into(mainGroup(layout)) }] : []
}

export function close<Id extends string>(layout: Layout<Id>, lens: Id): DockOperation<Id>[] {
  return groupOf(layout, lens) ? [{ kind: "close", lens }] : []
}

/**
 * Follows a link to a lens from the panels, which follow the group in focus: where the lens is open, else in that
 * group's tab in front, as a link does. `beside` puts it in a new group to the right instead, unless it's open in
 * another group, where it's shown.
 */
export function followLink<Id extends string>(layout: Layout<Id>, lens: Id, beside: boolean): DockOperation<Id>[] {
  const group = focusedGroup(layout)
  const open = groupOf(layout, lens)

  if (!beside || (open && open !== group)) {
    return showIn(layout, lens, group)
  }

  if (!open) {
    return [{ kind: "add", lens, to: besideRight(group) }]
  }

  return group && group.tabs.length > 1 ? [{ kind: "move", lens, to: { group: group.id, side: "right" } }] : []
}

/** A lens dragged from the lens bar and dropped on a group's tabs or a canvas's side, or on an empty window. */
export function drop<Id extends string>(layout: Layout<Id>, lens: Id, to: Target | undefined): DockOperation<Id>[] {
  if (!groupOf(layout, lens)) {
    return [{ kind: "add", lens, to: to ?? into(mainGroup(layout)) }]
  }

  return to ? [{ kind: "move", lens, to }] : []
}
