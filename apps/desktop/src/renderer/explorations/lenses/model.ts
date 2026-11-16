/** A lens: one layer of the app, with its own canvas, left panel and selection. */
export type LensId = "pages" | "components" | "stories" | "data"

/** A row of lens tabs and the canvas of the one shown, as an editor group is in VS Code. */
export interface LensGroup {
  id: string
  lenses: LensId[]
  shown: LensId
}

/** A window of the project: the main one, or one a lens was moved into. */
export interface LensWindow {
  id: string
  groups: LensGroup[]
  /** The group the left panel and the inspector follow. */
  focused: string
}

export interface Layout {
  windows: LensWindow[]
  /** What's selected in each lens, which stays when another lens is shown. */
  selected: Partial<Record<LensId, string>>
}

let counter = 0
const nextId = (prefix: string) => `${prefix}-${++counter}`

export function group(lenses: LensId[], shown: LensId = lenses[0]!): LensGroup {
  return { id: nextId("group"), lenses, shown }
}

export function lensWindow(groups: LensGroup[]): LensWindow {
  return { id: nextId("window"), groups, focused: groups[0]!.id }
}

function withoutLens(layout: Layout, lens: LensId): LensWindow[] {
  return layout.windows
    .map((each) => {
      const groups = each.groups
        .map((one) => {
          const lenses = one.lenses.filter((other) => other !== lens)

          return { ...one, lenses, shown: one.shown === lens ? (lenses[0] ?? one.shown) : one.shown }
        })
        .filter((one) => one.lenses.length > 0)

      return { ...each, groups, focused: groups.some((one) => one.id === each.focused) ? each.focused : groups[0]?.id }
    })
    .filter((each): each is LensWindow => each.groups.length > 0 && each.focused !== undefined)
}

/** Where a lens is: its window and group. */
export function find(layout: Layout, lens: LensId): { window: LensWindow; group: LensGroup } | undefined {
  for (const each of layout.windows) {
    const found = each.groups.find((one) => one.lenses.includes(lens))

    if (found) {
      return { window: each, group: found }
    }
  }

  return undefined
}

export function show(layout: Layout, lens: LensId): Layout {
  return {
    ...layout,
    windows: layout.windows.map((each) => ({
      ...each,
      groups: each.groups.map((one) => (one.lenses.includes(lens) ? { ...one, shown: lens } : one)),
      focused: each.groups.find((one) => one.lenses.includes(lens))?.id ?? each.focused
    }))
  }
}

/** Opens a lens in a group, at a place in its tabs, or moves it there if it's open elsewhere. */
export function place(layout: Layout, lens: LensId, groupId: string, index?: number): Layout {
  // Taking the lens out first would close its group if it's the only tab there, leaving nowhere to put it back.
  if (find(layout, lens)?.group.id === groupId) {
    return reorder(layout, lens, groupId, index)
  }

  const windows = withoutLens(layout, lens).map((each) => ({
    ...each,
    groups: each.groups.map((one) => {
      if (one.id !== groupId) {
        return one
      }

      const lenses = [...one.lenses]
      lenses.splice(index ?? lenses.length, 0, lens)

      return { ...one, lenses, shown: lens }
    })
  }))

  return { ...layout, windows: windows.map((each) => focusOn(each, groupId)) }
}

/** Moves a lens to another place in the group it's already in. */
function reorder(layout: Layout, lens: LensId, groupId: string, index?: number): Layout {
  const windows = layout.windows.map((each) => ({
    ...each,
    groups: each.groups.map((one) => {
      if (one.id !== groupId) {
        return one
      }

      const lenses = one.lenses.filter((other) => other !== lens)
      lenses.splice(index ?? lenses.length, 0, lens)

      return { ...one, lenses, shown: lens }
    })
  }))

  return { ...layout, windows: windows.map((each) => focusOn(each, groupId)) }
}

function focusOn(each: LensWindow, groupId: string): LensWindow {
  return each.groups.some((one) => one.id === groupId) ? { ...each, focused: groupId } : each
}

/** Moves a lens into a new group to the right of the one it's in. */
export function splitRight(layout: Layout, lens: LensId, beside?: string): Layout {
  const from = find(layout, lens)
  const besideId = beside ?? from?.group.id

  // A lens alone in its group, split beside that group, would leave the group empty: there's nothing to split.
  if (from && from.group.lenses.length === 1 && besideId === from.group.id) {
    return layout
  }

  const fresh = group([lens])
  const windows = withoutLens(layout, lens)
  const target = windows.find((each) => each.groups.some((one) => one.id === besideId)) ?? windows[0]

  return {
    ...layout,
    windows: windows.map((each) => {
      if (each !== target) {
        return each
      }

      const at = each.groups.findIndex((one) => one.id === besideId)
      const groups = [...each.groups]
      groups.splice(at === -1 ? groups.length : at + 1, 0, fresh)

      return { ...each, groups, focused: fresh.id }
    })
  }
}

/** Moves a lens into a window of its own. */
export function toNewWindow(layout: Layout, lens: LensId): Layout {
  return { ...layout, windows: [...withoutLens(layout, lens), lensWindow([group([lens])])] }
}

/** Moves a lens back into the main window's last group. */
export function toMainWindow(layout: Layout, lens: LensId): Layout {
  const main = layout.windows[0]!
  const last = main.groups.at(-1)!

  return place(layout, lens, last.id)
}

export function close(layout: Layout, lens: LensId): Layout {
  const windows = withoutLens(layout, lens)

  return windows.length === 0 ? layout : { ...layout, windows }
}

export function select(layout: Layout, lens: LensId, id: string): Layout {
  return { ...layout, selected: { ...layout.selected, [lens]: id } }
}
