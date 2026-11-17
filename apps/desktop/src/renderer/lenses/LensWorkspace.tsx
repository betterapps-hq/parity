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
import { type Dispatch, type ReactNode, type SetStateAction, useEffect, useMemo, useState } from "react"
import { type Dock, dockAdapter } from "./dock-adapter.ts"
import { GroupActions } from "./GroupActions.tsx"
import { LensBar } from "./LensBar.tsx"
import { LensTab } from "./LensTab.tsx"
import { dress } from "./popout.ts"
import type { LensView } from "./registry.ts"
import { type LensActions, ShellContext, useShell } from "./shell.ts"

const theme: DockviewTheme = { name: "parity", className: "dockview-theme-parity" }

export interface LensWorkspaceProps<Id extends string> {
  /** The lenses it shows, each with its canvas, left panel and inspector. */
  lenses: readonly LensView<Id>[]
  /** The layout it opens on, as the project saved it. Without one, or with none of its lenses left, the first lens. */
  layout?: JsonValue | undefined
  /** The page a lens's own window opens on, before Dockview moves the lens into it. */
  popoutUrl: string
  /** The project's name, which a lens's own window is titled with, after its lens. */
  title: string
  /** Above the lenses, as the window's title bar, which reaches them with `useLensWorkspace`. */
  titleBar?: ReactNode
  /** Below the lenses, as the window's status bar. */
  statusBar?: ReactNode
}

/**
 * A project's lenses in a window, laid out by Dockview: the lens bar down the left, the left panel and the inspector
 * for the lens in focus, and each open lens a tab over its canvas, in this window or one of its own. The left panel
 * and the inspector follow the tab in focus, in any window; with every tab closed, the window is empty.
 */
export function LensWorkspace<Id extends string>({
  lenses,
  layout: saved,
  popoutUrl,
  title,
  titleBar,
  statusBar
}: LensWorkspaceProps<Id>) {
  const known = useMemo(() => new Map<string, LensView<Id>>(lenses.map((lens) => [lens.id, lens])), [lenses])
  const [opening] = useState(() => readLayout(saved, lenses))
  const [dock, setDock] = useState<Dock<Id>>()
  const [layout, setLayout] = useState<Layout<Id>>({ groups: [] })
  // The lens the panels show before Dockview has laid the window out.
  const [last, setLast] = useState(() => opening.groups[opening.focus ?? 0]?.open ?? barOrder(lenses)[0]?.id)
  const [panels, setPanels] = useState({ left: true, right: true })

  // With every tab closed, no lens is in focus, and the panels that follow one go with it.
  const empty = dock !== undefined && isEmpty(layout)
  const current = empty ? undefined : (inFocus(layout) ?? last)
  const shown = current === undefined ? undefined : known.get(current)

  // The lens bar, panels and inspector follow Dockview's layout: which lenses are open, where, and which is in front.
  useEffect(() => {
    if (!dock) {
      return
    }

    return dock.watch({
      change: (next) => {
        const focused = inFocus(next)
        setLayout(next)

        if (focused) {
          setLast(focused)
        }
      },
      // A tab let go outside its window opens in a window of its own there, as a browser's tab does.
      letGo: (lens, at) => dock.apply(toWindow(dock.layout(), lens, at)),
      opened: (opened, lens) => {
        const name = lens === undefined ? undefined : known.get(lens)?.name
        dress(opened, name ? `${name} — ${title}` : title)
      }
    })
  }, [dock, known, title])

  // Ctrl and a lens's number shows it, as clicking it in the lens bar does.
  useEffect(() => {
    const keydown = (event: globalThis.KeyboardEvent) => {
      const lens = event.ctrlKey || event.metaKey ? lensForShortcut(lenses, `Ctrl+${event.key}`) : undefined

      if (!lens || !dock) {
        return
      }

      dock.apply(show(dock.layout(), lens.id))
      event.preventDefault()
    }

    window.addEventListener("keydown", keydown)

    return () => window.removeEventListener("keydown", keydown)
  }, [dock, lenses])

  const onReady = ({ api }: DockviewReadyEvent) => {
    const next = dockAdapter(api, (id): id is Id => id !== undefined && known.has(id), popoutUrl)
    next.lay(opening)
    setDock(next)
  }

  const onDidDrop = (event: DockviewDidDropEvent) => {
    const dropped = dock?.dropped(event)

    if (dock && dropped) {
      dock.apply(drop(dock.layout(), dropped.lens, dropped.to))
    }
  }

  const actions = lensActions({ dock, layout, current, known, panels, setPanels })
  const hide = (side: "left" | "right") => setPanels((before) => ({ ...before, [side]: false }))

  return (
    <ShellContext value={{ lenses: known, layout, actions }}>
      <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
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
              popoutUrl={popoutUrl}
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
    </ShellContext>
  )
}

/** What the lens bar, the menus and a lens's views do: the package's decisions made on Dockview, and its marks. */
function lensActions<Id extends string>({
  dock,
  layout,
  current,
  known,
  panels,
  setPanels
}: {
  dock: Dock<Id> | undefined
  layout: Layout<Id>
  current: Id | undefined
  known: ReadonlyMap<string, LensView<Id>>
  panels: { left: boolean; right: boolean }
  setPanels: Dispatch<SetStateAction<{ left: boolean; right: boolean }>>
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
    canMoveToWindow: (lens) => !!menu(lens)?.moveToNewWindow,
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

/** A lens's canvas, as its tab's content. */
function LensContent({ params }: IDockviewPanelProps<{ lens: string }>) {
  const lens = useShell().lenses.get(params.lens)

  return lens ? (
    <div className="flex size-full flex-col">
      <lens.Canvas lens={lens.id} />
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
