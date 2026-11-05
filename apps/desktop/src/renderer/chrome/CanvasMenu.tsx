import { isInnerPath } from "@parity-app/core"
import { CheckIcon } from "lucide-react"
import { type MouseEvent as ReactMouseEvent, type ReactElement, useEffect, useRef, useState } from "react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import { pasteAtPointer } from "../canvas/clipboard.ts"
import { useProject } from "../canvas/context.ts"
import { onGestureEnd } from "../canvas/gesture-end.ts"
import { hitTest, type Point, selectedIn, underPoint } from "../canvas/hit.ts"
import { DesignIcon, designColor, kindColors, NodeIcon, nodeColor } from "../canvas/kinds.tsx"
import { pickLayer } from "../canvas/pick.ts"
import { useContainerEntries } from "../design-store.ts"
import { type Selection, useInteracting, useSelection } from "../selection.ts"
import type { ProjectSession } from "../workspace.ts"
import { actions } from "./actions.ts"
import { canvasMenu, type LayerChoice, type MenuAction, type MenuTarget, rightClickSelection } from "./canvas-menu.ts"

/** Where the menu opened: the pointer, and the design under it, if any. */
interface Opened {
  point: Point
  target?: MenuTarget
  /** Counts the times it opened, so opening it again while it's open draws it afresh at the new point. */
  count: number
}

/** A press outside an open menu, as Radix's menus report it. */
type OutsidePress = CustomEvent<{ originalEvent: PointerEvent }>

/**
 * The right button going down: where, the selection then, before tldraw selected the board under it, and whether Ctrl
 * was held.
 */
interface Press {
  target: EventTarget | null
  selection: Selection
  deep: boolean
}

/**
 * The canvas's right-click menu, around the canvas area. A right-click on a design selects what's under the pointer
 * first, unless that's inside the selection, then lists what can be done with the selection, each item with its keys
 * from the keymap (see `canvasMenu`). On the canvas around designs it offers Paste here, Select all and Zoom to fit.
 * While interacting, right-clicks are the designs', and nothing opens. A right-click on the canvas while it's open opens
 * it again at the new point, as in Figma.
 *
 * tldraw pans while the right button is dragged, so it keeps the system's menu from the press and opens this one when
 * the button comes up without panning, by sending a `contextmenu` of its own. It has selected the board under the
 * pointer by then, which is why the selection is read when the button goes down. It sends one for any release over the
 * canvas, even when a design's title kept the press for its own menu, so where the press began decides.
 */
export function CanvasMenu({ children }: { children: ReactElement }) {
  const session = useProject()
  const interacting = useInteracting(session.selection)
  const [area, setArea] = useState<HTMLElement | null>(null)
  const [opened, setOpened] = useState<Opened>()
  const press = useRef<Press>(undefined)

  useEffect(() => {
    if (!area) return undefined
    const onPointerDown = (event: PointerEvent) => {
      press.current =
        event.button === 2
          ? { target: event.target, selection: session.selection.get(), deep: event.ctrlKey || event.metaKey }
          : undefined
    }
    area.addEventListener("pointerdown", onPointerDown, { capture: true })
    return () => area.removeEventListener("pointerdown", onPointerDown, { capture: true })
  }, [area, session])

  const onContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    // tldraw keeps the system's menu from a right-click on the canvas; its own event follows when the button comes up.
    if (event.defaultPrevented) return
    // From the pointer, the press this right-click began with, which a release from elsewhere doesn't have; from the
    // keyboard, there's none.
    const pressed = event.button === 2 ? press.current : undefined
    press.current = undefined
    const from = event.button === 2 ? pressed?.target : event.target
    if (session.selection.getTool() === "interact" || !from || !onCanvas(from)) {
      // Nothing opens: not from a control drawn on the canvas, nor while interacting.
      event.preventDefault()
      return
    }
    const point = { x: event.clientX, y: event.clientY }
    const before = pressed?.selection ?? session.selection.get()
    const under = designUnder(session, event.currentTarget, point, before, { deep: pressed?.deep ?? false })
    // A selected layer's resize handle is part of the selection, though it reaches a little past the layer's box.
    const handle = from instanceof Element && !!from.closest(".resize-handle")
    if (under) {
      session.selection.set(handle ? before : rightClickSelection(before, under.target, under.clicked, under.root))
    }
    setOpened((last) => ({ point, target: under?.target, count: (last?.count ?? 0) + 1 }))
  }

  // A right-click on the canvas while the menu is open opens it again there, as in Figma. The open menu keeps pointer
  // events from the page, so tldraw never hears of the press: the menu stays open, and when the button comes up the
  // canvas gets the `contextmenu` tldraw would have sent, at the press. Anywhere else, the press closes the menu.
  const onPointerDownOutside = (event: OutsidePress) => {
    const pressed = event.detail.originalEvent
    if (pressed.button !== 2 || !area) return
    const point = { x: pressed.clientX, y: pressed.clientY }
    const from = elementAt(point)
    if (!from || !area.contains(from) || !onCanvas(from)) return
    event.preventDefault()
    const selection = session.selection.get()
    onGestureEnd(window, (how) => {
      if (how !== "release") return
      // What Select layer outlined goes with the menu it was in.
      session.selection.setHover(undefined)
      press.current = { target: from, selection, deep: pressed.ctrlKey || pressed.metaKey }
      from.dispatchEvent(
        new PointerEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          button: 2,
          ctrlKey: pressed.ctrlKey,
          metaKey: pressed.metaKey
        })
      )
    })
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        // Select layer outlines the layer an entry names; nothing stays outlined once the menu closes.
        if (!open) session.selection.setHover(undefined)
      }}
    >
      <ContextMenuTrigger asChild ref={setArea} disabled={interacting} onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      {/* Drawn afresh each time it opens, so opening it again while it's open puts it at the new point. */}
      <ContextMenuContent
        key={opened?.count}
        className="w-60"
        aria-label="Canvas"
        onPointerDownOutside={onPointerDownOutside}
      >
        {opened && <MenuItems opened={opened} />}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/**
 * The element under a point while a menu is open. The menu keeps pointer events from the rest of the page by setting
 * the body's `pointer-events: none`, which hit testing respects, so this sets it back while it looks.
 */
function elementAt(point: Point): Element | null {
  const { style } = document.body
  const kept = style.pointerEvents
  style.pointerEvents = ""
  try {
    return document.elementFromPoint(point.x, point.y)
  } finally {
    style.pointerEvents = kept
  }
}

/** The menu's items, for what's selected now, which the right-click has just set. */
function MenuItems({ opened }: { opened: Opened }) {
  const session = useProject()
  const selection = useSelection(session.selection)
  const entries = useContainerEntries(session.store)
  return canvasMenu(opened.target, selection, entries).map((entry, index) => {
    if (entry.kind === "separator") return <ContextMenuSeparator key={`line-${index}`} />
    if (entry.kind === "select-layer") {
      return opened.target ? (
        <SelectLayer key="select-layer" label={entry.label} choices={entry.choices} target={opened.target} />
      ) : null
    }
    return (
      <ContextMenuItem
        key={entry.action}
        disabled={!entry.enabled}
        onSelect={() => run(session, entry.action, opened.point)}
      >
        {entry.label}
        {entry.keys && <ContextMenuShortcut>{entry.keys}</ContextMenuShortcut>}
      </ContextMenuItem>
    )
  })
}

/**
 * Every layer under the pointer, outermost first. An entry being pointed at, or reached with the arrows, outlines its
 * layer on the canvas, in the frame that was right-clicked; choosing it selects it.
 */
function SelectLayer({ label, choices, target }: { label: string; choices: LayerChoice[]; target: MenuTarget }) {
  const { selection } = useProject()
  const frame = { mode: target.mode, state: target.state }
  const outline = (choice: LayerChoice | undefined) =>
    selection.setHover(choice && { design: target.design, node: choice.id, ...frame })
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>{label}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="max-h-96 w-56 overflow-y-auto" aria-label={label}>
        {choices.map((choice) => (
          <ContextMenuItem
            key={choice.id}
            onFocus={() => outline(choice)}
            onBlur={() => outline(undefined)}
            onSelect={() =>
              selection.set(
                choice.whole ? { design: target.design } : { design: target.design, node: choice.id, ...frame }
              )
            }
          >
            {choice.layer ? (
              <NodeIcon
                node={choice.layer}
                className="size-3.5"
                style={{ color: isInnerPath(choice.id) ? kindColors.component : nodeColor(choice.layer) }}
              />
            ) : (
              <DesignIcon kind={choice.kind} className="size-3.5" style={{ color: designColor(choice.kind) }} />
            )}
            <span className="min-w-0 flex-1 truncate">{choice.label}</span>
            {choice.selected && <CheckIcon className="size-3.5" aria-label="Selected" />}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}

function run(session: ProjectSession, action: MenuAction, point: Point): void {
  if (action === "pasteHere") void pasteAtPointer(session, point)
  else void actions[action].run()
}

/**
 * Whether a right-click landed on the canvas itself, or a selected layer's resize handle, rather than on a control drawn
 * over it: a design's title and its menus, a state's label, the toolbars or the text being edited.
 */
function onCanvas(target: EventTarget): boolean {
  return (
    target instanceof Element &&
    !!target.closest(".tl-container, .resize-handle") &&
    !target.closest(
      "button, input, textarea, select, a[href], [role=menuitem], [role=option], .design-title, .state-label, .text-editor"
    )
  )
}

/**
 * The design under a point: in one of its frames, with the layers there and what a click there would select (see
 * pick.ts), or around its frames. A text note on top is the canvas's, not the design's.
 */
function designUnder(
  session: ProjectSession,
  area: HTMLElement,
  point: Point,
  before: Selection,
  keys: { deep: boolean }
): { target: MenuTarget; clicked?: string; root?: string } | undefined {
  const { store, editor } = session
  if (!editor) return undefined
  const page = editor.screenToPage(point)
  if (editor.getShapeAtPoint(page, { hitInside: true })?.type === "canvas-note") return undefined
  const hit = hitTest(area, store, point, editor)
  if (hit) {
    return {
      target: { design: hit.entry.key, path: hit.path, mode: hit.mode, state: hit.state },
      clicked: pickLayer(underPoint(hit), selectedIn(hit, before), keys.deep),
      root: hit.entry.container.root.id
    }
  }
  const board = editor.getShapeAtPoint(page, { hitInside: true, filter: (shape) => shape.type === "canvas-container" })
  return board?.type === "canvas-container" ? { target: { design: board.props.key, path: [] } } : undefined
}
