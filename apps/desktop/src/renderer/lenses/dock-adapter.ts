import type { DockOperation, Layout, Point, SavedLayout, Side, Target } from "@parity-app/lenses"
import type {
  AddPanelPositionOptions,
  DockviewApi,
  DockviewDidDropEvent,
  DockviewGroupPanel,
  IDockviewPanel,
  Position
} from "dockview-react"
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
  /** A lens's own window opened with its group in, and the lens in front of it. */
  opened: (window: Window, lens: Id | undefined) => void
}

/**
 * Dockview, as the shell uses it: its layout as `@parity-app/lenses` reads it, and the package's dock operations made
 * on it. It's the one place that calls Dockview.
 */
export interface Dock<Id extends string> {
  layout: () => Layout<Id>
  apply: (operations: readonly DockOperation<Id>[]) => void
  /** Lays out a saved layout, its windows in the main window, since a window opens only from a click. */
  lay: (saved: SavedLayout<Id>) => void
  /** The lens dropped from the lens bar, and where: a group's tabs or one of its sides, or nowhere named. */
  dropped: (event: DockviewDidDropEvent) => { lens: Id; to: Target | undefined } | undefined
  /** Tells what changes until the returned function is called. */
  watch: (events: DockEvents<Id>) => () => void
}

export function dockAdapter<Id extends string>(
  api: DockviewApi,
  isLens: (id: string | undefined) => id is Id,
  popoutUrl: string | undefined
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

  // Opens a lens, or a group of them, in a window of its own: where a tab was let go, or beside the main window.
  const popOut = (panel: IDockviewPanel, at?: Point) => {
    const position = at
      ? { left: Math.round(at.x - 120), top: Math.round(at.y - 18), ...windowSize }
      : { left: window.screenX + 80, top: window.screenY + 80, ...windowSize }

    return api.addPopoutGroup(panel, popoutUrl === undefined ? { position } : { position, popoutUrl })
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

  const lay = (saved: SavedLayout<Id>) => {
    let previous: DockviewGroupPanel | undefined

    for (const { tabs } of saved.groups) {
      for (const [index, lens] of tabs.entries()) {
        let position: AddPanelPositionOptions | undefined

        if (index > 0 && previous) {
          position = { referenceGroup: previous, direction: "within" }
        } else if (previous) {
          position = { referenceGroup: previous, direction: "right" }
        }

        const panel = add(lens, position)

        if (index === 0) {
          previous = panel.group
        }
      }
    }

    // Each group's front tab in front, and the focused group's in focus.
    for (const { open } of saved.groups) {
      api.getPanel(open ?? "")?.api.setActive()
    }

    api.getPanel(saved.groups[saved.focus ?? 0]?.open ?? "")?.api.setActive()
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

    const documents = new Set([document])
    document.addEventListener("dragend", end, true)

    subscriptions.push(
      api.onDidAddPopoutGroup(({ window: opened, group }) => {
        const front = group.activePanel?.id
        events.opened(opened, isLens(front) ? front : undefined)
        documents.add(opened.document)
        opened.document.addEventListener("dragend", end, true)
      })
    )

    return () => {
      for (const subscription of subscriptions) {
        subscription.dispose()
      }

      for (const each of documents) {
        each.removeEventListener("dragend", end, true)
      }
    }
  }

  return { layout, apply, lay, dropped, watch }
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
