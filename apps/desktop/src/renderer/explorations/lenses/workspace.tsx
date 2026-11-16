import { Columns2, SquareArrowOutDownLeft, SquareArrowOutUpRight, X } from "lucide-react"
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react"
import { IconButton } from "../../chrome/IconButton.tsx"
import { StatusBar } from "../../chrome/StatusBar.tsx"
import { floatingBar } from "../../chrome/toolbar-parts.tsx"
import { HomePage } from "../../start/HomePage.tsx"
import { homeTab, useActiveTabId, useTabs, workspace } from "../../workspace.ts"
import { type Camera, LensCanvas } from "./canvas.tsx"
import { type ChromeActions, LensBar, LensWindowBar, TitleBar } from "./chrome.tsx"
import { lensOrder, lenses, project, type Ref } from "./data.ts"
import { LensInspector } from "./inspector.tsx"
import {
  closeGroup,
  find,
  focus,
  type Layout,
  type LensGroup,
  type LensId,
  type LensWindow,
  select,
  showIn,
  showLens,
  splitRight,
  toMainWindow,
  toNewWindow
} from "./model.ts"
import { LensPanel } from "./panel.tsx"

/** Where a dragged lens would go if let go now. */
type Target =
  | { kind: "here"; group: string }
  | { kind: "split"; window: string; group: string }
  | { kind: "window"; from: string }

interface Drag {
  lens: LensId
  start: { x: number; y: number }
  at: { x: number; y: number }
  moved: boolean
  target?: Target
}

/** The size the story draws a window at before scaling it onto a screen. */
const windowSize = { width: 1440, height: 900 }

/** What the windows share: the layout and how to change it, what each lens shows, and a lens being dragged. */
interface Shared {
  layout: Layout
  set: (change: (layout: Layout) => Layout) => void
  cameras: Partial<Record<LensId, Camera>>
  setCamera: (lens: LensId, camera: Camera) => void
  panels: Partial<Record<string, { left: boolean; right: boolean }>>
  setPanels: (windowId: string, change: Partial<{ left: boolean; right: boolean }>) => void
  tabs: Record<string, string>
  setTab: (key: string, tab: string) => void
  drag: Drag | undefined
  startDrag: (lens: LensId, event: ReactPointerEvent) => void
  /** What a hovered link in an inspector points at, outlined wherever its lens is shown. */
  peek: Ref | undefined
  setPeek: (ref: Ref | undefined) => void
  name: string
  closeProject: () => void
  openProject: (name: string) => void
}

/**
 * The prototype: one project, in as many windows as its lenses need. With one window it fills the story; once a lens
 * has a window of its own, the story shows a screen for each, side by side, the main window first. Closing the project
 * leaves the main window on Home, the app's own; opening one from there opens it in the window.
 */
export function LensesPrototype({ initial }: { initial: Layout }) {
  const [layout, setLayout] = useState(initial)
  const [cameras, setCameras] = useState<Partial<Record<LensId, Camera>>>({})
  const [panels, setPanelState] = useState<Partial<Record<string, { left: boolean; right: boolean }>>>({})
  const [tabs, setTabs] = useState<Record<string, string>>({})
  const [drag, setDrag] = useState<Drag>()
  const [peek, setPeek] = useState<Ref>()
  const [name, setName] = useState<string | undefined>(project.name)
  const dragRef = useRef<Drag>(undefined)
  const active = useActiveTabId()
  const openTabs = useTabs()

  // On Home, a project opened or resumed there opens in the window, in place of Home.
  const reopened = name === undefined && active !== homeTab
  const shown = reopened ? (openTabs.find((tab) => tab.id === active)?.title ?? project.name) : name

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = dragRef.current

      if (!current) {
        return
      }

      const moved = current.moved || Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) > 4
      const next: Drag = { lens: current.lens, start: current.start, at: { x: event.clientX, y: event.clientY }, moved }
      const target = moved ? targetAt(event.clientX, event.clientY, current.lens) : undefined

      if (target) {
        next.target = target
      }

      dragRef.current = next
      setDrag(next)
    }

    const up = () => {
      const current = dragRef.current
      dragRef.current = undefined
      setDrag(undefined)

      if (current?.moved && current.target) {
        setLayout((before) => drop(before, current.lens, current.target!))
      }
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)

    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [])

  // Ctrl and a number shows that lens in the window in focus, as it went to that tab.
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      const number = Number(event.key)

      if (!(event.ctrlKey || event.metaKey) || !Number.isInteger(number) || number < 1 || number > lensOrder.length) {
        return
      }

      const focused = document.activeElement?.closest<HTMLElement>("[data-window]")?.dataset.window
      setLayout((before) => showLens(before, focused ?? before.windows[0]!.id, lensOrder[number - 1]!))
      event.preventDefault()
    }

    window.addEventListener("keydown", keydown)

    return () => window.removeEventListener("keydown", keydown)
  }, [])

  const setCamera = useCallback(
    (lens: LensId, camera: Camera) => setCameras((before) => ({ ...before, [lens]: camera })),
    []
  )

  // Another project opens in this one's place, on the lens it opens on.
  const openProject = (next: string) => {
    setName(next)
    setLayout(initial)
    setCameras({})
  }

  const shared: Shared = {
    layout,
    set: setLayout,
    cameras,
    setCamera,
    panels,
    setPanels: (windowId, change) =>
      setPanelState((before) => ({
        ...before,
        [windowId]: { left: true, right: true, ...before[windowId], ...change }
      })),
    tabs,
    setTab: (key, tab) => setTabs((before) => ({ ...before, [key]: tab })),
    drag: drag?.moved ? drag : undefined,
    peek,
    setPeek,
    startDrag: (lens, event) => {
      if (event.button === 0) {
        const next = {
          lens,
          start: { x: event.clientX, y: event.clientY },
          at: { x: event.clientX, y: event.clientY },
          moved: false
        }

        dragRef.current = next
        setDrag(next)
      }
    },
    name: shown ?? project.name,
    closeProject: () => {
      workspace.activate(homeTab)
      setName(undefined)
    },
    openProject
  }

  const grabbing = drag?.moved ? "cursor-grabbing select-none" : ""

  if (shown === undefined) {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TitleBar actions={homeActions(openProject)} />
        <HomePage active />
      </div>
    )
  }

  const [main, ...others] = layout.windows

  return (
    <div className={grabbing}>
      {others.length === 0 ? (
        <div className="h-screen">
          <WindowView win={main!} main shared={shared} />
        </div>
      ) : (
        <Desk>
          <Screen label="Display 1">
            <WindowView win={main!} main shared={shared} />
          </Screen>
          {others.map((each, index) => (
            <Screen key={each.id} label={`Display ${index + 2}`}>
              <WindowView win={each} main={false} shared={shared} />
            </Screen>
          ))}
        </Desk>
      )}
      {drag?.moved && <DragChip drag={drag} />}
    </div>
  )
}

/** The desk the story shows windows on, once there's more than one: a screen for each, side by side. */
function Desk({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid h-screen auto-cols-fr grid-flow-col items-center gap-8 bg-neutral-200 p-8 dark:bg-neutral-900"
      data-wallpaper=""
    >
      {children}
    </div>
  )
}

/** One screen, its window maximized on it and scaled to fit, as a person with several monitors has. */
function Screen({ label, children }: { label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)

  useLayoutEffect(() => {
    const element = box.current

    if (!element) {
      return
    }

    const observer = new ResizeObserver(() =>
      setScale(Math.min(element.clientWidth / windowSize.width, element.clientHeight / windowSize.height))
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <div
        ref={box}
        className="relative aspect-[16/10] w-full overflow-hidden rounded-md shadow-2xl ring-1 ring-black/10 dark:ring-white/10"
        data-wallpaper=""
      >
        <div className="absolute top-0 left-0 origin-top-left" style={{ ...windowSize, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
      <figcaption className="text-center text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  )
}

function WindowView({ win, main, shared }: { win: LensWindow; main: boolean; shared: Shared }) {
  const { layout, set } = shared
  const focused = win.groups.find((one) => one.id === win.focused) ?? win.groups[0]!
  const panels = { left: true, right: true, ...shared.panels[win.id] }
  const lens = focused.lens
  const newWindow = shared.drag?.target?.kind === "window" && shared.drag.target.from === win.id

  const elsewhere = (id: LensId) => {
    const there = find(layout, id)

    if (!there || there.group.id === focused.id) {
      return undefined
    }

    return there.window.id === win.id ? "beside" : "window"
  }

  const alone = (id: LensId) => {
    const there = find(layout, id)

    return !!there && there.window.groups.length === 1
  }

  const actions: ChromeActions = {
    project: true,
    current: lens,
    elsewhere,
    show: (id) => {
      // The lens already shown here hides or shows the left panel, as VS Code's activity bar does.
      if (id === lens) {
        shared.setPanels(win.id, { left: !panels.left })
      } else {
        set((before) => showLens(before, win.id, id))
      }
    },
    splitRight: (id) => set((before) => splitRight(before, id, win.id)),
    canSplit: (id) => !(find(layout, id)?.group.id === focused.id && win.groups.length === 1),
    toWindow: (id) => set((before) => toNewWindow(before, id)),
    canMoveToWindow: (id) => {
      const there = find(layout, id)

      if (there && alone(id)) {
        return false
      }

      return !(there?.window === layout.windows[0] && layout.windows[0]!.groups.length === 1)
    },
    toMain: (id) => set((before) => toMainWindow(before, id)),
    canMoveToMain: (id) => {
      const there = find(layout, id)

      return !!there && there.window !== layout.windows[0]
    },
    close: (id) => {
      const there = find(layout, id)

      if (there) {
        set((before) => closeGroup(before, there.group.id))
      }
    },
    canClose: (id) => {
      const there = find(layout, id)

      return !!there && (there.window !== layout.windows[0] || layout.windows[0]!.groups.length > 1)
    },
    startDrag: shared.startDrag,
    panels,
    togglePanels: () => {
      const open = !(panels.left || panels.right)
      shared.setPanels(win.id, { left: open, right: open })
    },
    closeProject: shared.closeProject,
    openProject: shared.openProject
  }

  // A link reveals its lens where it's already shown, in any window; otherwise it shows it in the canvas in focus.
  const show = (ref: Ref) =>
    set((before) => {
      const there = find(before, ref.lens)

      return select(there ? focus(before, there.group.id) : showIn(before, ref.lens, focused.id), ref.lens, ref.id)
    })

  const showBeside = (ref: Ref) =>
    set((before) => {
      const there = find(before, ref.lens)

      const moved =
        there?.window.id === win.id ? focus(before, there.group.id) : splitRight(before, ref.lens, win.id, focused.id)

      return select(moved, ref.lens, ref.id)
    })

  return (
    <div
      data-window={win.id}
      className="relative flex size-full flex-col overflow-hidden bg-background text-foreground"
    >
      {main ? <TitleBar name={shared.name} actions={actions} /> : <LensWindowBar lens={lens} name={shared.name} />}
      <div className="flex min-h-0 flex-1">
        <LensBar actions={actions} />
        {panels.left && (
          <LensPanel
            key={lens}
            lens={lens}
            tab={shared.tabs[`left:${lens}`] ?? "outline"}
            onTab={(tab) => shared.setTab(`left:${lens}`, tab)}
            onHide={() => shared.setPanels(win.id, { left: false })}
            selected={layout.selected[lens]}
            onSelect={(id) => set((before) => select(before, lens, id))}
          />
        )}
        <div className="flex min-w-0 flex-1 divide-x">
          {win.groups.map((one) => (
            <GroupView key={one.id} group={one} win={win} main={main} focused={one.id === focused.id} shared={shared} />
          ))}
        </div>
        {panels.right && (
          <LensInspector
            lens={lens}
            selected={layout.selected[lens]}
            tab={shared.tabs[`right:${lens}`] ?? "design"}
            onTab={(tab) => shared.setTab(`right:${lens}`, tab)}
            onHide={() => shared.setPanels(win.id, { right: false })}
            onShow={(ref) => {
              shared.setPeek(undefined)
              show(ref)
            }}
            onShowBeside={(ref) => {
              shared.setPeek(undefined)
              showBeside(ref)
            }}
            onPeek={shared.setPeek}
          />
        )}
      </div>
      {main && <StatusBar />}
      {newWindow && (
        <div className="pointer-events-none absolute inset-0 z-[500] ring-4 ring-(--canvas-layer) ring-inset">
          <DropChip className="absolute right-6 bottom-12">
            <SquareArrowOutUpRight /> Move to new window
          </DropChip>
        </div>
      )}
    </div>
  )
}

/**
 * A canvas showing one lens. With two or more side by side, each has a header with its lens, picked out like an open
 * tab while it's the canvas in focus, and the lens's actions at its end. Dropping a lens on a canvas shows it there;
 * on its right side, beside it.
 */
function GroupView({
  group,
  win,
  main,
  focused,
  shared
}: {
  group: LensGroup
  win: LensWindow
  main: boolean
  focused: boolean
  shared: Shared
}) {
  const { layout, set } = shared
  const target = shared.drag?.target
  const splitting = target?.kind === "split" && target.group === group.id
  const here = target?.kind === "here" && target.group === group.id
  const { label, icon: Icon } = lenses[group.lens]
  const split = win.groups.length > 1
  const closable = split || !main
  const moveOut = !(main && win.groups.length === 1) && !(!main && win.groups.length === 1)

  return (
    <section
      aria-label={`${label} lens`}
      data-group={group.id}
      className="group/canvas relative flex min-w-0 flex-1 flex-col"
      onPointerDownCapture={() => !focused && set((before) => focus(before, group.id))}
      onFocusCapture={() => !focused && set((before) => focus(before, group.id))}
    >
      {split && (
        <div
          className={`flex h-9 shrink-0 items-center gap-1.5 border-b pr-1 pl-3 text-sm ${
            focused ? "bg-background text-foreground" : "bg-neutral-50 text-muted-foreground dark:bg-white/[0.02]"
          }`}
        >
          <Icon className="size-4 shrink-0" />
          <span className="truncate">{label}</span>
          <span
            className={`ml-auto flex items-center ${focused ? "" : "opacity-0 group-focus-within/canvas:opacity-100 group-hover/canvas:opacity-100"}`}
          >
            <IconButton
              label="Split right"
              onClick={() => set((before) => splitRight(before, group.lens, win.id, group.id))}
            >
              <Columns2 />
            </IconButton>
            {main ? (
              moveOut && (
                <IconButton label="Move to new window" onClick={() => set((before) => toNewWindow(before, group.lens))}>
                  <SquareArrowOutUpRight />
                </IconButton>
              )
            ) : (
              <IconButton label="Move to main window" onClick={() => set((before) => toMainWindow(before, group.lens))}>
                <SquareArrowOutDownLeft />
              </IconButton>
            )}
            {closable && (
              <IconButton label={`Close ${label}`} onClick={() => set((before) => closeGroup(before, group.id))}>
                <X />
              </IconButton>
            )}
          </span>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col" data-canvas={group.id}>
        <LensCanvas
          lens={group.lens}
          selected={layout.selected[group.lens]}
          peek={shared.peek?.lens === group.lens ? shared.peek.id : undefined}
          onSelect={(id) => set((before) => select(before, group.lens, id))}
          camera={shared.cameras[group.lens]}
          onCamera={(camera) => shared.setCamera(group.lens, camera)}
        />
        {(splitting || here) && (
          <div
            className={`pointer-events-none absolute inset-y-2 z-[500] grid place-items-center rounded-lg border-2 border-(--canvas-layer) bg-[color-mix(in_oklch,var(--canvas-layer)_10%,transparent)] ${
              splitting ? "right-2 left-1/2" : "inset-x-2"
            }`}
          >
            <DropChip>
              {splitting ? <Columns2 /> : <Icon />}
              {splitting ? "Split right" : `Show ${lenses[shared.drag!.lens].label} here`}
            </DropChip>
          </div>
        )}
      </div>
    </section>
  )
}

function DropChip({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium [&_svg]:size-4 [&_svg]:text-(--canvas-layer) ${floatingBar} ${className}`}
    >
      {children}
    </div>
  )
}

/** The lens being dragged, under the pointer. */
function DragChip({ drag }: { drag: Drag }) {
  const { label, icon: Icon } = lenses[drag.lens]

  return (
    <div
      className="pointer-events-none fixed z-[1000] flex items-center gap-2 rounded-lg border bg-popover px-2.5 py-1.5 text-sm font-medium text-popover-foreground shadow-lg"
      style={{ left: drag.at.x + 12, top: drag.at.y + 12 }}
    >
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </div>
  )
}

/** What's under the pointer while a lens is dragged from the lens bar. */
function targetAt(x: number, y: number, lens: LensId): Target | undefined {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!(element instanceof HTMLElement)) {
      continue
    }

    // The window's right or bottom edge, whatever is drawn there: inspector, status bar or canvas.
    const winElement = element.closest<HTMLElement>("[data-window]")

    if (winElement && !lenses[lens].missing) {
      const win = winElement.getBoundingClientRect()

      if (Math.min(win.right - x, win.bottom - y) < 16 * (win.width / windowSize.width)) {
        return { kind: "window", from: winElement.dataset.window! }
      }
    }

    const canvas = element.closest<HTMLElement>("[data-canvas]")

    if (canvas && winElement) {
      const box = canvas.getBoundingClientRect()

      return x > box.left + box.width * 0.6
        ? { kind: "split", window: winElement.dataset.window!, group: canvas.dataset.canvas! }
        : { kind: "here", group: canvas.dataset.canvas! }
    }

    if (element.hasAttribute("data-wallpaper")) {
      return { kind: "window", from: "" }
    }
  }

  return undefined
}

function drop(layout: Layout, lens: LensId, target: Target): Layout {
  switch (target.kind) {
    case "split":
      return splitRight(layout, lens, target.window, target.group)
    case "here":
      return showIn(layout, lens, target.group)
    case "window":
      return toNewWindow(layout, lens)
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
    startDrag: () => undefined,
    panels: { left: false, right: false },
    togglePanels: () => undefined,
    closeProject: () => undefined,
    openProject
  }
}
