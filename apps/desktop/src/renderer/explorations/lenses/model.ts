/** A lens: one layer of the app, with its own canvas, left panel and selection. */
export type LensId = "pages" | "screens" | "components" | "stories" | "data" | "api"

/** A canvas showing one lens. A window can show several side by side. */
export interface LensGroup {
  id: string
  lens: LensId
}

/** A window of the project: the main one, or one a lens was moved into. */
export interface LensWindow {
  id: string
  groups: LensGroup[]
  /** The group the lens bar, the left panel and the inspector follow. */
  focused: string
}

export interface Layout {
  windows: LensWindow[]
  /** What's selected in each lens, which stays when another lens is shown. */
  selected: Partial<Record<LensId, string>>
}

let counter = 0
const nextId = (prefix: string) => `${prefix}-${++counter}`

export function group(lens: LensId): LensGroup {
  return { id: nextId("group"), lens }
}

export function lensWindow(groups: LensGroup[], focused = 0): LensWindow {
  return { id: nextId("window"), groups, focused: groups[focused]!.id }
}

/** Where a lens is shown: its window and group. Each lens shows in one place at most. */
export function find(layout: Layout, lens: LensId): { window: LensWindow; group: LensGroup } | undefined {
  for (const each of layout.windows) {
    const found = each.groups.find((one) => one.lens === lens)

    if (found) {
      return { window: each, group: found }
    }
  }

  return undefined
}

function focusedGroup(each: LensWindow): LensGroup {
  return each.groups.find((one) => one.id === each.focused) ?? each.groups[0]!
}

/** Takes a lens out of the group showing it. A group left empty closes, as does a window; the main window stays. */
function without(layout: Layout, lens: LensId, except?: string): LensWindow[] {
  return layout.windows
    .map((each, index) => {
      const groups = each.groups.filter((one) => one.lens !== lens || one.id === except)

      if (groups.length === 0 && index === 0) {
        return each
      }

      return { ...each, groups, focused: groups.some((one) => one.id === each.focused) ? each.focused : groups[0]?.id }
    })
    .filter((each): each is LensWindow => each.groups.length > 0 && each.focused !== undefined)
}

/** Whether a lens is the main window's only one, which can't leave it: the main window always keeps a lens. */
function anchorsMain(layout: Layout, lens: LensId): boolean {
  const main = layout.windows[0]!

  return main.groups.length === 1 && main.groups[0]!.lens === lens
}

/** Shows a lens in a group, in place of the lens it showed. If the lens showed elsewhere, that group closes. */
export function showIn(layout: Layout, lens: LensId, groupId: string): Layout {
  const there = find(layout, lens)

  if (there?.group.id === groupId) {
    return focus(layout, groupId)
  }

  if (anchorsMain(layout, lens)) {
    return layout
  }

  // Shown in a group of its own somewhere else, move it rather than show it twice; the group it leaves closes.
  const windows = without(layout, lens, groupId).map((each) => ({
    ...each,
    groups: each.groups.map((one) => (one.id === groupId ? { ...one, lens } : one))
  }))

  return focus({ ...layout, windows }, groupId)
}

/** What the lens bar does: shows the lens where it already is, else in the window's group in focus. */
export function showLens(layout: Layout, windowId: string, lens: LensId): Layout {
  const there = find(layout, lens)

  if (there?.window.id === windowId) {
    return focus(layout, there.group.id)
  }

  const win = layout.windows.find((each) => each.id === windowId)!

  return showIn(layout, lens, focusedGroup(win).id)
}

export function focus(layout: Layout, groupId: string): Layout {
  return {
    ...layout,
    windows: layout.windows.map((each) =>
      each.groups.some((one) => one.id === groupId) ? { ...each, focused: groupId } : each
    )
  }
}

/** Shows a lens in a new group to the right of a window's group in focus, or of the group given. */
export function splitRight(layout: Layout, lens: LensId, windowId: string, beside?: string): Layout {
  const win = layout.windows.find((each) => each.id === windowId)!
  const besideId = beside ?? focusedGroup(win).id
  const there = find(layout, lens)

  // The only group in a window, split beside itself, would leave nothing on the left: there's nothing to split.
  if (there?.group.id === besideId && win.groups.length === 1) {
    return layout
  }

  // Moving the main window's only lens elsewhere would leave it empty, so it stays.
  if (windowId !== layout.windows[0]!.id && anchorsMain(layout, lens)) {
    return layout
  }

  const fresh = group(lens)

  const windows = without(layout, lens).map((each) => {
    if (each.id !== windowId) {
      return each
    }

    const groups = [...each.groups]
    const at = groups.findIndex((one) => one.id === besideId)
    groups.splice(at === -1 ? groups.length : at + 1, 0, fresh)

    return { ...each, groups, focused: fresh.id }
  })

  return { ...layout, windows }
}

/**
 * Moves a lens into a window of its own. The main window always keeps a lens: moving its only one out leaves the lens
 * given instead in its place, and without one the lens stays.
 */
export function toNewWindow(layout: Layout, lens: LensId, instead?: LensId): Layout {
  if (!anchorsMain(layout, lens)) {
    return { ...layout, windows: [...without(layout, lens), lensWindow([group(lens)])] }
  }

  if (!instead || instead === lens) {
    return layout
  }

  const [main, ...others] = without(layout, instead)
  const kept = { ...main!, groups: [{ ...main!.groups[0]!, lens: instead }] }

  return { ...layout, windows: [kept, ...others, lensWindow([group(lens)])] }
}

/** Moves a lens from its own window back into the main window, to the right of its group in focus. */
export function toMainWindow(layout: Layout, lens: LensId): Layout {
  return splitRight(layout, lens, layout.windows[0]!.id)
}

/** Closes a group. The main window's last group stays. */
export function closeGroup(layout: Layout, groupId: string): Layout {
  const lens = layout.windows.flatMap((each) => each.groups).find((one) => one.id === groupId)?.lens

  return lens ? { ...layout, windows: without(layout, lens) } : layout
}

export function select(layout: Layout, lens: LensId, id: string | undefined): Layout {
  return { ...layout, selected: { ...layout.selected, [lens]: id } }
}
