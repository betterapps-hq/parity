import type {
  Arrangement,
  Bounds,
  DockOperation,
  Layout,
  Parted,
  Point,
  SavedLayout,
  Side,
  Split,
  Target
} from "@parity-app/lenses"
import {
  type AddPanelPositionOptions,
  type DockviewApi,
  type DockviewDidDropEvent,
  type IDockviewPanel,
  Orientation,
  type Position,
  type SerializedDockview,
  type SerializedGridObject
} from "dockview-react"
import { lensWindowUrl } from "../../shared/lens-window.ts"
import { outsideWindow } from "./popout.ts"

/** What a lens dragged from the lens bar carries, so a group's tabs take it as a new tab and a canvas's side splits. */
export const lensDragType = "application/x-parity-lens"

/** The size a lens's own window opens at. */
const windowSize = { width: 1100, height: 720 }

/** A side as Dockview names where a moved panel goes. */
const positions: Record<Side, Position> = { left: "left", right: "right", above: "top", below: "bottom" }

/** Where on a group a lens was dropped, as the side of it to split; its middle is none. */
const sides: Partial<Record<Position, Side>> = { top: "above", bottom: "below", left: "left", right: "right" }

/** What Dockview tells the shell. */
export interface DockEvents<Id extends string> {
  /** The layout changed: a tab opened, closed, moved or came to the front, or another group took focus. */
  change: (layout: Layout<Id>) => void
  /** A tab was let go outside its window, where nothing took it, at a point on the screen. */
  letGo: (lens: Id, at: Point) => void
  /** A lens's own window opened with a group in, the group's id given. */
  opened: (window: Window, group: string) => void
  /** The lens window holding a group closed, its group back in the main window or gone. */
  closed: (group: string) => void
}

/**
 * Dockview, as the shell uses it: its layout as `@parity-app/lenses` reads it, and the package's dock operations made
 * on it. It's the one place that calls Dockview.
 */
export interface Dock<Id extends string> {
  layout: () => Layout<Id>
  apply: (operations: readonly DockOperation<Id>[]) => void
  /** How the main window's groups are split, and where each lens's own window is, to save with the layout. */
  arrangement: () => Arrangement
  /**
   * Lays out a saved layout: the main window's groups split as they were, and each window opened where it was. Without
   * a page for lens windows, the windows' groups join the main window at the right.
   */
  lay: (saved: SavedLayout<Id>) => void
  /** The lens dropped from the lens bar, and where: a group's tabs or one of its sides, or nowhere named. */
  dropped: (event: DockviewDidDropEvent) => { lens: Id; to: Target | undefined } | undefined
  /** Tells what changes until the returned function is called. */
  watch: (events: DockEvents<Id>) => () => void
}

/**
 * Where each lens window is, by the lens its page was named for, as the desktop app places them. Without it, a lens
 * window's place is read from the window itself, which can be a few pixels off what opening it there asks for.
 */
export type WindowPlaces = () => Record<string, Bounds>

export function dockAdapter<Id extends string>(
  api: DockviewApi,
  isLens: (id: string | undefined) => id is Id,
  popoutUrl: string | undefined,
  places?: WindowPlaces
): Dock<Id> {
  const add = (lens: Id, position?: AddPanelPositionOptions): IDockviewPanel => {
    const panel = { id: lens, component: "lens", title: lens, params: { lens } }

    return position ? api.addPanel({ ...panel, position }) : api.addPanel(panel)
  }

  // The main window's groups, then the windows'. A window that came from the grid leaves an empty, hidden group in its
  // place, which isn't one.
  const layout = (): Layout<Id> => {
    const groups = api.groups
      .filter((group) => group.api.isVisible)
      .map((group) => {
        const open = group.activePanel?.id
        const tabs = group.panels.map((panel) => panel.id).filter(isLens)
        const where = group.api.location.type === "popout" ? ("window" as const) : ("main" as const)

        return isLens(open) ? { id: group.id, where, tabs, open } : { id: group.id, where, tabs }
      })
      .toSorted((a, b) => Number(a.where === "window") - Number(b.where === "window"))

    const focus = api.activeGroup?.id

    return focus === undefined ? { groups } : { groups, focus }
  }

  // Opens a lens, or a group of them, in a window of its own: where a tab was let go, or beside the main window. The
  // page is named for the lens, so the desktop app can put the window back where it was, unless it was let go somewhere.
  const popOut = (panel: IDockviewPanel, at?: Point) => {
    const position = at
      ? { left: Math.round(at.x - 120), top: Math.round(at.y - 18), ...windowSize }
      : { left: window.screenX + 80, top: window.screenY + 80, ...windowSize }

    return api.addPopoutGroup(
      panel,
      popoutUrl === undefined
        ? { position }
        : { position, popoutUrl: lensWindowUrl(popoutUrl, { lens: panel.id, placed: !!at }) }
    )
  }

  // Moves an open lens's tab. With no group named, its group joins the main window at the right.
  const move = (panel: IDockviewPanel, to: Target) => {
    if ("edge" in to) {
      panel.group.api.moveTo({ position: "right" })

      return
    }

    const group = api.groups.find((each) => each.id === to.group)

    if (!group) {
      return
    }

    if ("side" in to) {
      panel.api.moveTo({ group, position: positions[to.side] })
    } else {
      panel.api.moveTo(
        to.index === undefined ? { group, position: "center" } : { group, position: "center", index: to.index }
      )
    }
  }

  const apply = (operations: readonly DockOperation<Id>[]) => {
    for (const operation of operations) {
      const panel = api.getPanel(operation.lens)

      if (operation.kind === "add") {
        add(operation.lens, positionOf(operation.to)).api.setActive()
      } else if (!panel) {
        continue
      } else if (operation.kind === "move") {
        move(panel, operation.to)
      } else if (operation.kind === "reveal") {
        reveal(panel)
      } else if (operation.kind === "window") {
        void popOut(panel, operation.at)
      } else {
        panel.api.close()
      }
    }
  }

  // The main window's split, from the root down, and each window's place on the screen, by group.
  const arrangement = (): Arrangement => {
    const { root, orientation } = api.toJSON().grid
    const windows: Record<string, Bounds> = {}
    const placed = places?.() ?? {}

    for (const group of api.groups) {
      const location = group.api.location

      if (location.type === "popout") {
        const shown = location.getWindow()
        const lens = new URL(shown.location.href).searchParams.get("lens") ?? ""
        windows[group.id] = placed[lens] ?? {
          x: shown.screenX,
          y: shown.screenY,
          width: shown.innerWidth,
          height: shown.innerHeight
        }
      }
    }

    return { splits: splitOf(root, orientation === Orientation.HORIZONTAL ? "row" : "column"), windows }
  }

  const lay = (saved: SavedLayout<Id>) => {
    // Without a page for lens windows, the windows' groups join the main window at the right.
    const inMain = (where: "main" | "window") => where === "main" || popoutUrl === undefined
    const main = saved.groups.flatMap((group, place) => (inMain(group.where) ? [place] : []))
    const windows = saved.groups.flatMap((group, place) => (inMain(group.where) ? [] : [place]))

    if (saved.groups.length === 0) {
      return
    }

    const idOf = (place: number) => `lens-group-${place}`

    const stateOf = (place: number): GroupPanelViewState => {
      const { tabs, open } = saved.groups[place]!

      return open === undefined ? { id: idOf(place), views: tabs } : { id: idOf(place), views: tabs, activeView: open }
    }

    // The saved splits hold the main window's groups; windows' groups that stay in it go on the right.
    const extra = main
      .filter((place) => saved.groups[place]!.where === "window" || !saved.splits)
      .map((place): Split => ({ group: place }))

    // A row's parts can't be rows, so the right of a row is its own parts' right.
    const kept = saved.splits && "across" in saved.splits && saved.splits.across === "row" ? saved.splits.parts : []
    const parts = saved.splits && kept.length === 0 ? [saved.splits, ...extra] : [...kept, ...extra]
    // Dockview's root is always a split, so a group on its own is a split of one.
    const only = parts.length === 1 ? parts[0]! : undefined
    const root: Parted = only && "across" in only ? only : { across: "row", parts }
    const room = { width: api.width || 1200, height: api.height || 800 }

    const panels = Object.fromEntries(
      saved.groups.flatMap(({ tabs }) =>
        tabs.map((lens) => [lens, { id: lens, contentComponent: "lens", title: lens, params: { lens } }])
      )
    )

    const focus = saved.focus ?? 0

    // Dockview opens each window itself, a moment after: where it was saved, or beside the main window.
    const popoutGroups = windows.map((place) => {
      const { open, tabs, bounds } = saved.groups[place]!

      const position = bounds
        ? { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height }
        : { left: window.screenX + 80, top: window.screenY + 80, ...windowSize }

      const page = { lens: open ?? tabs[0]!, placed: false }

      return {
        data: stateOf(place),
        position,
        url: lensWindowUrl(popoutUrl!, bounds ? { ...page, place: bounds } : page)
      }
    })

    const serialized: SerializedDockview = {
      grid: {
        root: main.length > 0 ? gridOf(root, room, stateOf) : { type: "branch", data: [] },
        ...room,
        orientation: root.across === "row" ? Orientation.HORIZONTAL : Orientation.VERTICAL
      },
      panels,
      popoutGroups
    }

    if (main.includes(focus)) {
      serialized.activeGroup = idOf(focus)
    }

    api.fromJSON(serialized)
  }

  const dropped = (event: DockviewDidDropEvent) => {
    const native = event.nativeEvent
    // A drag over a lens's own window is that window's event, not an instance of this one's DragEvent, so it's told
    // apart by having data.
    const lens = "dataTransfer" in native ? native.dataTransfer?.getData(lensDragType) : undefined

    if (!isLens(lens)) {
      return undefined
    }

    const side = event.group && sides[event.position]
    let to: Target | undefined

    if (event.group) {
      to = side ? { group: event.group.id, side } : { group: event.group.id }
    }

    return { lens, to }
  }

  const watch = (events: DockEvents<Id>) => {
    const update = () => events.change(layout())

    update()
    const subscriptions = [api.onDidLayoutChange(update), api.onDidActivePanelChange(update)]

    // A lens drawn from the lens bar drops where a tab would, in any window.
    subscriptions.push(
      api.onUnhandledDragOver((event) => {
        const native = event.nativeEvent

        if ("dataTransfer" in native && native.dataTransfer?.types.includes(lensDragType)) {
          event.accept()
        }
      })
    )

    // A tab let go outside its window, where nothing takes it, is told of. A drag from a lens's own window ends in that
    // window's document, so each window's is listened to.
    let dragged: IDockviewPanel | undefined
    subscriptions.push(api.onWillDragPanel((event) => (dragged = event.panel)))

    const end = (event: DragEvent) => {
      const panel = dragged
      dragged = undefined

      if (panel && isLens(panel.id) && event.dataTransfer?.dropEffect === "none" && outsideWindow(event)) {
        events.letGo(panel.id, { x: event.screenX, y: event.screenY })
      }
    }

    // Each window's document, by the group in it; the main window's has none.
    const documents = new Map<string | undefined, Document>([[undefined, document]])
    document.addEventListener("dragend", end, true)

    subscriptions.push(
      api.onDidAddPopoutGroup(({ window: opened, group }) => {
        events.opened(opened, group.id)
        documents.set(group.id, opened.document)
        opened.document.addEventListener("dragend", end, true)
      }),
      // The window has gone by now.
      api.onDidRemovePopoutGroup(({ group }) => {
        documents.get(group.id)?.removeEventListener("dragend", end, true)
        documents.delete(group.id)
        events.closed(group.id)
      })
    )

    return () => {
      for (const subscription of subscriptions) {
        subscription.dispose()
      }

      for (const each of documents.values()) {
        each.removeEventListener("dragend", end, true)
      }
    }
  }

  return { layout, apply, arrangement, lay, dropped, watch }
}

/** A group as Dockview's saved grid holds it: its id, its tabs' panels and the one in front. */
interface GroupPanelViewState {
  id: string
  views: string[]
  activeView?: string
}

type GridNode = SerializedGridObject<GroupPanelViewState>

/** Dockview's split as the package keeps it: a part laid `across` its parent, each group by its id. */
function splitOf(node: GridNode, across: "row" | "column"): Split<string> {
  const sized = <S extends Split<string>>(split: S): S =>
    node.size === undefined ? split : { ...split, size: node.size }

  if (!Array.isArray(node.data)) {
    return sized({ group: node.data.id })
  }

  // A split's parts are laid the other way to it, and the empty group a window leaves in its place isn't one.
  const inner = across === "row" ? "column" : "row"
  const parts = node.data.filter((part) => part.visible !== false).map((part) => splitOf(part, inner))

  return sized({ across, parts })
}

/**
 * The package's split as Dockview's, in a room of this size: each part sized along the split to its share of the
 * room, as it shared the room it was saved in, and spanning the room the other way.
 */
function gridOf(
  split: Split,
  room: { width: number; height: number },
  leaf: (place: number) => GroupPanelViewState
): GridNode {
  if ("group" in split) {
    return { type: "leaf", data: leaf(split.group) }
  }

  const along = split.across === "row" ? "width" : "height"
  const sizes = split.parts.map((part) => part.size)
  const shares = sizes.every((size) => size !== undefined) ? sizes : sizes.map(() => 1)
  const total = shares.reduce((sum, share) => sum + share, 0)

  return {
    type: "branch",
    data: split.parts.map((part, index) => {
      const size = Math.round((shares[index]! / total) * room[along])

      return { ...gridOf(part, { ...room, [along]: size }, leaf), size }
    })
  }
}

/** Where Dockview adds a panel for a target. */
function positionOf(to: Target): AddPanelPositionOptions {
  if ("edge" in to) {
    return { direction: "right" }
  }

  if ("side" in to) {
    return { referenceGroup: to.group, direction: to.side }
  }

  return to.index === undefined
    ? { referenceGroup: to.group, direction: "within" }
    : { referenceGroup: to.group, direction: "within", index: to.index }
}

/** Brings an open lens forward, and its window if it has one of its own. */
function reveal(panel: IDockviewPanel): void {
  panel.api.setActive()
  const location = panel.group.api.location

  if (location.type === "popout") {
    location.getWindow().focus()
  }
}
