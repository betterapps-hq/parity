import "dockview-react/dist/styles/dockview.css"
import "./dock.css"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@buildkitgg/shadcn"
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
import { homeTab, useActiveTabId, useTabs, workspace } from "../../workspace.ts"
import { type Camera, LensCanvas } from "./canvas.tsx"
import { type ChromeActions, LensBar, lensDragType, TitleBar } from "./chrome.tsx"
import { lensOrder, lenses, project, type Ref } from "./data.ts"
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

/** Where each open lens is: in the main window's canvases, or in a window of its own. */
type Where = "grid" | "window"

interface Snapshot {
  active: LensId | undefined
  open: Partial<Record<LensId, Where>>
}

const isLens = (id: string | undefined): id is LensId => lensOrder.some((lens) => lens === id)

function snapshotOf(api: DockviewApi): Snapshot {
  const open: Partial<Record<LensId, Where>> = {}

  for (const panel of api.panels) {
    if (isLens(panel.id)) {
      open[panel.id] = panel.group.api.location.type === "popout" ? "window" : "grid"
    }
  }

  const active = api.activePanel?.id

  return { active: isLens(active) ? active : undefined, open }
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
  const [snapshot, setSnapshot] = useState<Snapshot>({ active: undefined, open: {} })
  const [last, setLast] = useState<LensId>(initial.groups[initial.focused ?? 0]?.[0] ?? "pages")
  const [selected, setSelected] = useState(initial.selected)
  const [cameras, setCameras] = useState<Partial<Record<LensId, Camera>>>({})
  const [panels, setPanelState] = useState({ left: true, right: true })
  const [tabs, setTabs] = useState<Record<string, string>>({})
  const [peek, setPeek] = useState<Ref>()
  const [name, setName] = useState<string | undefined>(project.name)
  // Bumped when a project opens in another's place, so a new Dockview lays it out afresh and closes the old windows.
  const [dock, setDock] = useState(0)
  const active = useActiveTabId()
  const openTabs = useTabs()

  // On Home, a project opened or resumed there opens in the window, in place of Home.
  const reopened = name === undefined && active !== homeTab
  const shown = reopened ? (openTabs.find((tab) => tab.id === active)?.title ?? project.name) : name
  const current = snapshot.active ?? last
  // With every tab closed, no lens is in focus, and the panels that follow one go with it.
  const empty = api !== undefined && Object.keys(snapshot.open).length === 0

  // The lens bar, panels and inspector follow Dockview's layout: which lenses are open, where, and which is in front.
  useEffect(() => {
    if (!api) {
      return
    }

    const update = () => {
      const next = snapshotOf(api)
      setSnapshot(next)

      if (next.active) {
        setLast(next.active)
      }
    }

    update()
    const subscriptions = [api.onDidLayoutChange(update), api.onDidActivePanelChange(update)]

    // A lens's own window, once its group is in, takes the main window's theme and says what it holds.
    subscriptions.push(api.onDidAddPopoutGroup(({ window: opened, group }) => dress(opened, group.activePanel?.title)))

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

    // A tab let go outside the window, where nothing takes it, opens in a window of its own there, as a browser's
    // tab does.
    let dragged: IDockviewPanel | undefined
    subscriptions.push(api.onWillDragPanel((event) => (dragged = event.panel)))

    const end = (event: DragEvent) => {
      const panel = dragged
      dragged = undefined

      if (!panel || event.dataTransfer?.dropEffect !== "none" || !outsideWindow(event)) {
        return
      }

      void popOut(api, panel, { x: event.screenX, y: event.screenY })
    }

    document.addEventListener("dragend", end, true)

    return () => {
      for (const subscription of subscriptions) {
        subscription.dispose()
      }

      document.removeEventListener("dragend", end, true)
    }
  }, [api])

  const onReady = ({ api: ready }: DockviewReadyEvent) => {
    let previous: DockviewGroupPanel | undefined

    for (const ids of initial.groups) {
      for (const [index, lens] of ids.entries()) {
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

    // The first tab of each group in front, and the focused group's in focus.
    for (const ids of initial.groups) {
      ready.getPanel(ids[0]!)?.api.setActive()
    }

    ready.getPanel(initial.groups[initial.focused ?? 0]?.[0] ?? "")?.api.setActive()
    setApi(ready)
  }

  // Ctrl and a number shows that lens, as clicking it in the lens bar does.
  const showRef = useCallback(
    (lens: LensId) => {
      if (api) {
        show(api, lens)
      }
    },
    [api]
  )

  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      const number = Number(event.key)

      if (!(event.ctrlKey || event.metaKey) || !Number.isInteger(number) || number < 1 || number > lensOrder.length) {
        return
      }

      showRef(lensOrder[number - 1]!)
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

    const existing = api.getPanel(lens)

    if (existing && event.group) {
      existing.api.moveTo({ group: event.group, position: event.position })
    } else if (!existing) {
      addLens(
        api,
        lens,
        event.group ? { referenceGroup: event.group, direction: directions[event.position] } : undefined
      )
    }
  }

  const state: LensState = {
    selected,
    select: (lens, id) => setSelected((before) => ({ ...before, [lens]: id })),
    cameras,
    setCamera: (lens, camera) => setCameras((before) => ({ ...before, [lens]: camera })),
    peek
  }

  const actions = lensActions(api, snapshot, empty ? undefined : current, {
    panels,
    togglePanels: () => {
      const open = !(panels.left || panels.right)
      setPanelState({ left: open, right: open })
    },
    toggleLeft: () => setPanelState((before) => ({ ...before, left: !before.left })),
    closeProject: () => {
      workspace.activate(homeTab)
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

  // A link shows its lens where it's open, in any window, else in the tab in focus, as a link does in a browser; beside,
  // in a group to the right.
  const showLink = (ref: Ref, beside: boolean) => {
    setPeek(undefined)
    state.select(ref.lens, ref.id)

    if (!api) {
      return
    }

    const panel = api.getPanel(ref.lens)
    const group = api.activeGroup

    if (!beside || (panel && panel.group !== group)) {
      show(api, ref.lens)
    } else if (panel && group && group.panels.length > 1) {
      panel.api.moveTo({ group, position: "right" })
    } else if (!panel) {
      addLens(api, ref.lens, group ? { referenceGroup: group, direction: "right" } : undefined)
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

/** A drop on a group's side, as the side to add a lens on. */
const directions: Record<Position, "above" | "below" | "left" | "right" | "within"> = {
  top: "above",
  bottom: "below",
  left: "left",
  right: "right",
  center: "within"
}

function addLens(api: DockviewApi, lens: LensId, position?: AddPanelPositionOptions): IDockviewPanel {
  const panel = { id: lens, component: "lens", title: lenses[lens].label, params: { lens } }

  return position ? api.addPanel({ ...panel, position }) : api.addPanel(panel)
}

/** The main window's group in focus, or its first, which the lens bar opens lenses in. */
function mainGroup(api: DockviewApi): DockviewGroupPanel | undefined {
  // A window that came from the grid leaves an empty, hidden group in its place.
  const groups = api.groups.filter((group) => group.api.location.type === "grid" && group.api.isVisible)

  return groups.find((group) => group === api.activeGroup) ?? groups[0]
}

/** Brings an open lens forward, and its window if it has one of its own. */
function reveal(panel: IDockviewPanel): void {
  panel.api.setActive()
  const location = panel.group.api.location

  if (location.type === "popout") {
    location.getWindow().focus()
  }
}

/**
 * Shows a lens where it's open, or else in the tab in focus in the main window, in place of that tab's lens, as a link
 * opens in the tab it's clicked in.
 */
function show(api: DockviewApi, lens: LensId): void {
  const panel = api.getPanel(lens)
  const group = mainGroup(api)
  const before = group?.activePanel

  if (panel) {
    reveal(panel)
  } else if (group && before) {
    addLens(api, lens, {
      referenceGroup: group,
      direction: "within",
      index: group.panels.indexOf(before)
    }).api.setActive()
    before.api.close()
  } else {
    openTab(api, lens)
  }
}

/** Shows a lens where it's open, or else in a new tab in the main window's group in focus. */
function openTab(api: DockviewApi, lens: LensId): void {
  const panel = api.getPanel(lens)
  const group = mainGroup(api)

  if (panel) {
    reveal(panel)
  } else {
    addLens(api, lens, group ? { referenceGroup: group, direction: "within" } : { direction: "right" }).api.setActive()
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

/** Whether a drag ended outside this window, as far as the browser says where it ended. */
function outsideWindow(event: DragEvent): boolean {
  const outsideView =
    event.clientX < 0 || event.clientY < 0 || event.clientX > window.innerWidth || event.clientY > window.innerHeight

  const outsideScreen =
    event.screenX < window.screenX ||
    event.screenY < window.screenY ||
    event.screenX > window.screenX + window.outerWidth ||
    event.screenY > window.screenY + window.outerHeight

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
  const { label, icon: Icon } = lenses[params.lens]

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
          <IconButton label="Move to new window" onClick={() => void popOut(containerApi, activePanel)}>
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

/** What the window's own controls do, on the layout Dockview holds. */
function lensActions(
  api: DockviewApi | undefined,
  snapshot: Snapshot,
  current: LensId | undefined,
  window: Pick<ChromeActions, "panels" | "togglePanels" | "closeProject" | "openProject"> & { toggleLeft: () => void }
): ChromeActions {
  const panelOf = (lens: LensId) => api?.getPanel(lens)

  return {
    project: true,
    current,
    elsewhere: (lens) => {
      const where = snapshot.open[lens]

      if (!where || lens === snapshot.active) {
        return undefined
      }

      return where === "window" ? "window" : "open"
    },
    // The lens in front hides or shows the left panel, as VS Code's activity bar does.
    show: (lens) => {
      if (lens === snapshot.active) {
        window.toggleLeft()
      } else if (api) {
        show(api, lens)
      }
    },
    openTab: (lens) => {
      if (api) {
        openTab(api, lens)
      }
    },
    canOpenTab: (lens) => !!api && !snapshot.open[lens],
    splitRight: (lens) => {
      const group = api?.activeGroup
      const panel = panelOf(lens)

      if (!api) {
        return
      }

      if (panel && group) {
        panel.api.moveTo({ group, position: "right" })
      } else if (!panel) {
        addLens(api, lens, group ? { referenceGroup: group, direction: "right" } : undefined)
      }
    },
    canSplit: (lens) => {
      const panel = panelOf(lens)
      const group = api?.activeGroup

      return !!api && !(panel && panel.group === group && group.panels.length === 1)
    },
    toWindow: (lens) => {
      if (api) {
        void popOut(api, panelOf(lens) ?? addLens(api, lens))
      }
    },
    canMoveToWindow: (lens) => {
      const panel = panelOf(lens)

      return (
        !!api &&
        !lenses[lens].missing &&
        !(panel?.group.api.location.type === "popout" && panel.group.panels.length === 1)
      )
    },
    toMain: (lens) => {
      const panel = panelOf(lens)
      const grid = api?.groups.find((each) => each.api.location.type === "grid")

      if (!panel) {
        return
      }

      if (grid) {
        panel.api.moveTo({ group: grid, position: "center" })
      } else {
        panel.group.api.moveTo({ position: "right" })
      }
    },
    canMoveToMain: (lens) => snapshot.open[lens] === "window",
    close: (lens) => panelOf(lens)?.api.close(),
    canClose: (lens) => !!snapshot.open[lens],
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
    elsewhere: () => undefined,
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
