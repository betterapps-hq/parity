import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@buildkitgg/shadcn"
import { ChevronDown, Columns2, Menu, UserRound, X } from "lucide-react"
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { columns, type Item, items, lenses, missingLens, storyFiles } from "./data.ts"
import {
  closeGroup,
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

const windowSize = { width: 1440, height: 900 }

/** The project the window has open; a window has one, and opening another replaces it. */
const project = "shadcn-vite"

/** Where a dragged lens would go if let go now. */
type Target = { kind: "split"; window: string; group: string } | { kind: "here"; group: string } | { kind: "window" }

interface Drag {
  lens: LensId
  start: { x: number; y: number }
  moved: boolean
  target?: Target
}

interface Actions {
  layout: Layout
  set: (next: (layout: Layout) => Layout) => void
  drag: Drag | undefined
  startDrag: (lens: LensId, event: React.PointerEvent) => void
}

/**
 * The prototype: the project's windows. With one window it fills the story; once a lens has a window of its own, the
 * story shows a screen for each window, side by side, the main window first.
 */
export function LensesPrototype({ initial }: { initial: Layout }) {
  const [layout, setLayout] = useState(initial)
  const [drag, setDrag] = useState<Drag>()
  const dragRef = useRef<Drag>(undefined)

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = dragRef.current

      if (!current) {
        return
      }

      const moved = current.moved || Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) > 4
      const next: Drag = { lens: current.lens, start: current.start, moved }
      const target = moved ? targetAt(event.clientX, event.clientY) : current.target

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

  const actions: Actions = {
    layout,
    set: setLayout,
    drag: drag?.moved ? drag : undefined,
    startDrag: (lens, event) => {
      if (event.button === 0) {
        const next = { lens, start: { x: event.clientX, y: event.clientY }, moved: false }
        dragRef.current = next
        setDrag(next)
      }
    }
  }

  const [main, ...others] = layout.windows
  const grabbing = drag?.moved ? "cursor-grabbing select-none" : ""

  if (others.length === 0) {
    return (
      <div className={`h-screen ${grabbing}`}>
        <WindowView win={main!} main actions={actions} />
      </div>
    )
  }

  return (
    <div
      className={`grid h-screen items-center gap-6 bg-muted p-6 ${grabbing}`}
      style={{ gridTemplateColumns: `repeat(${layout.windows.length}, minmax(0, 1fr))` }}
    >
      <Screen label="Screen 1">
        <WindowView win={main!} main actions={actions} />
      </Screen>
      {/* Each lens window on a screen of its own, so every one stays in view. */}
      {others.map((each, index) => (
        <Screen key={each.id} label={`Screen ${index + 2}`} wallpaper>
          <WindowView win={each} main={false} actions={actions} />
        </Screen>
      ))}
    </div>
  )
}

/** One screen on a desk, its window scaled to fit, as a person with several monitors has. */
function Screen({ label, children, wallpaper }: { label: string; children: ReactNode; wallpaper?: boolean }) {
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
    <figure className="flex flex-col gap-2">
      <div
        ref={box}
        className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border-8 border-neutral-800 bg-neutral-700"
        {...(wallpaper ? { "data-wallpaper": "" } : {})}
      >
        <div className="absolute top-0 left-0 origin-top-left" style={{ ...windowSize, transform: `scale(${scale})` }}>
          {children}
        </div>
      </div>
      <figcaption className="text-center text-xs text-muted-foreground">{label}</figcaption>
    </figure>
  )
}

function WindowView({ win, main, actions }: { win: LensWindow; main: boolean; actions: Actions }) {
  const focused = win.groups.find((one) => one.id === win.focused) ?? win.groups[0]!
  const newWindow = actions.drag?.target?.kind === "window" && main

  return (
    <div data-window={win.id} className="relative flex size-full flex-col bg-background text-foreground">
      <TitleBar main={main} lens={main ? undefined : focused.lens} />
      <div className="flex min-h-0 flex-1">
        <LensBar win={win} focused={focused} main={main} actions={actions} />
        <LeftPanel lens={focused.lens} actions={actions} />
        <div className="flex min-w-0 flex-1 divide-x border-x">
          {win.groups.map((one) => (
            <GroupView
              key={one.id}
              group={one}
              win={win}
              main={main}
              focused={one.id === focused.id}
              actions={actions}
            />
          ))}
        </div>
        <Inspector lens={focused.lens} group={focused.id} actions={actions} />
      </div>
      <div className="flex h-7 shrink-0 items-center gap-4 border-t px-3 text-xs text-muted-foreground">
        <span>Vite</span>
        <span>React</span>
        <span>TanStack Router</span>
      </div>
      {newWindow && (
        <div className="pointer-events-none absolute inset-0 grid place-items-end border-4 border-primary p-6">
          <span className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
            Open in a new window
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * The window's own bar: the menu and the project, with no tabs, since a window has one project. The project's menu
 * opens another in its place. A lens's own window names its lens beside the project.
 */
function TitleBar({ main, lens }: { main: boolean; lens: LensId | undefined }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-neutral-100 px-2 dark:bg-[#0a0a0a]">
      {main && (
        <span className="grid size-8 place-items-center text-muted-foreground" aria-hidden>
          <Menu className="size-4" />
        </span>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={project}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-sm font-medium hover:bg-accent"
            />
          }
        >
          {project}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem>Open project…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Recent</DropdownMenuLabel>
            <DropdownMenuItem>copacker</DropdownMenuItem>
            <DropdownMenuItem>blank-slate</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Close project</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {lens && <span className="text-sm text-muted-foreground">{lenses[lens].label}</span>}
      <span className="ml-auto grid size-7 place-items-center rounded-full border text-muted-foreground">
        <UserRound className="size-4" />
      </span>
    </div>
  )
}

/**
 * The lenses, one above another down the window's left edge, as VS Code's activity bar lists its views. The lens in
 * focus is marked; one shown in another group of the window has a dot. Click to show it, right-click to split it or
 * move it to a window of its own, or drag it onto a canvas.
 */
function LensBar({
  win,
  focused,
  main,
  actions
}: {
  win: LensWindow
  focused: LensGroup
  main: boolean
  actions: Actions
}) {
  const shownHere = new Set(win.groups.map((one) => one.lens))

  return (
    <nav aria-label="Lenses" className="flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2">
      {Object.values(lenses).map(({ id, label, icon: Icon }) => {
        const current = focused.lens === id

        return (
          <ContextMenu key={id}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <ContextMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={label}
                        aria-current={current ? "page" : undefined}
                        onPointerDown={(event) => actions.startDrag(id, event)}
                        onClick={() => actions.set((layout) => showLens(layout, win.id, id))}
                        className={`relative grid size-9 place-items-center rounded-md ${
                          current ? "text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        } ${actions.drag?.lens === id ? "opacity-50" : ""}`}
                      >
                        {current && <span className="absolute inset-y-1.5 -left-1.5 w-0.5 rounded bg-foreground" />}
                        <Icon className="size-5" />
                        {!current && shownHere.has(id) && (
                          <span className="absolute right-1.5 bottom-1.5 size-1.5 rounded-full bg-muted-foreground" />
                        )}
                      </button>
                    }
                  />
                }
              />
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
            <ContextMenuContent className="w-52">
              <ContextMenuItem onClick={() => actions.set((layout) => showLens(layout, win.id, id))}>
                Show
              </ContextMenuItem>
              <ContextMenuItem onClick={() => actions.set((layout) => splitRight(layout, id, win.id))}>
                Split right
              </ContextMenuItem>
              {main ? (
                <ContextMenuItem onClick={() => actions.set((layout) => toNewWindow(layout, id))}>
                  Move to new window
                </ContextMenuItem>
              ) : (
                <ContextMenuItem onClick={() => actions.set((layout) => toMainWindow(layout, id))}>
                  Move to main window
                </ContextMenuItem>
              )}
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="mt-auto grid size-9 place-items-center text-muted-foreground/50">
              <missingLens.icon className="size-5" />
            </span>
          }
        />
        <TooltipContent side="right">
          {missingLens.label}: {missingLens.source}
        </TooltipContent>
      </Tooltip>
    </nav>
  )
}

function GroupView({
  group,
  win,
  main,
  focused,
  actions
}: {
  group: LensGroup
  win: LensWindow
  main: boolean
  focused: boolean
  actions: Actions
}) {
  const target = actions.drag?.target
  const splitting = target?.kind === "split" && target.group === group.id
  const here = target?.kind === "here" && target.group === group.id
  const { label, icon: Icon } = lenses[group.lens]
  const closable = win.groups.length > 1 || !main

  return (
    <section
      aria-label={`${label} lens`}
      className="relative flex min-w-0 flex-1 flex-col"
      onPointerDownCapture={() => actions.set((layout) => focus(layout, group.id))}
      onFocusCapture={() => {
        if (!focused) {
          actions.set((layout) => focus(layout, group.id))
        }
      }}
    >
      {win.groups.length > 1 && (
        <div
          className={`flex h-8 shrink-0 items-center gap-2 border-b px-3 text-sm ${focused ? "text-foreground" : "text-muted-foreground"}`}
        >
          <Icon className="size-4" />
          {label}
          <span className="ml-auto flex items-center">
            {closable && (
              <button
                type="button"
                aria-label={`Close ${label}`}
                onClick={() => actions.set((layout) => closeGroup(layout, group.id))}
                className="grid size-6 place-items-center rounded hover:bg-accent"
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        </div>
      )}
      <Canvas lens={group.lens} groupId={group.id} actions={actions} />
      {(splitting || here) && (
        <div
          className={`pointer-events-none absolute top-0 bottom-0 rounded-sm bg-primary/15 ring-2 ring-primary ring-inset ${
            splitting ? "right-0 w-1/2" : "inset-x-0"
          }`}
        />
      )}
    </section>
  )
}

/** The left panel shows the focused group's lens: its pages, components, stories or tables. */
function LeftPanel({ lens, actions }: { lens: LensId; actions: Actions }) {
  const { label } = lenses[lens]
  const selected = actions.layout.selected[lens]

  const row = (item: Item, level = item.level ?? 0) => (
    <button
      key={item.id}
      type="button"
      role="treeitem"
      aria-selected={selected === item.id}
      onClick={() => actions.set((layout) => select(layout, lens, item.id))}
      className={`flex h-7 w-full items-center gap-2 rounded-md pr-2 text-left text-sm ${
        selected === item.id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted/50"
      }`}
      style={{ paddingLeft: 8 + level * 16 }}
    >
      {item.name}
    </button>
  )

  return (
    <aside aria-label={label} className="flex w-60 shrink-0 flex-col">
      <div className="flex h-9 shrink-0 items-center px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div role="tree" aria-label={label} className="flex flex-col gap-px overflow-auto px-2">
        {lens === "stories"
          ? Object.entries(storyFiles).map(([file, ids]) => (
              <div key={file} className="flex flex-col gap-px">
                <span className="flex h-7 items-center px-2 text-sm">{file}</span>
                {ids.map((id) => row(items.stories.find((item) => item.id === id)!))}
              </div>
            ))
          : items[lens].map((item) => row(item))}
      </div>
    </aside>
  )
}

/** The lens's canvas: its frames, or its tables for Data, each selectable. */
function Canvas({ lens, groupId, actions }: { lens: LensId; groupId: string; actions: Actions }) {
  const selected = actions.layout.selected[lens]
  const scale = lens === "pages" ? 0.62 : 0.7

  return (
    <div
      data-canvas={groupId}
      className="relative min-h-0 flex-1 overflow-hidden bg-background [background-image:radial-gradient(var(--border)_1px,transparent_0)] [background-size:20px_20px]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          actions.set((layout) => select(layout, lens, undefined))
        }
      }}
    >
      <div className="absolute top-12 left-12 origin-top-left" style={{ transform: `scale(${scale})` }}>
        {lens === "data" && <Relations />}
        {items[lens].map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selected === item.id}
            onClick={() => actions.set((layout) => select(layout, lens, item.id))}
            className="absolute flex flex-col gap-1.5 text-left"
            style={{ left: item.at.x, top: item.at.y, width: item.at.width }}
          >
            <span className="text-sm text-muted-foreground">{item.name}</span>
            {lens === "data" ? (
              <Table name={item.id} selected={selected === item.id} />
            ) : (
              <img
                src={item.picture}
                alt=""
                draggable={false}
                className={`w-full rounded-sm bg-background shadow-sm ${selected === item.id ? "ring-2 ring-primary" : ""}`}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function Table({ name, selected }: { name: string; selected: boolean }) {
  return (
    <span
      className={`flex w-full flex-col overflow-hidden rounded-md border bg-background text-sm shadow-sm ${selected ? "ring-2 ring-primary" : ""}`}
    >
      {(Object.entries(columns).find(([table]) => table === name)?.[1] ?? []).map((column) => (
        <span key={column.name} className="flex justify-between gap-4 border-t px-3 py-1.5 first:border-t-0">
          <span>{column.name}</span>
          <span className="text-muted-foreground">{column.type}</span>
        </span>
      ))}
    </span>
  )
}

/** The lines between a column and the table it refers to. */
function Relations() {
  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 overflow-visible text-muted-foreground"
      width={1}
      height={1}
      aria-hidden
    >
      <path d="M 220 128 C 270 128 270 37 320 37" fill="none" stroke="currentColor" strokeWidth={1.5} />
      <path d="M 60 222 L 60 146" fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}

/** The inspector follows the focused group: what's selected in its lens, and what it links to in the others. */
function Inspector({ lens, group, actions }: { lens: LensId; group: string; actions: Actions }) {
  const item = items[lens].find((one) => one.id === actions.layout.selected[lens])

  return (
    <aside aria-label="Inspector" className="flex w-72 shrink-0 flex-col">
      <div className="flex h-9 shrink-0 items-center px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Inspector
      </div>
      {item ? (
        <div className="flex flex-col gap-4 px-3 text-sm">
          <div className="font-medium">{item.name}</div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {item.facts.map(([name, value]) => (
              <div key={name} className="contents">
                <dt className="text-muted-foreground">{name}</dt>
                <dd className="min-w-0 truncate">{value}</dd>
              </div>
            ))}
          </dl>
          {item.links && item.links.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Linked</span>
              {item.links.map((link) => {
                const linked = items[link.lens].find((one) => one.id === link.id)!
                const { icon: Icon, label } = lenses[link.lens]

                return (
                  <div key={`${link.lens}-${link.id}`} className="flex items-center">
                    <button
                      type="button"
                      onClick={() =>
                        actions.set((layout) => select(showIn(layout, link.lens, group), link.lens, link.id))
                      }
                      className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left hover:bg-muted/50"
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="flex-1">{linked.name}</span>
                      <span className="text-xs text-muted-foreground">{label}</span>
                    </button>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            aria-label={`Open ${linked.name} to the side`}
                            onClick={() =>
                              actions.set((layout) => {
                                const win = layout.windows.find((each) => each.groups.some((one) => one.id === group))!

                                return select(splitRight(layout, link.lens, win.id, group), link.lens, link.id)
                              })
                            }
                            className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted/50"
                          >
                            <Columns2 className="size-4" />
                          </button>
                        }
                      />
                      <TooltipContent>Open to the side</TooltipContent>
                    </Tooltip>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <p className="px-3 text-sm text-muted-foreground">Nothing selected</p>
      )}
    </aside>
  )
}

/** What's under the pointer while a lens is dragged from the lens bar. */
function targetAt(x: number, y: number): Target | undefined {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!(element instanceof HTMLElement)) {
      continue
    }

    // The window's right or bottom edge, whatever is drawn there: inspector, status bar or canvas.
    const winElement = element.closest<HTMLElement>("[data-window]")

    if (winElement) {
      const win = winElement.getBoundingClientRect()

      if (Math.min(win.right - x, win.bottom - y) < 16 * (win.width / windowSize.width)) {
        return { kind: "window" }
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
      return { kind: "window" }
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
