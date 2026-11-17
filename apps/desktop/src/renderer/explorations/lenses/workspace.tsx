import "dockview-react/dist/styles/dockview.css"
import "./dock.css"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@buildkitgg/shadcn"
import {
  close as closeLens,
  type DockOperation,
  drop,
  followLink,
  inFocus,
  isEmpty,
  type Layout,
  lensForShortcut,
  markOf,
  menuOf,
  openTab,
  readLayout,
  show,
  splitRight,
  type Target,
  toMain,
  toWindow
} from "@parity-app/lenses"
import {
  type AddPanelPositionOptions,
  type DockviewApi,
  type DockviewDidDropEvent,
  type DockviewGroupPanel,
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewHeaderActionsProps,
  type IDockviewPanel,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type Position
} from "dockview-react"
import { SquareArrowOutDownLeft, SquareArrowOutUpRight, X } from "lucide-react"
import { createContext, use, useCallback, useEffect, useState } from "react"
import { IconButton } from "../../chrome/IconButton.tsx"
import { StatusBar } from "../../chrome/StatusBar.tsx"
import { HomePage } from "../../start/HomePage.tsx"
import { useProject, workspace } from "../../workspace.ts"
import { type Camera, LensCanvas } from "./canvas.tsx"
import { type ChromeActions, LensBar, lensDragType, TitleBar } from "./chrome.tsx"
import { lensList, lensOrder, lenses, project, type Ref } from "./data.ts"
import { LensInspector } from "./inspector.tsx"
import type { LensId } from "./model.ts"
import { LensPanel } from "./panel.tsx"

/** What a story opens the project on: its groups of lens tabs, left to right, the first tab of each in front. */
export interface LensLayout {
  groups: LensId[][]
  /** The group in focus, which the left panel and the inspector follow. */
  focused?: number
  /** What's selected in each lens, which stays when another lens is shown. */
  selected: Partial<Record<LensId, string>>
}

/** The page a lens's own window opens on, before Dockview moves the lens into it. Storybook serves it. */
const popoutUrl = "/lens-popout/popout.html"

/** The size a lens's own window opens at. */
const windowSize = { width: 1100, height: 720 }

const theme: DockviewTheme = { name: "parity", className: "dockview-theme-parity" }

const isLens = (id: string | undefined): id is LensId => lensOrder.some((lens) => lens === id)

/**
 * Dockview's layout as `@parity-app/lenses` reads it: the main window's groups, then the windows'. A window that came
 * from the grid leaves an empty, hidden group in its place, which isn't one.
 */
function layoutOf(api: DockviewApi): Layout<LensId> {
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

/** Makes the package's dock operations on Dockview, in order. */
function apply(api: DockviewApi, operations: DockOperation<LensId>[]): void {
  for (const operation of operations) {
    const panel = api.getPanel(operation.lens)

    if (operation.kind === "add") {
      addLens(api, operation.lens, positionOf(operation.to)).api.setActive()
    } else if (!panel) {
      continue
    } else if (operation.kind === "move") {
      moveTo(api, panel, operation.to)
    } else if (operation.kind === "reveal") {
      reveal(panel)
    } else if (operation.kind === "window") {
      void popOut(api, panel, operation.at)
    } else {
      panel.api.close()
    }
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

/** A side as Dockview names where a moved panel goes. */
const positions: Record<"left" | "right" | "above" | "below", Position> = {
  left: "left",
  right: "right",
  above: "top",
  below: "bottom"
}

/** Moves an open lens's tab to a target. With no group named, its group joins the main window at the right. */
function moveTo(api: DockviewApi, panel: IDockviewPanel, to: Target): void {
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

/** Where a lens dropped on a group goes: a tab in it, or a new group on that side. */
function dropTarget(group: string, position: Position): Target {
  const sides: Partial<Record<Position, "left" | "right" | "above" | "below">> = {
    top: "above",
    bottom: "below",
    left: "left",
    right: "right"
  }

  const side = sides[position]

  return side ? { group, side } : { group }
}

/** What every lens's canvas reads, wherever its tab is: selections, views and the link being pointed at. */
interface LensState {
  selected: Partial<Record<LensId, string>>
  select: (lens: LensId, id: string | undefined) => void
  cameras: Partial<Record<LensId, Camera>>
  setCamera: (lens: LensId, camera: Camera) => void
  peek: Ref | undefined
}

const LensContext = createContext<LensState | undefined>(undefined)

/**
 * The prototype on Dockview: one project per window, its lenses down the left, and each open lens a tab over its canvas.
 * The lens bar works as links do in a browser: a click shows the lens in the tab in focus, and Ctrl+click, a middle
 * click or a drag onto the tabs opens it in a new tab. Tabs drag to split, to another group, or off the window into one
 * of their own, which is a real window; the button at the end of each group's tabs pops its tab out, and in that window
 * takes it back. The left panel and the inspector follow the tab in focus, in any window; with every tab closed, the
 * window is empty.
 */
export function LensesPrototype({ initial }: { initial: LensLayout }) {
  const [api, setApi] = useState<DockviewApi>()
  const [layout, setLayout] = useState<Layout<LensId>>({ groups: [] })
  const [last, setLast] = useState<LensId>(initial.groups[initial.focused ?? 0]?.[0] ?? "pages")
  const [selected, setSelected] = useState(initial.selected)
  const [cameras, setCameras] = useState<Partial<Record<LensId, Camera>>>({})
  const [panels, setPanelState] = useState({ left: true, right: true })
  const [tabs, setTabs] = useState<Record<string, string>>({})
  const [peek, setPeek] = useState<Ref>()
  const [name, setName] = useState<string | undefined>(project.name)
  // Bumped when a project opens in another's place, so a new Dockview lays it out afresh and closes the old windows.
  const [dock, setDock] = useState(0)
  const opened = useProject()

  // On Home, a project opened or resumed there opens in the window, in place of Home.
  const shown = name === undefined && opened ? opened.title : name
  // With every tab closed, no lens is in focus, and the panels that follow one go with it.
  const empty = api !== undefined && isEmpty(layout)
  const current = inFocus(layout) ?? last

  // The lens bar, panels and inspector follow Dockview's layout: which lenses are open, where, and which is in front.
  useEffect(() => {
    if (!api) {
      return
    }

    const update = () => {
      const next = layoutOf(api)
      const focused = inFocus(next)
      setLayout(next)

      if (focused) {
        setLast(focused)
      }
    }

    update()
    const subscriptions = [api.onDidLayoutChange(update), api.onDidActivePanelChange(update)]

    // A lens drawn from the lens bar drops where a tab would, in any window. A drag over a lens's own window is that
    // window's event, not an instance of this one's DragEvent, so it's told apart by having data.
    subscriptions.push(
      api.onUnhandledDragOver((event) => {
        const native = event.nativeEvent

        if ("dataTransfer" in native && native.dataTransfer?.types.includes(lensDragType)) {
          event.accept()
        }
      })
    )

    // A tab let go outside its window, where nothing takes it, opens in a window of its own there, as a browser's
    // tab does. A drag from a lens's own window ends in that window's document, so each window's is listened to.
    let dragged: IDockviewPanel | undefined
    subscriptions.push(api.onWillDragPanel((event) => (dragged = event.panel)))

    const end = (event: DragEvent) => {
      const panel = dragged
      dragged = undefined

      if (!panel || event.dataTransfer?.dropEffect !== "none" || !outsideWindow(event)) {
        return
      }

      if (isLens(panel.id)) {
        apply(api, toWindow(layoutOf(api), panel.id, { x: event.screenX, y: event.screenY }))
      }
    }

    const documents = new Set([document])
    document.addEventListener("dragend", end, true)

    // A lens's own window, once its group is in, takes the main window's theme, says what it holds and tears tabs off.
    subscriptions.push(
      api.onDidAddPopoutGroup(({ window: opened, group }) => {
        dress(opened, group.activePanel?.title)
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
  }, [api])

  const onReady = ({ api: ready }: DockviewReadyEvent) => {
    // The story's layout, read as a project's saved one is, so lenses that are gone drop out.
    const groups = initial.groups.map((tabs) => ({ where: "main", tabs }))
    const saved = readLayout(initial.focused === undefined ? { groups } : { groups, focus: initial.focused }, lensList)
    let previous: DockviewGroupPanel | undefined

    for (const { tabs } of saved.groups) {
      for (const [index, lens] of tabs.entries()) {
        let position: AddPanelPositionOptions | undefined

        if (index > 0 && previous) {
          position = { referenceGroup: previous, direction: "within" }
        } else if (previous) {
          position = { referenceGroup: previous, direction: "right" }
        }

        const panel = addLens(ready, lens, position)

        if (index === 0) {
          previous = panel.group
        }
      }
    }

    // Each group's front tab in front, and the focused group's in focus.
    for (const { open } of saved.groups) {
      ready.getPanel(open ?? "")?.api.setActive()
    }

    ready.getPanel(saved.groups[saved.focus ?? 0]?.open ?? "")?.api.setActive()
    setApi(ready)
  }

  // Ctrl and a number shows that lens, as clicking it in the lens bar does.
  const showRef = useCallback(
    (lens: LensId) => {
      if (api) {
        apply(api, show(layoutOf(api), lens))
      }
    },
    [api]
  )

  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      const lens = event.ctrlKey || event.metaKey ? lensForShortcut(lensList, `Ctrl+${event.key}`) : undefined

      if (!lens) {
        return
      }

      showRef(lens.id)
      event.preventDefault()
    }

    window.addEventListener("keydown", keydown)

    return () => window.removeEventListener("keydown", keydown)
  }, [showRef])

  const onDidDrop = (event: DockviewDidDropEvent) => {
    const native = event.nativeEvent
    const lens = "dataTransfer" in native ? native.dataTransfer?.getData(lensDragType) : undefined

    if (!api || !isLens(lens)) {
      return
    }

    apply(api, drop(layoutOf(api), lens, event.group && dropTarget(event.group.id, event.position)))
  }

  const state: LensState = {
    selected,
    select: (lens, id) => setSelected((before) => ({ ...before, [lens]: id })),
    cameras,
    setCamera: (lens, camera) => setCameras((before) => ({ ...before, [lens]: camera })),
    peek
  }

  const actions = lensActions(api, layout, empty ? undefined : current, {
    panels,
    togglePanels: () => {
      const open = !(panels.left || panels.right)
      setPanelState({ left: open, right: open })
    },
    toggleLeft: () => setPanelState((before) => ({ ...before, left: !before.left })),
    closeProject: () => {
      void workspace.close()
      setName(undefined)
    },
    openProject: (next) => {
      setName(next)
      setSelected(initial.selected)
      setCameras({})
      setApi(undefined)
      setDock((before) => before + 1)
    }
  })

  if (shown === undefined) {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TitleBar actions={homeActions(actions.openProject)} />
        <HomePage active />
      </div>
    )
  }

  // A link shows its lens where it's open, in any window, else in the tab in focus, as a link does in a browser, in a
  // lens's own window too, since the inspector follows that; beside, in a group to the right.
  const showLink = (ref: Ref, beside: boolean) => {
    setPeek(undefined)
    state.select(ref.lens, ref.id)

    if (api) {
      apply(api, followLink(layoutOf(api), ref.lens, beside))
    }
  }

  return (
    <LensContext value={state}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <TitleBar name={shown} actions={actions} />
        <div className="flex min-h-0 flex-1">
          <LensBar actions={actions} />
          {panels.left && !empty && (
            <LensPanel
              key={current}
              lens={current}
              tab={tabs[`left:${current}`] ?? "outline"}
              onTab={(tab) => setTabs((before) => ({ ...before, [`left:${current}`]: tab }))}
              onHide={() => setPanelState((before) => ({ ...before, left: false }))}
              selected={selected[current]}
              onSelect={(id) => state.select(current, id)}
            />
          )}
          <div className="relative min-w-0 flex-1">
            <DockviewReact
              key={dock}
              className="absolute inset-0"
              theme={theme}
              components={components}
              defaultTabComponent={LensTab}
              rightHeaderActionsComponent={GroupActions}
              watermarkComponent={NoLens}
              popoutUrl={popoutUrl}
              disableFloatingGroups
              onReady={onReady}
              onDidDrop={onDidDrop}
            />
          </div>
          {panels.right && !empty && (
            <LensInspector
              lens={current}
              selected={selected[current]}
              tab={tabs[`right:${current}`] ?? "design"}
              onTab={(tab) => setTabs((before) => ({ ...before, [`right:${current}`]: tab }))}
              onHide={() => setPanelState((before) => ({ ...before, right: false }))}
              onShow={(ref) => showLink(ref, false)}
              onShowBeside={(ref) => showLink(ref, true)}
              onPeek={setPeek}
            />
          )}
        </div>
        <StatusBar />
      </div>
    </LensContext>
  )
}

function addLens(api: DockviewApi, lens: LensId, position?: AddPanelPositionOptions): IDockviewPanel {
  const panel = { id: lens, component: "lens", title: lenses[lens].name, params: { lens } }

  return position ? api.addPanel({ ...panel, position }) : api.addPanel(panel)
}

/** Brings an open lens forward, and its window if it has one of its own. */
function reveal(panel: IDockviewPanel): void {
  panel.api.setActive()
  const location = panel.group.api.location

  if (location.type === "popout") {
    location.getWindow().focus()
  }
}

/** Opens a lens, or a group of them, in a window of its own: where a tab was let go, or beside the main window. */
function popOut(api: DockviewApi, item: IDockviewPanel | DockviewGroupPanel, at?: { x: number; y: number }) {
  const position = at
    ? { left: Math.round(at.x - 120), top: Math.round(at.y - 18), ...windowSize }
    : { left: window.screenX + 80, top: window.screenY + 80, ...windowSize }

  return api.addPopoutGroup(item, { position, popoutUrl })
}

/** A lens's own window takes the main window's theme, which Storybook sets on its root, and is named for its lens. */
function dress(opened: Window, lens: string | undefined) {
  const root = document.documentElement
  const theirs = opened.document.documentElement
  theirs.className = root.className

  for (const attribute of root.getAttributeNames().filter((each) => each.startsWith("data-"))) {
    theirs.setAttribute(attribute, root.getAttribute(attribute) ?? "")
  }

  theirs.style.colorScheme = root.style.colorScheme
  opened.document.title = lens ? `${lens} — ${project.name}` : project.name
}

/** Whether a drag ended outside the window it came from, as far as the browser says where it ended. */
function outsideWindow(event: DragEvent): boolean {
  // The window the drag came from, the main one or a lens's own.
  const from = event.view ?? window

  const outsideView =
    event.clientX < 0 || event.clientY < 0 || event.clientX > from.innerWidth || event.clientY > from.innerHeight

  const outsideScreen =
    event.screenX < from.screenX ||
    event.screenY < from.screenY ||
    event.screenX > from.screenX + from.outerWidth ||
    event.screenY > from.screenY + from.outerHeight

  return outsideView || outsideScreen
}

/** A lens's canvas, as a tab's content. */
function LensContent({ params }: IDockviewPanelProps<{ lens: LensId }>) {
  const state = use(LensContext)!
  const { lens } = params

  return (
    <div className="flex size-full flex-col">
      <LensCanvas
        lens={lens}
        selected={state.selected[lens]}
        peek={state.peek?.lens === lens ? state.peek.id : undefined}
        onSelect={(id) => state.select(lens, id)}
        camera={state.cameras[lens]}
        onCamera={(camera) => state.setCamera(lens, camera)}
      />
    </div>
  )
}

const components = { lens: LensContent }

/** A lens's tab: its icon and name, the handle that drags it, and a close button. */
function LensTab({ api, params }: IDockviewPanelHeaderProps<{ lens: LensId }>) {
  const { name: label, Icon } = lenses[params.lens]

  return (
    // A middle click closes the tab, as it does a browser's.
    <div
      className="group/tab flex h-full min-w-0 items-center gap-2 pr-1.5 pl-3"
      onAuxClick={(event) => event.button === 1 && api.close()}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button
        type="button"
        aria-label={`Close ${label}`}
        className="grid size-5 shrink-0 place-items-center rounded opacity-0 group-hover/tab:opacity-100 hover:bg-accent focus-visible:opacity-100 [.dv-active-tab_&]:opacity-100"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          api.close()
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

/** At the end of each group's tabs: its tab out into a window of its own, or, in that window, back into the main one. */
function GroupActions({ group, containerApi, activePanel }: IDockviewHeaderActionsProps) {
  const popped = group.api.location.type === "popout"

  return (
    <div className="flex h-full items-center pr-2">
      {popped ? (
        <IconButton label="Move to main window" onClick={() => group.api.moveTo({ position: "right" })}>
          <SquareArrowOutDownLeft />
        </IconButton>
      ) : (
        activePanel && (
          <IconButton
            label="Move to new window"
            onClick={() =>
              isLens(activePanel.id) && apply(containerApi, toWindow(layoutOf(containerApi), activePanel.id))
            }
          >
            <SquareArrowOutUpRight />
          </IconButton>
        )
      )}
    </div>
  )
}

function NoLens() {
  return (
    <div className="grid size-full place-items-center bg-[rgb(249,250,251)] dark:bg-[rgb(16,16,17)]">
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No lens open</EmptyTitle>
          <EmptyDescription>Choose one on the left, or press Ctrl and its number.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

/** What the window's own controls do: the package's decisions made on Dockview, and its marks and menus. */
function lensActions(
  api: DockviewApi | undefined,
  layout: Layout<LensId>,
  current: LensId | undefined,
  window: Pick<ChromeActions, "panels" | "togglePanels" | "closeProject" | "openProject"> & { toggleLeft: () => void }
): ChromeActions {
  // Decided on Dockview's layout as it is now, which a drag may have changed since the window last drew.
  const run = (decide: (now: Layout<LensId>) => DockOperation<LensId>[]) => {
    if (api) {
      apply(api, decide(layoutOf(api)))
    }
  }

  // Nothing can be done before Dockview is ready.
  const menu = (lens: LensId) => (api ? menuOf(layout, lenses[lens]) : undefined)

  return {
    project: true,
    current,
    mark: (lens) => markOf(layout, lenses[lens]),
    // The lens in front hides or shows the left panel, as VS Code's activity bar does.
    show: (lens) => (lens === inFocus(layout) ? window.toggleLeft() : run((now) => show(now, lens))),
    openTab: (lens) => run((now) => openTab(now, lens)),
    canOpenTab: (lens) => !!menu(lens)?.openInNewTab,
    splitRight: (lens) => run((now) => splitRight(now, lens)),
    canSplit: (lens) => !!menu(lens)?.splitRight,
    toWindow: (lens) => run((now) => toWindow(now, lens)),
    canMoveToWindow: (lens) => !!menu(lens)?.moveToNewWindow,
    toMain: (lens) => run((now) => toMain(now, lens)),
    canMoveToMain: (lens) => !!menu(lens)?.moveToMainWindow,
    close: (lens) => run((now) => closeLens(now, lens)),
    canClose: (lens) => !!menu(lens)?.close,
    panels: window.panels,
    togglePanels: window.togglePanels,
    closeProject: window.closeProject,
    openProject: window.openProject
  }
}

/** What the title bar does on Home, with no project open: its menus open one; there's no lens to show. */
function homeActions(openProject: (name: string) => void): ChromeActions {
  const never = () => false

  return {
    project: false,
    current: undefined,
    mark: () => ({ focus: false, unavailable: false }),
    show: () => undefined,
    openTab: () => undefined,
    canOpenTab: never,
    splitRight: () => undefined,
    canSplit: never,
    toWindow: () => undefined,
    canMoveToWindow: never,
    toMain: () => undefined,
    canMoveToMain: never,
    close: () => undefined,
    canClose: never,
    panels: { left: false, right: false },
    togglePanels: () => undefined,
    closeProject: () => undefined,
    openProject
  }
}
