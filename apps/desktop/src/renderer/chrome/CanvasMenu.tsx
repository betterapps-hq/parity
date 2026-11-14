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
} from "@buildkitgg/shadcn-baseui-kit"
import { type ElementSource, isInnerPath } from "@parity-app/core"
import { selectedDesigns, type Selection } from "@parity-app/editor"
import { CheckIcon, FileCode, Layers } from "lucide-react"
import { type ComponentProps, type ReactElement, useEffect, useRef, useState } from "react"
import { pasteAtPointer } from "../canvas/clipboard.ts"
import { useProject } from "../canvas/context.ts"
import { frameAt, shortSource, sourcedElementAt } from "../canvas/element-sources.ts"
import { onGestureEnd } from "../canvas/gesture.ts"
import { hitTest, type Point, selectedIn, underPoint } from "../canvas/hit.ts"
import { DesignIcon, designColor, kindColors, NodeIcon, nodeColor } from "../canvas/kinds.tsx"
import { pickLayer } from "../canvas/pick.ts"
import { useContainerEntries, useNotes } from "../design-store.ts"
import { allFrames } from "../frame.ts"
import { useInteracting, useSelection } from "../selection.ts"
import type { ProjectSession } from "../workspace.ts"
import { actions, commandsFor } from "./actions.ts"
import { componentActions, runAction, selectionComponent } from "./adapter-actions.ts"
import { AdapterLogo } from "./AdapterLogo.tsx"
import { canvasMenu, type LayerChoice, type MenuAction, type MenuTarget, rightClickSelection } from "./canvas-menu.ts"
import { openSource } from "./code-editor.ts"
import { iconFor } from "./command-icons.ts"
import { createDesign } from "./create.ts"

type TriggerProps = ComponentProps<typeof ContextMenuTrigger>

/** Where the menu opened: the pointer, and the design under it, if any. */
export interface Opened {
  point: Point
  target?: MenuTarget
}

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
 * from the keymap (see `canvasMenu`). On the canvas around designs it offers New screen and New component, made where
 * it was right-clicked, Insert, Paste here, Select all and Zoom to fit.
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
    if (!area) {
      return undefined
    }

    const onPointerDown = (event: PointerEvent) => {
      press.current =
        event.button === 2
          ? { target: event.target, selection: session.selection.get(), deep: event.ctrlKey || event.metaKey }
          : undefined
    }

    area.addEventListener("pointerdown", onPointerDown, { capture: true })

    return () => area.removeEventListener("pointerdown", onPointerDown, { capture: true })
  }, [area, session])

  const onContextMenu: TriggerProps["onContextMenu"] = (event) => {
    // tldraw keeps the system's menu from a right-click on the canvas; its own event follows when the button comes up.
    // The menu would open for either, so the first is kept from it.
    if (event.defaultPrevented) {
      event.preventBaseUIHandler()

      return
    }

    // From the pointer, the press this right-click began with, which a release from elsewhere doesn't have; from the
    // keyboard, there's none.
    const pressed = event.button === 2 ? press.current : undefined
    press.current = undefined
    const from = event.button === 2 ? pressed?.target : event.target

    if (session.selection.getTool() === "interact" || !from || !onCanvas(from)) {
      // Nothing opens: not from a control drawn on the canvas, nor while interacting.
      event.preventDefault()
      event.preventBaseUIHandler()

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

    const source = under && elementSourceAt(event.currentTarget, point)
    setOpened({ point, target: under && (source ? { ...under.target, source } : under.target) })
  }

  // A right-click on the canvas while the menu is open opens it again there, as in Figma. The open menu lays a backdrop
  // over the page, so tldraw never hears of the press: the menu stays open, and when the button comes up the canvas
  // under the backdrop gets the `contextmenu` tldraw would have sent, which moves the menu to the press. Anywhere else,
  // the press closes the menu.
  const reopensOnCanvas = (event: Event): boolean => {
    if (!(event instanceof MouseEvent) || event.button !== 2 || !area) {
      return false
    }

    const from = underBackdrop(event)

    if (!from || !area.contains(from) || !onCanvas(from)) {
      return false
    }

    const selection = session.selection.get()
    const deep = event.ctrlKey || event.metaKey
    onGestureEnd(window, (how) => {
      if (how !== "release") {
        return
      }

      // What Select layer outlined goes with the menu it was in.
      session.selection.setHover(undefined)
      press.current = { target: from, selection, deep }
      from.dispatchEvent(
        new PointerEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: event.clientX,
          clientY: event.clientY,
          button: 2,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey
        })
      )
    })

    return true
  }

  return (
    <ContextMenu
      disabled={interacting}
      onOpenChange={(open, details) => {
        if (!open && details.reason === "outside-press" && reopensOnCanvas(details.event)) {
          details.cancel()

          return
        }

        // Select layer outlines the layer an entry names; nothing stays outlined once the menu closes.
        if (!open) {
          session.selection.setHover(undefined)
        }
      }}
    >
      <ContextMenuTrigger ref={setArea} onContextMenu={onContextMenu} render={children} />
      {/* As wide as its longest item, so New component and its keys stay on one line. */}
      <ContextMenuContent className="min-w-60 [&_[role=menuitem]]:whitespace-nowrap" aria-label="Canvas">
        {opened && <CanvasMenuItems opened={opened} />}
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** Where the element a project file wrote under a point is written, inside whichever frame is there (PAR-167). */
function elementSourceAt(area: Element, point: Point): ElementSource | undefined {
  const host = frameAt(allFrames(area), point.x, point.y)

  return host && sourcedElementAt(host, point.x, point.y)?.source
}

/**
 * What a press on the open menu's backdrop would have reached without it: the element under the backdrop at the
 * pointer. Undefined when the press wasn't on something hit testing finds there.
 */
function underBackdrop(event: MouseEvent): Element | undefined {
  const stack = document.elementsFromPoint(event.clientX, event.clientY)
  const at = event.target instanceof Element ? stack.indexOf(event.target) : -1

  return at === -1 ? undefined : stack[at + 1]
}

/** The menu's items, for what's selected now, which the right-click has just set. */
export function CanvasMenuItems({ opened }: { opened: Opened }) {
  const session = useProject()
  const selection = useSelection(session.selection)
  const entries = useContainerEntries(session.store)
  // Select all and Zoom to fit have something to act on once the canvas holds a note.
  useNotes(session.store)
  // Over a code component's layer or board, what the project's adapters offer for it ends the menu, as in Layers.
  const component = opened.target && selectionComponent(session)
  const offered = componentActions(session.info, component)

  const items = canvasMenu(opened.target, commandsFor(session), selection, entries, session.info.libraries).map(
    (entry, index) => {
      if (entry.kind === "separator") {
        return <ContextMenuSeparator key={`line-${index}`} />
      }

      if (entry.kind === "open-source") {
        return (
          <ContextMenuItem key="open-source" onClick={() => void openSource(session.info, entry.source)}>
            <FileCode />
            {entry.label}
            <ContextMenuShortcut className="font-mono">{shortSource(entry.source)}</ContextMenuShortcut>
          </ContextMenuItem>
        )
      }

      if (entry.kind === "select-layer") {
        return opened.target ? (
          <SelectLayer key="select-layer" label={entry.label} choices={entry.choices} target={opened.target} />
        ) : null
      }

      const icon = iconFor(entry.action)

      return (
        <ContextMenuItem
          key={entry.action}
          disabled={!entry.enabled}
          onClick={() => run(session, entry.action, opened.point)}
        >
          {icon}
          {entry.label}
          {entry.keys && <ContextMenuShortcut>{entry.keys}</ContextMenuShortcut>}
        </ContextMenuItem>
      )
    }
  )

  return offered.length === 0
    ? items
    : [
        ...items,
        <ContextMenuSeparator key="adapters-line" />,
        ...offered.map((action) => (
          <ContextMenuItem
            key={`${action.adapter}:${action.id}`}
            onClick={() => void runAction(session.id, action, component)}
          >
            <AdapterLogo logo={action.icon} />
            {action.name}
          </ContextMenuItem>
        ))
      ]
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
      <ContextMenuSubTrigger>
        <Layers /> {label}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="max-h-96 w-56 overflow-y-auto" aria-label={label}>
        {choices.map((choice) => (
          <ContextMenuItem
            key={choice.id}
            onFocus={() => outline(choice)}
            onBlur={() => outline(undefined)}
            onClick={() =>
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

/** Runs an item: Paste here, New screen and New component where the menu opened, and the rest as the menubar does. */
function run(session: ProjectSession, action: MenuAction, point: Point): void {
  if (action === "pasteHere") {
    void pasteAtPointer(session, point)
  } else if ((action === "newScreen" || action === "newComponent") && session.editor) {
    const { editor } = session
    const kind = action === "newScreen" ? "screen" : "component"
    void actions[action].run("canvasMenu", {
      session,
      instead: () => void createDesign(session, kind, editor.screenToPage(point))
    })
  } else {
    void actions[action].run("canvasMenu", { session })
  }
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
  session: Pick<ProjectSession, "editor" | "store">,
  area: HTMLElement,
  point: Point,
  before: Selection,
  keys: { deep: boolean }
): { target: MenuTarget; clicked?: string; root?: string } | undefined {
  const { store, editor } = session

  if (!editor) {
    return undefined
  }

  const page = editor.screenToPage(point)

  const item = editor.getShapeAtPoint(page, { hitInside: true })?.type

  if (item === "canvas-note" || item === "canvas-reference") {
    return undefined
  }

  const hit = hitTest(area, store, point, editor)

  // A locked design gets the empty canvas's menu, unless it's selected, from Layers (PAR-192).
  if (hit && hit.entry.container.locked && !selected(before, hit.entry.key)) {
    return undefined
  }

  if (hit) {
    return {
      target: { design: hit.entry.key, path: hit.path, mode: hit.mode, state: hit.state },
      clicked: pickLayer(underPoint(hit), selectedIn(hit, before), keys.deep),
      root: hit.entry.container.root.id
    }
  }

  const board = editor.getShapeAtPoint(page, {
    hitInside: true,
    hitLocked: true,
    filter: (container) =>
      container.type === "canvas-container" && (!container.isLocked || selected(before, container.props.key))
  })

  return board?.type === "canvas-container" ? { target: { design: board.props.key, path: [] } } : undefined
}

/** Whether a design, or a layer in it, is selected. */
function selected(current: Selection, design: string): boolean {
  return current.design === design || selectedDesigns(current).includes(design)
}
