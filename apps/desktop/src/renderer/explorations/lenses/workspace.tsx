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
type Target = { kind: "here"; group: string } | { kind: "split"; window: string; group: string } | { kind: "window" }

interface Drag {
  lens: LensId
  start: { x: number; y: number }
  at: { x: number; y: number }
  moved: boolean
  /** It can move to a window of its own, so the desktop around the windows takes it. */
  leaves: boolean
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
      const at = { x: event.clientX, y: event.clientY }
      const next: Drag = { lens: current.lens, start: current.start, at, moved, leaves: current.leaves }
      const target = moved ? targetAt(at.x, at.y, current.leaves) : undefined

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

  const dragging = drag?.moved ? drag : undefined

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
    drag: dragging,
    peek,
    setPeek,
    startDrag: (lens, event) => {
      if (event.button === 0) {
        const next = {
          lens,
          start: { x: event.clientX, y: event.clientY },
          at: { x: event.clientX, y: event.clientY },
          moved: false,
          leaves: canLeave(layout, lens)
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

  const grabbing = dragging ? "cursor-grabbing select-none" : ""

  if (shown === undefined) {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground">
        <TitleBar actions={homeActions(openProject)} />
        <HomePage active />
      </div>
    )
  }

  const [main, ...others] = layout.windows
  const leaving = dragging?.target?.kind === "window" ? dragging : undefined

  return (
    <div className={grabbing}>
      {others.length === 0 ? (
        <Desktop drag={dragging}>
          <div className="relative size-full overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/10 dark:ring-white/10">
            <WindowView win={main!} main shared={shared} />
          </div>
        </Desktop>
      ) : (
        <Desktop drag={dragging} className="grid auto-cols-fr grid-flow-col items-center gap-8">
          <Screen label="Display 1">
            <WindowView win={main!} main shared={shared} />
          </Screen>
          {others.map((each, index) => (
            <Screen key={each.id} label={`Display ${index + 2}`}>
              <WindowView win={each} main={false} shared={shared} />
            </Screen>
          ))}
        </Desktop>
      )}
      {leaving ? <WindowGhost drag={leaving} /> : dragging && <DragChip drag={dragging} />}
    </div>
  )
}

/**
 * The desktop the story shows the project's windows on: one window with room around it, or once a lens has a window
 * of its own, a screen for each. Dragging a lens off a window, onto the desktop, opens it in a window of its own, as
 * dragging it onto another monitor would; while a lens is dragged, the desktop is outlined to say so.
 */
function Desktop({
  drag,
  className = "",
  children
}: {
  drag: Drag | undefined
  className?: string
  children: ReactNode
}) {
  const over = drag?.target?.kind === "window"

  return (
    <div className={`relative h-screen bg-neutral-200 p-8 dark:bg-neutral-900 ${className}`} data-wallpaper="">
      {drag?.leaves && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed transition-colors ${
            over
              ? "border-(--canvas-layer) bg-[color-mix(in_oklch,var(--canvas-layer)_8%,transparent)]"
              : "border-[color-mix(in_oklch,var(--canvas-layer)_45%,transparent)]"
          }`}
        />
      )}
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

  const elsewhere = (id: LensId) => {
    const there = find(layout, id)

    if (!there || there.group.id === focused.id) {
      return undefined
    }

    return there.window.id === win.id ? "beside" : "window"
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
    toWindow: (id) => set((before) => moveOut(before, id)),
    canMoveToWindow: (id) => canLeave(layout, id),
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
    </div>
  )
}

/**
 * A canvas showing one lens, under a tab with the lens's name, drawn as the side panels draw their open tab so the
 * three line up. The tab drags the lens off the window into a window of its own, as a browser's tab does, or onto
 * another canvas; the button at its end does the same in one click, and in a lens's own window takes it back. With two
 * or more canvases side by side, the one in focus has a blue top edge. Dropping a lens on a canvas shows it there; on
 * its right side, beside it.
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

  return (
    <section
      aria-label={`${label} lens`}
      data-group={group.id}
      className="group/canvas relative flex min-w-0 flex-1 flex-col"
      onPointerDownCapture={() => !focused && set((before) => focus(before, group.id))}
      onFocusCapture={() => !focused && set((before) => focus(before, group.id))}
    >
      <div
        className={`relative flex shrink-0 items-center gap-1 border-b p-2 ${
          focused || !split ? "bg-background" : "bg-neutral-50 dark:bg-white/[0.02]"
        }`}
        onPointerDown={(event) => {
          if (!(event.target instanceof Element && event.target.closest("button"))) {
            shared.startDrag(group.lens, event)
          }
        }}
      >
        {split && focused && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-(--canvas-layer)" />}
        <div className="inline-flex h-8 min-w-0 items-center p-[3px]">
          <div
            className={`flex h-[calc(100%-1px)] min-w-0 items-center gap-1.5 rounded-md border px-1.5 text-sm font-medium ${
              focused || !split
                ? "border-transparent bg-background text-foreground shadow-sm dark:border-input dark:bg-input/30"
                : "border-transparent text-muted-foreground"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            <span className="truncate">{label}</span>
          </div>
        </div>
        <div className="flex-1" />
        {main ? (
          canLeave(layout, group.lens) && (
            <IconButton label="Move to new window" onClick={() => set((before) => moveOut(before, group.lens))}>
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
      </div>
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

/**
 * Where a lens dragged onto the desktop will open: a window of its own, outlined under the pointer, kept on screen
 * near the desktop's edges.
 */
function WindowGhost({ drag }: { drag: Drag }) {
  const { label, icon: Icon } = lenses[drag.lens]
  const size = { width: 240, height: 150 }
  const left = Math.max(8, Math.min(drag.at.x - 28, window.innerWidth - size.width - 8))
  const top = Math.max(8, Math.min(drag.at.y - 14, window.innerHeight - size.height - 8))

  return (
    <div
      className="pointer-events-none fixed z-[1000] flex flex-col overflow-hidden rounded-lg border-2 border-(--canvas-layer) bg-background/90 shadow-xl backdrop-blur-sm"
      style={{ left, top, ...size }}
    >
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b px-2.5 text-xs font-medium">
        <Icon className="size-3.5 text-muted-foreground" />
        {label}
      </div>
      <div className="grid flex-1 place-items-center bg-[color-mix(in_oklch,var(--canvas-layer)_8%,transparent)]">
        <span className="flex items-center gap-2 text-sm font-medium text-(--canvas-layer-text)">
          <SquareArrowOutUpRight className="size-4" />
          Move to new window
        </span>
      </div>
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

/**
 * What's under the pointer while a lens is dragged: a canvas, to show it there or, on its right side, beside it; or the
 * desktop outside every window, to move it to a window of its own if it can leave where it is.
 */
function targetAt(x: number, y: number, leaves: boolean): Target | undefined {
  const element = document.elementFromPoint(x, y)

  if (!(element instanceof HTMLElement)) {
    return undefined
  }

  const winElement = element.closest<HTMLElement>("[data-window]")

  if (!winElement) {
    return leaves && element.closest("[data-wallpaper]") ? { kind: "window" } : undefined
  }

  const canvas = element.closest<HTMLElement>("[data-canvas]")

  if (!canvas) {
    return undefined
  }

  const box = canvas.getBoundingClientRect()

  return x > box.left + box.width * 0.6
    ? { kind: "split", window: winElement.dataset.window!, group: canvas.dataset.canvas! }
    : { kind: "here", group: canvas.dataset.canvas! }
}

/** The lens the main window shows when its only one moves out: the first that shows nowhere and has something to draw. */
function insteadOf(layout: Layout, lens: LensId): LensId | undefined {
  return lensOrder.find((id) => id !== lens && !find(layout, id) && !lenses[id].missing)
}

/**
 * Whether a lens can move to a window of its own: it has something to draw, and it isn't already all its window shows,
 * unless that's the main window and another lens can take its place there.
 */
function canLeave(layout: Layout, lens: LensId): boolean {
  const there = find(layout, lens)

  if (lenses[lens].missing) {
    return false
  }

  if (!there || there.window.groups.length > 1) {
    return true
  }

  return there.window === layout.windows[0] && insteadOf(layout, lens) !== undefined
}

function moveOut(layout: Layout, lens: LensId): Layout {
  return toNewWindow(layout, lens, insteadOf(layout, lens))
}

function drop(layout: Layout, lens: LensId, target: Target): Layout {
  switch (target.kind) {
    case "split":
      return splitRight(layout, lens, target.window, target.group)
    case "here":
      return showIn(layout, lens, target.group)
    case "window":
      return moveOut(layout, lens)
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
