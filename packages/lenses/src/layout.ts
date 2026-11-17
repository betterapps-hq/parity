/** Where a group of tabs is: in the main window, or in a window of its own. */
export type Where = "main" | "window"

/** A group of lens tabs over one canvas. */
export interface Group<Id extends string = string> {
  /** The dock's id for it, which operations name it by. */
  id: string
  where: Where
  /** Its tabs' lenses, in order. */
  tabs: Id[]
  /** The lens whose tab is in front. */
  open?: Id
}

/** How the lenses are laid out: each group of tabs, and which has focus. A lens is open in one tab at most. */
export interface Layout<Id extends string = string> {
  /** The main window's groups, then the windows' groups. */
  groups: Group<Id>[]
  /** The group in focus, which the left panel and the inspector follow, in any window. */
  focus?: string
}

/** The group a lens's tab is in, if it's open. */
export function groupOf<Id extends string>(layout: Layout<Id>, lens: Id): Group<Id> | undefined {
  return layout.groups.find((group) => group.tabs.includes(lens))
}

/** Where a lens is open, if it is. */
export function whereIs<Id extends string>(layout: Layout<Id>, lens: Id): Where | undefined {
  return groupOf(layout, lens)?.where
}

/** The group in focus, or with none named, the first that has tabs. */
export function focusedGroup<Id extends string>(layout: Layout<Id>): Group<Id> | undefined {
  return (
    layout.groups.find((group) => group.id === layout.focus) ?? layout.groups.find((group) => group.tabs.length > 0)
  )
}

/**
 * The main window's group that the lens bar opens lenses in: the one in focus when it's in the main window, else the
 * main window's first. The lens bar is in the main window, so a lens's own window isn't one.
 */
export function mainGroup<Id extends string>(layout: Layout<Id>): Group<Id> | undefined {
  const main = layout.groups.filter((group) => group.where === "main")

  return main.find((group) => group.id === layout.focus) ?? main[0]
}
