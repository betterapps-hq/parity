import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { House, Menu, Plus, UserRound, X } from "lucide-react"
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { columns, type Item, items, lenses, missingLens, storyFiles } from "./data.ts"
import {
  close,
  find,
  type Layout,
  type LensGroup,
  type LensId,
  type LensWindow,
  place,
  select,
  show,
  splitRight,
  toMainWindow,
  toNewWindow
} from "./model.ts"

const windowSize = { width: 1440, height: 900 }

/** Where a dragged lens tab would go if let go now. */
type Target =
  | { kind: "tab"; group: string; index: number }
  | { kind: "split"; group: string }
  | { kind: "here"; group: string }
  | { kind: "window" }

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
 * The prototype: a project's windows, each with its lens groups. With one window it fills the story; once a lens has
 * a window of its own, the story shows two screens side by side, the main window on the left and the others on the
 * right.
 */
export function LensesPrototype({ initial }: { initial: Layout }) {
  const [layout, setLayout] = useState(initial)
  const [drag, setDrag] = useState<Drag>()
  const dragRef = useRef<Drag>(undefined)

  useEffect(() => {
    dragRef.current = drag
  }, [drag])

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

  if (others.length === 0) {
    return (
      <div className={`h-screen ${drag?.moved ? "cursor-grabbing select-none" : ""}`}>
        <WindowView win={main!} main actions={actions} />
      </div>
    )
  }

  return (
    <div
      className={`grid h-screen grid-cols-2 items-center gap-6 bg-muted p-6 ${drag?.moved ? "cursor-grabbing select-none" : ""}`}
    >
      <Screen label="Screen 1">
        <WindowView win={main!} main actions={actions} />
      </Screen>
      <Screen label="Screen 2" wallpaper>
        {others.map((each) => (
          <WindowView key={each.id} win={each} main={false} actions={actions} />
        ))}
      </Screen>
    </div>
  )
}

/** One of two screens on a desk, its window scaled to fit, as a person with two monitors has. */
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
  const lens = focused.shown
  const newWindow = actions.drag?.target?.kind === "window" && main

  return (
    <div data-window={win.id} className="relative flex size-full flex-col bg-background text-foreground">
      <TitleBar main={main} />
      <div className="flex min-h-0 flex-1">
        <LeftPanel lens={lens} actions={actions} />
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
        <Inspector lens={lens} group={focused.id} actions={actions} />
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

/** The window's own bar, as today: the menu, Home and the project's tab. A lens's own window has just its project. */
function TitleBar({ main }: { main: boolean }) {
  return (
    <div className="flex h-10 shrink-0 items-end gap-0.5 border-b bg-neutral-100 pr-2 pl-2 dark:bg-[#0a0a0a]">
      {main && (
        <>
          <span className="mb-1 grid size-8 place-items-center text-muted-foreground" aria-hidden>
            <Menu className="size-4" />
          </span>
          <span className="grid h-8 w-10 place-items-center text-muted-foreground" aria-hidden>
            <House className="size-4" />
          </span>
        </>
      )}
      <span className="relative flex h-8 w-56 items-center gap-2 rounded-t-lg border border-b-0 bg-background px-3 text-sm">
        shadcn-vite
        <span className="absolute inset-x-0 -bottom-px h-px bg-background" />
      </span>
      <span className="mb-1 ml-auto grid size-7 place-items-center rounded-full border text-muted-foreground">
        <UserRound className="size-4" />
      </span>
    </div>
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

  return (
    <section
      aria-label={`${lenses[group.shown].label} lens`}
      className="relative flex min-w-0 flex-1 flex-col"
      onPointerDownCapture={() =>
        actions.set((layout) => ({
          ...layout,
          windows: layout.windows.map((each) => (each.id === win.id ? { ...each, focused: group.id } : each))
        }))
      }
    >
      <div
        role="tablist"
        aria-label="Lenses"
        data-strip={group.id}
        className="flex h-9 shrink-0 items-end gap-0.5 border-b bg-muted/50 px-1"
      >
        {group.lenses.map((lens, index) => (
          <LensTab
            key={lens}
            lens={lens}
            index={index}
            group={group}
            selected={lens === group.shown}
            focused={focused}
            main={main}
            actions={actions}
          />
        ))}
        <AddLens group={group} actions={actions} />
      </div>
      <Canvas lens={group.shown} groupId={group.id} actions={actions} />
      {(splitting || here) && (
        <div
          className={`pointer-events-none absolute top-9 bottom-0 rounded-sm bg-primary/15 ring-2 ring-primary ring-inset ${
            splitting ? "right-0 w-1/2" : "inset-x-0"
          }`}
        />
      )}
    </section>
  )
}

function LensTab({
  lens,
  index,
  group,
  selected,
  focused,
  main,
  actions
}: {
  lens: LensId
  index: number
  group: LensGroup
  selected: boolean
  focused: boolean
  main: boolean
  actions: Actions
}) {
  const { label, icon: Icon } = lenses[lens]
  const target = actions.drag?.target
  const insertBefore = target?.kind === "tab" && target.group === group.id && target.index === index
  const dragging = actions.drag?.lens === lens

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            role="tab"
            tabIndex={0}
            aria-selected={selected}
            data-tab-index={index}
            onPointerDown={(event) => {
              actions.set((layout) => show(layout, lens))
              actions.startDrag(lens, event)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                actions.set((layout) => show(layout, lens))
              }
            }}
            className={`relative flex h-8 items-center gap-2 rounded-t-md border border-b-0 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selected
                ? `bg-background text-foreground ${focused ? "" : "text-muted-foreground"}`
                : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            } ${dragging ? "opacity-50" : ""}`}
          >
            {insertBefore && <span className="absolute inset-y-1 -left-1 w-0.5 rounded bg-primary" />}
            <Icon className="size-4" />
            {label}
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Close ${label}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => actions.set((layout) => close(layout, lens))}
              className="-mr-1 grid size-5 place-items-center rounded hover:bg-accent"
            >
              <X className="size-3.5" />
            </button>
            {selected && <span className="absolute inset-x-0 -bottom-px h-px bg-background" />}
          </div>
        }
      />
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => actions.set((layout) => splitRight(layout, lens))}>Split right</ContextMenuItem>
        {main ? (
          <ContextMenuItem onClick={() => actions.set((layout) => toNewWindow(layout, lens))}>
            Move to new window
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={() => actions.set((layout) => toMainWindow(layout, lens))}>
            Move to main window
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => actions.set((layout) => close(layout, lens))}>Close</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Opens a lens the project has, in this group. One already open elsewhere moves here. */
function AddLens({ group, actions }: { group: LensGroup; actions: Actions }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Open a lens"
                  className="mb-1 ml-1 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                />
              }
            >
              <Plus className="size-4" />
            </DropdownMenuTrigger>
          }
        />
        <TooltipContent>Open a lens</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-64">
        {Object.values(lenses).map(({ id, label, icon: Icon, source }) => {
          const where = find(actions.layout, id)

          return (
            <DropdownMenuItem key={id} onClick={() => actions.set((layout) => place(layout, id, group.id))}>
              <Icon />
              <span className="flex-1">{label}</span>
              <span className="text-xs text-muted-foreground">{where ? "Open" : source}</span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuItem disabled>
          <missingLens.icon />
          <span className="flex-1">{missingLens.label}</span>
          <span className="text-xs text-muted-foreground">{missingLens.source}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
    <aside aria-label={label} className="flex w-64 shrink-0 flex-col">
      <div className="flex h-9 shrink-0 items-center border-b px-3 text-sm font-medium">{label}</div>
      <div role="tree" aria-label={label} className="flex flex-col gap-px overflow-auto p-2">
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
          actions.set((layout) => ({ ...layout, selected: { ...layout.selected, [lens]: undefined } }))
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
      <div className="flex h-9 shrink-0 items-center border-b px-3 text-sm font-medium">Inspector</div>
      {item ? (
        <div className="flex flex-col gap-4 p-3 text-sm">
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
                  <button
                    key={`${link.lens}-${link.id}`}
                    type="button"
                    onClick={() =>
                      actions.set((layout) => {
                        const opened = find(layout, link.lens) ? layout : place(layout, link.lens, group)

                        return select(show(opened, link.lens), link.lens, link.id)
                      })
                    }
                    className="flex h-7 items-center gap-2 rounded-md px-2 text-left hover:bg-muted/50"
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1">{linked.name}</span>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <p className="p-3 text-sm text-muted-foreground">Nothing selected</p>
      )}
    </aside>
  )
}

/** What's under the pointer while a lens tab is dragged. */
function targetAt(x: number, y: number): Target | undefined {
  const under = document.elementsFromPoint(x, y)

  for (const element of under) {
    if (!(element instanceof HTMLElement)) {
      continue
    }

    const strip = element.closest<HTMLElement>("[data-strip]")

    if (strip) {
      const tabs = [...strip.querySelectorAll<HTMLElement>("[data-tab-index]")]

      const index = tabs.findIndex((tab) => {
        const box = tab.getBoundingClientRect()

        return x < box.left + box.width / 2
      })

      return { kind: "tab", group: strip.dataset.strip!, index: index === -1 ? tabs.length : index }
    }

    const canvas = element.closest<HTMLElement>("[data-canvas]")

    if (canvas) {
      const box = canvas.getBoundingClientRect()
      const win = canvas.closest<HTMLElement>("[data-window]")!.getBoundingClientRect()
      const edge = Math.min(x - win.left, win.right - x, win.bottom - y)

      if (edge < 12 * (win.width / windowSize.width)) {
        return { kind: "window" }
      }

      return x > box.left + box.width * 0.6
        ? { kind: "split", group: canvas.dataset.canvas! }
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
    case "tab":
      return place(layout, lens, target.group, adjusted(layout, lens, target))
    case "split":
      return splitRight(layout, lens, target.group)
    case "here":
      return place(layout, lens, target.group)
    case "window":
      return toNewWindow(layout, lens)
  }
}

/** A tab moved later in its own row lands one place earlier, since it left its old place. */
function adjusted(layout: Layout, lens: LensId, target: { group: string; index: number }): number {
  const from = find(layout, lens)

  if (from?.group.id !== target.group) {
    return target.index
  }

  const at = from.group.lenses.indexOf(lens)

  return at < target.index ? target.index - 1 : target.index
}
