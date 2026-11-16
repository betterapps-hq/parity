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

/** What a story opens the project on: its canvases, left to right, each showing one lens. */
export interface LensLayout {
  canvases: LensId[]
  /** The canvas in focus, which the left panel and the inspector follow. */
  focused?: number
  /** What's selected in each lens, which stays when another lens is shown. */
  selected: Partial<Record<LensId, string>>
}

/** The page a lens's own window opens on, before Dockview moves the lens into it. Storybook serves it. */
const popoutUrl = "/lens-popout/popout.html"

/** The size a lens's own window opens at. */
const windowSize = { width: 1100, height: 720 }

const theme: DockviewTheme = { name: "parity", className: "dockview-theme-parity" }

/** Where a shown lens is: in one of the main window's canvases, or in a window of its own. */
type Where = "canvas" | "window"

interface Snapshot {
  active: LensId | undefined
  open: Partial<Record<LensId, Where>>
  /** How many canvases the main window has, so the last one can't be closed. */
  canvases: number
}

const isLens = (id: string | undefined): id is LensId => lensOrder.some((lens) => lens === id)

/** The main window's canvases. Dockview keeps an empty, hidden group in their place for a window that came from there. */
const canvasesOf = (api: DockviewApi) =>
  api.groups.filter((group) => group.api.location.type === "grid" && group.panels.length > 0)

function snapshotOf(api: DockviewApi): Snapshot {
  const open: Partial<Record<LensId, Where>> = {}

  for (const panel of api.panels) {
    if (isLens(panel.id)) {
      open[panel.id] = panel.group.api.location.type === "popout" ? "window" : "canvas"
    }
  }

  const active = api.activePanel?.id

  return { active: isLens(active) ? active : undefined, open, canvases: canvasesOf(api).length }
}

/** What every lens's canvas reads, in any window: selections, views, the link being pointed at, and the canvases. */
interface LensState {
  selected: Partial<Record<LensId, string>>
  select: (lens: LensId, id: string | undefined) => void
  cameras: Partial<Record<LensId, Camera>>
  setCamera: (lens: LensId, camera: Camera) => void
  peek: Ref | undefined
  canvases: number
}

const LensContext = createContext<LensState | undefined>(undefined)

/**
 * The prototype on Dockview: one project per window, its lenses down the left, and the lens bar picks what the canvas in
 * focus shows, as VS Code's activity bar picks its side bar's view. Each canvas shows one lens under a title, which drags
 * it beside another canvas or off the window into one of its own, a real window; the button at the title's end does the
 * same, and in that window takes it back. The left panel and the inspector follow the canvas in focus, in any window.
 */
export function LensesPrototype({ initial }: { initial: LensLayout }) {
  const [api, setApi] = useState<DockviewApi>()
  const [snapshot, setSnapshot] = useState<Snapshot>({ active: undefined, open: {}, canvases: 0 })
  const [last, setLast] = useState<LensId>(initial.canvases[initial.focused ?? 0] ?? "pages")
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

    // A lens drawn from the lens bar drops on a canvas: on its side to split, in its middle to show it there.
    subscriptions.push(
      api.onUnhandledDragOver((event) => {
        if (event.nativeEvent instanceof DragEvent && event.nativeEvent.dataTransfer?.types.includes(lensDragType)) {
          event.accept()
        }
      })
    )

    // A canvas shows one lens, so a canvas dragged by its title drops on another's side, never in with its lens.
    subscriptions.push(
      api.onWillShowOverlay((event) => {
        if (event.getData() && (event.kind === "tab" || event.kind === "header_space" || event.position === "center")) {
          event.preventDefault()
        }
      })
    )

    // A canvas let go outside the window, where nothing takes it, opens in a window of its own there, as a browser's
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

    for (const lens of initial.canvases) {
      previous = addLens(ready, lens, previous && { referenceGroup: previous, direction: "right" }).group
    }

    ready.getPanel(initial.canvases[initial.focused ?? 0] ?? "")?.api.setActive()
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
    const lens = native instanceof DragEvent ? native.dataTransfer?.getData(lensDragType) : undefined

    if (!api || !isLens(lens)) {
      return
    }

    const existing = api.getPanel(lens)

    if (event.group && event.position === "center") {
      showIn(api, event.group, lens)
    } else if (existing && event.group) {
      existing.api.moveTo({ group: event.group, position: event.position })
    } else if (!existing) {
      addLens(
        api,
        lens,
        event.group ? { referenceGroup: event.group, direction: directions[event.position] } : undefined
      ).api.setActive()
    }
  }

  const state: LensState = {
    selected,
    select: (lens, id) => setSelected((before) => ({ ...before, [lens]: id })),
    cameras,
    setCamera: (lens, camera) => setCameras((before) => ({ ...before, [lens]: camera })),
    peek,
    canvases: snapshot.canvases
  }

  const actions = lensActions(api, snapshot, current, {
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

  // A link shows its lens where it's shown, in any window, else in the canvas in focus; beside, in a canvas to its
  // right.
  const showLink = (ref: Ref, beside: boolean) => {
    setPeek(undefined)
    state.select(ref.lens, ref.id)

    if (!api) {
      return
    }

    if (!beside || api.getPanel(ref.lens)) {
      show(api, ref.lens)
    } else {
      addBeside(api, ref.lens)
    }
  }

  return (
    <LensContext value={state}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <TitleBar name={shown} actions={actions} />
        <div className="flex min-h-0 flex-1">
          <LensBar actions={actions} />
          {panels.left && (
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
              defaultTabComponent={LensTitle}
              rightHeaderActionsComponent={CanvasActions}
              singleTabMode="fullwidth"
              watermarkComponent={NoLens}
              popoutUrl={popoutUrl}
              disableFloatingGroups
              onReady={onReady}
              onDidDrop={onDidDrop}
            />
          </div>
          {panels.right && (
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

/** The main window's canvas in focus, or its first, where the lens bar shows a lens. */
function mainCanvas(api: DockviewApi): DockviewGroupPanel | undefined {
  const canvases = canvasesOf(api)

  return canvases.find((group) => group === api.activeGroup) ?? canvases[0]
}

/**
 * Shows a lens where it's shown, bringing its window forward, or else in the main window's canvas in focus, in place of
 * that canvas's lens.
 */
function show(api: DockviewApi, lens: LensId): void {
  const panel = api.getPanel(lens)
  const canvas = mainCanvas(api)

  if (!panel) {
    if (canvas) {
      showIn(api, canvas, lens)
    } else {
      addLens(api, lens, { direction: "right" }).api.setActive()
    }

    return
  }

  panel.api.setActive()
  const location = panel.group.api.location

  if (location.type === "popout") {
    location.getWindow().focus()
  }
}

/** Shows a lens in a canvas in place of its lens, moving it there if another canvas or window shows it. */
function showIn(api: DockviewApi, canvas: DockviewGroupPanel, lens: LensId): void {
  const before = canvas.activePanel
  const panel = api.getPanel(lens)

  if (before !== panel) {
    if (panel) {
      panel.api.moveTo({ group: canvas, position: "center" })
    } else {
      addLens(api, lens, { referenceGroup: canvas, direction: "within" })
    }

    before?.api.close()
  }

  api.getPanel(lens)?.api.setActive()
}

/** Shows a lens in a new canvas right of the canvas in focus. */
function addBeside(api: DockviewApi, lens: LensId): void {
  const canvas = mainCanvas(api)
  addLens(api, lens, canvas ? { referenceGroup: canvas, direction: "right" } : { direction: "right" }).api.setActive()
}

/** Opens a canvas's lens in a window of its own: where its title was let go, or beside the main window. */
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

/** A lens's canvas, under its title. */
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

/** A canvas's title: its lens's icon and name, the handle that drags it beside another canvas or out of the window. */
function LensTitle({ params }: IDockviewPanelHeaderProps<{ lens: LensId }>) {
  const { label, icon: Icon } = lenses[params.lens]

  return (
    <div className="flex h-full min-w-0 items-center gap-2 px-3">
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 truncate font-medium">{label}</span>
    </div>
  )
}

/**
 * At the end of a canvas's title: its lens out into a window of its own, or, in that window, back into the main one,
 * and closing the canvas while the main window has another.
 */
function CanvasActions({ group, containerApi, activePanel }: IDockviewHeaderActionsProps) {
  const { canvases } = use(LensContext)!
  const popped = group.api.location.type === "popout"

  if (!activePanel) {
    return null
  }

  return (
    <div className="flex h-full items-center gap-0.5 pr-2">
      {popped ? (
        <IconButton label="Move to main window" onClick={() => group.api.moveTo({ position: "right" })}>
          <SquareArrowOutDownLeft />
        </IconButton>
      ) : (
        <IconButton label="Move to new window" onClick={() => void popOut(containerApi, activePanel)}>
          <SquareArrowOutUpRight />
        </IconButton>
      )}
      {!popped && canvases > 1 && (
        <IconButton label={`Close ${activePanel.title ?? ""}`.trim()} onClick={() => activePanel.api.close()}>
          <X />
        </IconButton>
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
  current: LensId,
  window: Pick<ChromeActions, "panels" | "togglePanels" | "closeProject" | "openProject"> & { toggleLeft: () => void }
): ChromeActions {
  const panelOf = (lens: LensId) => api?.getPanel(lens)

  return {
    project: true,
    current,
    elsewhere: (lens) => (lens === snapshot.active ? undefined : snapshot.open[lens]),
    // The lens in the canvas in focus hides or shows the left panel, as VS Code's activity bar does.
    show: (lens) => {
      if (lens === snapshot.active) {
        window.toggleLeft()
      } else if (api) {
        show(api, lens)
      }
    },
    splitRight: (lens) => {
      const panel = panelOf(lens)
      const canvas = api && mainCanvas(api)

      if (panel && canvas) {
        panel.api.moveTo({ group: canvas, position: "right" })
      } else if (api && !panel) {
        addBeside(api, lens)
      }
    },
    canSplit: (lens) => !!api && panelOf(lens)?.group !== mainCanvas(api),
    toWindow: (lens) => {
      if (api) {
        void popOut(api, panelOf(lens) ?? addLens(api, lens, { direction: "right" }))
      }
    },
    canMoveToWindow: (lens) => !!api && !lenses[lens].missing && snapshot.open[lens] !== "window",
    toMain: (lens) => panelOf(lens)?.group.api.moveTo({ position: "right" }),
    canMoveToMain: (lens) => snapshot.open[lens] === "window",
    close: (lens) => panelOf(lens)?.api.close(),
    canClose: (lens) => snapshot.open[lens] === "window" || (snapshot.open[lens] === "canvas" && snapshot.canvases > 1),
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
    current: "pages",
    elsewhere: () => undefined,
    show: () => undefined,
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
