import "dockview-react/dist/styles/dockview.css"
import "./dock.css"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@buildkitgg/shadcn"
import {
  barOrder,
  close,
  type DockOperation,
  drop,
  followLink,
  inFocus,
  isEmpty,
  type JsonValue,
  type Layout,
  lensForShortcut,
  markOf,
  menuOf,
  openTab,
  readLayout,
  type SavedLayout,
  saveLayout,
  show,
  splitRight,
  toMain,
  toWindow
} from "@parity-app/lenses"
import {
  type DockviewDidDropEvent,
  DockviewReact,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewPanelProps
} from "dockview-react"
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { addLensWindow, onEachWindow } from "../lens-windows.ts"
import { addLensDocument, readopt } from "../window-sheets.ts"
import { type Dock, dockAdapter, type WindowPlaces } from "./dock-adapter.ts"
import { GroupActions } from "./GroupActions.tsx"
import { LensBar } from "./LensBar.tsx"
import { LensTab } from "./LensTab.tsx"
import { dress, makeTitleBar, onThemeChange } from "./popout.ts"
import type { LensView } from "./registry.ts"
import { type LensActions, ShellContext, useShell } from "./shell.ts"
import { WindowPortals } from "./window-portals.tsx"

const theme: DockviewTheme = { name: "parity", className: "dockview-theme-parity" }

export interface LensWorkspaceProps<Id extends string> {
  /** The lenses it shows, each with its canvas, left panel and inspector. */
  lenses: readonly LensView<Id>[]
  /** The layout it opens on, as the project saved it. Without one, or with none of its lenses left, `defaultLayout`. */
  layout?: JsonValue | undefined
  /** The layout the project opens on before it has one of its own. Without one, the first lens. */
  defaultLayout?: SavedLayout<Id> | undefined
  /**
   * Told the layout to save as it changes, a moment after, and at once as the window's page goes or the lenses close,
   * with each lens window's place as it is then.
   */
  onLayout?: ((saved: SavedLayout<Id>) => void) | undefined
  /**
   * The page a lens's own window opens on, before Dockview moves the lens into it. Without one, lenses stay in this
   * window: nothing offers to move one to a window of its own, and a tab let go outside the window stays where it was.
   */
  popoutUrl?: string
  /** Where each lens window is, as the desktop app places them, to save with the layout. */
  windowPlaces?: WindowPlaces | undefined
  /** The project's name, which a lens's own window is titled with, after its lens. */
  title: string
  /** Above the lenses, as the window's title bar, which reaches them with `useLensWorkspace`. */
  titleBar?: ReactNode
  /** Below the lenses, as the window's status bar. */
  statusBar?: ReactNode
  /**
   * Whether the left panel and the inspector show, when the window keeps that itself, as the app does with its panel
   * layout, so its own commands show and hide them too. Without it, the shell keeps it.
   */
  panels?: Panels | undefined
  /** Told when the shell shows or hides a panel, with `panels`. */
  onPanels?: ((next: Panels) => void) | undefined
}

/** Whether the left panel and the inspector show. */
export interface Panels {
  left: boolean
  right: boolean
}

/** A lens's own window that's open: the window, the group it holds, its title bar's element, and what closes it. */
interface LensWindow {
  window: Window
  group: string
  titleBar: HTMLElement
  close: () => void
}

/**
 * A project's lenses in a window, laid out by Dockview: the lens bar down the left, the left panel and the inspector
 * for the lens in focus, and each open lens a tab over its canvas, in this window or one of its own. The left panel
 * and the inspector follow the tab in focus, in any window; with every tab closed, the window is empty.
 */
export function LensWorkspace<Id extends string>({
  lenses,
  layout: saved,
  defaultLayout,
  onLayout,
  popoutUrl,
  windowPlaces,
  title,
  titleBar,
  statusBar,
  panels: given,
  onPanels
}: LensWorkspaceProps<Id>) {
  const known = useMemo(() => new Map<string, LensView<Id>>(lenses.map((lens) => [lens.id, lens])), [lenses])
  const [opening] = useState(() => readLayout(saved, lenses, defaultLayout))
  const [dock, setDock] = useState<Dock<Id>>()
  const [layout, setLayout] = useState<Layout<Id>>({ groups: [] })
  // The lens the panels show before Dockview has laid the window out.
  const [last, setLast] = useState(() => opening.groups[opening.focus ?? 0]?.open ?? barOrder(lenses)[0]?.id)
  const [kept, setKept] = useState<Panels>({ left: true, right: true })
  const [windows, setWindows] = useState<readonly LensWindow[]>([])
  const panels = given ?? kept
  const setPanels = (change: (before: Panels) => Panels) => (onPanels ?? setKept)(change(panels))

  // With every tab closed, no lens is in focus, and the panels that follow one go with it.
  const empty = dock !== undefined && isEmpty(layout)
  const current = empty ? undefined : (inFocus(layout) ?? last)
  const shown = current === undefined ? undefined : known.get(current)

  const saving = useSaving(dock, onLayout)

  // The lens bar, panels and inspector follow Dockview's layout: which lenses are open, where, and which is in front.
  useEffect(() => {
    if (!dock) {
      return
    }

    // The lens windows open now, which the title bars are drawn for.
    const open = new Set<LensWindow>()

    const stop = dock.watch({
      change: (next) => {
        const focused = inFocus(next)
        setLayout(next)

        if (focused) {
          setLast(focused)
        }

        saving.soon()
      },
      // A tab let go outside its window opens in a window of its own there, as a browser's tab does.
      letGo: (lens, at) => {
        if (popoutUrl !== undefined) {
          dock.apply(toWindow(dock.layout(), lens, at))
        }
      },
      // The window's shortcuts and stylesheets reach it, and it gets a title bar of its own.
      opened: (opened, group) => {
        const stops = [addLensWindow(opened), addLensDocument(opened.document), followMoves(opened.document)]
        readopt(opened.document.body)

        const close = () => {
          for (const stop of stops) {
            stop()
          }
        }

        const lensWindow = { window: opened, group, titleBar: makeTitleBar(opened), close }
        open.add(lensWindow)
        setWindows([...open])
      },
      closed: (group) => {
        for (const each of [...open].filter((lensWindow) => lensWindow.group === group)) {
          each.close()
          open.delete(each)
        }

        setWindows([...open])
      }
    })

    return () => {
      stop()

      for (const each of open) {
        each.close()
      }

      setWindows([])
    }
  }, [dock, popoutUrl, saving])

  // Each lens window is named for the lens in front of it and the project, and takes the main window's theme as it
  // changes.
  useEffect(() => {
    const dressAll = () => {
      for (const { window: opened, group } of windows) {
        dress(opened, lensWindowTitle(frontName(layout, group, known), title))
      }
    }

    dressAll()

    return onThemeChange(dressAll)
  }, [windows, layout, known, title])

  // Ctrl and a lens's number shows it, as clicking it in the lens bar does, in any window.
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      const lens = event.ctrlKey || event.metaKey ? lensForShortcut(lenses, `Ctrl+${event.key}`) : undefined

      if (!lens || !dock) {
        return
      }

      dock.apply(show(dock.layout(), lens.id))
      event.preventDefault()
    }

    return onEachWindow((target) => {
      target.addEventListener("keydown", keydown)

      return () => target.removeEventListener("keydown", keydown)
    })
  }, [dock, lenses])

  const onReady = ({ api }: DockviewReadyEvent) => {
    const next = dockAdapter(api, (id): id is Id => id !== undefined && known.has(id), popoutUrl, windowPlaces)
    next.lay(opening)
    setDock(next)
  }

  const onDidDrop = (event: DockviewDidDropEvent) => {
    const dropped = dock?.dropped(event)

    if (dock && dropped) {
      dock.apply(drop(dock.layout(), dropped.lens, dropped.to))
    }
  }

  const actions = lensActions({ dock, layout, current, known, windows: popoutUrl !== undefined, panels, setPanels })
  const hide = (side: "left" | "right") => setPanels((before) => ({ ...before, [side]: false }))

  return (
    <ShellContext value={{ lenses: known, layout, actions }}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
        {titleBar}
        <div className="flex min-h-0 flex-1">
          <LensBar lenses={lenses} actions={actions} />
          {panels.left && shown && <shown.Panel key={`left:${shown.id}`} lens={shown.id} onHide={() => hide("left")} />}
          <div className="relative min-w-0 flex-1">
            <DockviewReact
              className="absolute inset-0"
              theme={theme}
              components={components}
              defaultTabComponent={LensTab}
              rightHeaderActionsComponent={GroupActions}
              watermarkComponent={NoLens}
              {...(popoutUrl === undefined ? {} : { popoutUrl })}
              disableFloatingGroups
              onReady={onReady}
              onDidDrop={onDidDrop}
            />
          </div>
          {panels.right && shown && (
            <shown.Inspector key={`right:${shown.id}`} lens={shown.id} onHide={() => hide("right")} />
          )}
        </div>
        {statusBar}
      </div>
      {windows.map(({ group, titleBar }) =>
        createPortal(
          <LensWindowTitleBar title={lensWindowTitle(frontName(layout, group, known), title)} />,
          titleBar,
          group
        )
      )}
    </ShellContext>
  )
}

/** How long after the layout last changed it's saved, so dragging a split's edge saves once it's let go. */
const saveAfterMs = 300

/** Saves the layout as `useSaving` does. */
interface Saving {
  /** Saves it a moment from now, unless it changes again first. */
  soon: () => void
}

/** How long saving waits after the window's page starts to go, in case it stays: long enough for it to have gone. */
const leavingMs = 1000

/**
 * Saves the layout with `onLayout` a moment after it changes, and at once as the window's page starts to go or the
 * lenses close, while each lens window is still open where it is. What follows isn't saved: Dockview closes the lens
 * windows as the page starts to go, and as the lenses close, returning their groups to the main window, which isn't the
 * layout to keep. A page that stays after all saves again a moment later.
 */
function useSaving<Id extends string>(
  dock: Dock<Id> | undefined,
  onLayout: ((saved: SavedLayout<Id>) => void) | undefined
): Saving {
  const latest = useRef({ dock, onLayout })

  const state = useRef<{ timer?: ReturnType<typeof setTimeout>; done: boolean; held: boolean }>({
    done: false,
    held: false
  })

  useLayoutEffect(() => {
    latest.current = { dock, onLayout }
  })

  const [saving] = useState(() => {
    const now = () => {
      clearTimeout(state.current.timer)
      const { dock: current, onLayout: save } = latest.current

      if (current && save && !state.current.done && !state.current.held) {
        save(saveLayout(current.layout(), current.arrangement()))
      }
    }

    const last = () => {
      now()
      state.current.done = true
    }

    // Before Dockview hears it, which it does as the page goes, after it.
    const leaving = () => {
      now()
      state.current.held = true
      setTimeout(() => {
        state.current.held = false
        now()
      }, leavingMs)
    }

    return {
      soon: () => {
        clearTimeout(state.current.timer)
        state.current.timer = setTimeout(now, saveAfterMs)
      },
      last,
      leaving
    }
  })

  // A layout effect's cleanup runs before Dockview's own, which closes the lens windows.
  useLayoutEffect(() => {
    // Strict Mode closes and opens the lenses once more as they first open.
    state.current.done = false
    window.addEventListener("beforeunload", saving.leaving, true)

    return () => {
      window.removeEventListener("beforeunload", saving.leaving, true)
      saving.last()
    }
  }, [saving])

  return saving
}

/** What the lens bar, the menus and a lens's views do: the package's decisions made on Dockview, and its marks. */
function lensActions<Id extends string>({
  dock,
  layout,
  current,
  known,
  windows,
  panels,
  setPanels
}: {
  dock: Dock<Id> | undefined
  layout: Layout<Id>
  current: Id | undefined
  known: ReadonlyMap<string, LensView<Id>>
  windows: boolean
  panels: Panels
  setPanels: (change: (before: Panels) => Panels) => void
}): LensActions<Id> {
  // Decided on Dockview's layout as it is now, which a drag may have changed since the window last drew.
  const run = (decide: (now: Layout<Id>) => DockOperation<Id>[]) => {
    if (dock) {
      dock.apply(decide(dock.layout()))
    }
  }

  // Nothing can be done before Dockview is ready.
  const menu = (lens: Id) => {
    const view = known.get(lens)

    return dock && view ? menuOf(layout, view) : undefined
  }

  return {
    current,
    mark: (lens) => {
      const view = known.get(lens)

      return view ? markOf(layout, view) : { focus: false, unavailable: false }
    },
    // The lens in front hides or shows the left panel, as VS Code's activity bar does.
    show: (lens) =>
      lens === inFocus(layout)
        ? setPanels((before) => ({ ...before, left: !before.left }))
        : run((now) => show(now, lens)),
    openTab: (lens) => run((now) => openTab(now, lens)),
    canOpenTab: (lens) => !!menu(lens)?.openInNewTab,
    splitRight: (lens) => run((now) => splitRight(now, lens)),
    canSplit: (lens) => !!menu(lens)?.splitRight,
    toWindow: (lens) => run((now) => toWindow(now, lens)),
    windows,
    canMoveToWindow: (lens) => windows && !!menu(lens)?.moveToNewWindow,
    toMain: (lens) => run((now) => toMain(now, lens)),
    canMoveToMain: (lens) => !!menu(lens)?.moveToMainWindow,
    close: (lens) => run((now) => close(now, lens)),
    canClose: (lens) => !!menu(lens)?.close,
    followLink: (lens, beside) => run((now) => followLink(now, lens, beside)),
    panels,
    togglePanels: () =>
      setPanels((before) => {
        const open = !(before.left || before.right)

        return { left: open, right: open }
      })
  }
}

/** The name of the lens in front of a group. */
function frontName(layout: Layout<string>, group: string, known: ReadonlyMap<string, { name: string }>) {
  const front = layout.groups.find((each) => each.id === group)?.open

  return front === undefined ? undefined : known.get(front)?.name
}

/** What a lens window is titled: the lens in front of it, then the project. */
function lensWindowTitle(lens: string | undefined, project: string): string {
  return lens ? `${lens} — ${project}` : project
}

/**
 * A lens window's title bar: the window's name, which drags the window, with the system's window buttons over its end
 * as they are over the main window's.
 */
function LensWindowTitleBar({ title }: { title: string }) {
  return (
    <header className="flex size-full items-center justify-center border-b bg-neutral-100 px-[150px] [-webkit-app-region:drag] dark:bg-[#0a0a0a]">
      <span className="truncate text-sm font-medium">{title}</span>
    </header>
  )
}

/**
 * Gives what's added to a lens window its stylesheets in that window, as a layer's picture made for a drag is, until the
 * function returned is called.
 */
function followMoves(page: Document): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        readopt(node)
      }
    }
  })

  observer.observe(page.body, { childList: true, subtree: true })

  return () => observer.disconnect()
}

/** The window a lens's tab is in: a lens window of its own, or the main one. */
function windowOfPanel(api: IDockviewPanelProps["api"]): Window {
  const location = api.group.api.location

  return location.type === "popout" ? location.getWindow() : window
}

/**
 * A lens's canvas, as its tab's content. Its menus and tooltips show in the window it's in, and as it moves between
 * windows its frames and icons take their stylesheets there.
 */
function LensContent({ params, api }: IDockviewPanelProps<{ lens: string }>) {
  const lens = useShell().lenses.get(params.lens)
  const [visible, setVisible] = useState(api.isVisible)
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  const [shownIn, setShownIn] = useState(() => windowOfPanel(api))

  useEffect(() => {
    const subscriptions = [
      api.onDidVisibilityChange(({ isVisible }) => setVisible(isVisible)),
      api.onDidLocationChange(() => setShownIn(windowOfPanel(api)))
    ]

    return () => {
      for (const subscription of subscriptions) {
        subscription.dispose()
      }
    }
  }, [api])

  // Dockview moves the tab's elements to the other window, rather than drawing them again.
  useEffect(() => {
    if (!content) {
      return
    }

    readopt(content)
    const frame = shownIn.requestAnimationFrame(() => readopt(content))

    return () => shownIn.cancelAnimationFrame(frame)
  }, [content, shownIn])

  return lens ? (
    <div ref={setContent} className="flex size-full flex-col">
      {content && (
        <WindowPortals shownIn={shownIn}>
          {createPortal(<lens.Canvas lens={lens.id} visible={visible} />, content)}
        </WindowPortals>
      )}
    </div>
  ) : null
}

const components = { lens: LensContent }

/** The window with every tab closed. */
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
