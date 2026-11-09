import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Kbd,
  Separator,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { framePresets } from "@parity-app/editor"
import {
  Accessibility,
  AppWindow,
  ChevronDown,
  CodeXml,
  Component,
  Frame,
  Hand,
  Maximize,
  MessageCircle,
  Minus,
  MousePointer2,
  MousePointerClick,
  SquarePlus,
  Plus,
  Search,
  SquareMousePointer,
  Type
} from "lucide-react"
import { type CSSProperties, Fragment, type ReactElement, type ReactNode, useEffect, useState } from "react"
import { useValue } from "tldraw"
import { useProject } from "../../canvas/context.ts"
import { placeFrame } from "../../canvas/frame-tool.ts"
import { actions } from "../../chrome/actions.ts"
import { type Command, keymap } from "../../chrome/keymap.ts"
import { formatKeys } from "../../chrome/keys.ts"
import { ModeViewportIcon } from "../../chrome/viewports.tsx"
import { useContainerEntry, useModeSettings } from "../../design-store.ts"
import { type Tool, useSelection, useTool } from "../../selection.ts"

/*
 * Options for the floating toolbar (PAR-780). Each one runs the app's own commands on the real canvas, so tools pick,
 * Insert opens the picker, and zoom and history act on the example.
 *
 * What's fixed in all of them: the separators run the bar's full height (the app's set `h-5` over the kit's
 * `self-stretch`), the picked tool keeps its rounded corners (the app's `spacing={0}` squares the inner ones) and is
 * picked out in the selection blue rather than a solid white block, and Hand shares a button with Move and select.
 */

export type ToolbarOption = "tidied" | "one-bar" | "review"

const toolIcons: Record<Tool, typeof Hand> = {
  select: MousePointer2,
  hand: Hand,
  frame: Frame,
  text: Type,
  interact: SquareMousePointer
}

/**
 * What the pointer does, then making things. Move and select, Hand and Interact share a button, as Figma's Move holds
 * Hand and Scale: it shows whichever was picked last, and the menu beside it switches. V, H and I still pick each, and
 * Space still pans.
 */
const toolGroups = [["move"], ["frame", "text"]] as const

/** The tools that decide what the pointer does, in the Move menu's order. */
const pointerTools = ["select", "hand", "interact"] as const

type PointerTool = (typeof pointerTools)[number]

const isPointerTool = (tool: Tool): tool is PointerTool => (pointerTools as readonly Tool[]).includes(tool)

/** The arrow that opens a tool's menu, beside its tool. */
const chevron = "-ml-0.5 h-full w-4 text-muted-foreground"

/**
 * A tool, 32px square as Figma's are, picked out in the canvas's selection blue at the step its chips use, so the white
 * icon on it reads at about 4.9:1, as tldraw and Figma pick theirs out in blue.
 */
const pickedTool =
  "size-8 min-w-8 px-0 aria-pressed:bg-(--canvas-layer-chip) aria-pressed:text-white aria-pressed:hover:bg-(--canvas-layer-chip)/90"

/** A label and the first of its keys, as every tooltip in the app shows them. */
function Tip({ command, label, children }: { command: Command; label?: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">
        {label ?? keymap[command].label} <Kbd>{formatKeys(keymap[command].keys[0]!)}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

/** A full-height line between groups. */
function Divider() {
  return <Separator orientation="vertical" className="mx-1" />
}

/** The bar itself, floating at the bottom of the canvas. */
function Bar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="toolbar"
      data-option
      aria-label={label}
      className="absolute bottom-4 left-1/2 z-[400] flex -translate-x-1/2 items-stretch gap-0.5 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {children}
    </div>
  )
}

/**
 * The tools as one group you move through with the arrow keys: Frame with its menu beside it, and Insert after Text,
 * since it makes things too.
 */
function Tools({ review = false }: { review?: boolean }) {
  const { selection } = useProject()
  const tool = useTool(selection)
  const [reviewing, setReviewing] = useState<ReviewTool>()
  const [lastReview, setLastReview] = useState<ReviewTool>("comment")
  // The kind of annotation picked last, which Shift+T annotates in.
  const [lastKind, setLastKind] = useState<AnnotationKind>("behaviour")

  // The tool picked before reviewing, which Done brings back.
  const [before, setBefore] = useState<Tool>()

  // While reviewing, the canvas is on Move and select, so a click can't draw a frame or add text underneath.
  const pickReview = (id: ReviewTool) => {
    if (!reviewing) {
      setBefore(tool)
    }

    setReviewing(id)
    setLastReview(id)

    if (id !== "comment") {
      setLastKind(id)
    }

    if (tool !== "select") {
      void actions.select.run("toolbar")
    }
  }

  const stopReview = () => {
    setReviewing(undefined)

    if (before && before !== "select") {
      void actions[before].run("toolbar")
    }

    setBefore(undefined)
  }

  // C comments and Shift+T annotates, while this bar has the review tools.
  useEffect(() => {
    if (!review) {
      return undefined
    }

    reviewKey = (key) => pickReview(key === "comment" ? "comment" : lastKind)

    return () => {
      reviewKey = undefined
    }
  })

  // The pointer tool picked last, kept while another tool is picked so the button still shows it.
  const [move, setMove] = useState<PointerTool>(isPointerTool(tool) ? tool : "select")

  if (isPointerTool(tool) && tool !== move) {
    setMove(tool)
  }

  // Reviewing keeps the canvas on Move and select, so another tool, picked by its key, ends reviewing.
  if (reviewing && tool !== "select") {
    setReviewing(undefined)
    setBefore(undefined)
  }

  return (
    <ToggleGroup
      spacing={1}
      value={[reviewing ?? tool]}
      onValueChange={([value]) => {
        if (value && isReviewTool(value)) {
          pickReview(value)
        } else if (value) {
          setReviewing(undefined)
          setBefore(undefined)
          void actions[value as Tool].run("toolbar")
        }
      }}
      aria-label="Tools"
      className="items-stretch gap-0.5"
    >
      {toolGroups.map((group, index) => (
        <Fragment key={group[0]}>
          {index > 0 && <Divider />}
          {group.map((slot) => {
            const id: Tool = slot === "move" ? move : slot
            const Icon = toolIcons[id]

            return (
              <Fragment key={slot}>
                <Tip command={id}>
                  <ToggleGroupItem value={id} aria-label={keymap[id].label} className={pickedTool}>
                    <Icon />
                  </ToggleGroupItem>
                </Tip>
                {slot === "move" && <MoveMenu current={move} />}
                {id === "frame" && <FrameMenu />}
                {id === "text" && <InsertButton />}
              </Fragment>
            )
          })}
        </Fragment>
      ))}
      {review && (
        <>
          <Divider />
          <ReviewTools current={lastReview} picked={reviewing} onPick={pickReview} onDone={stopReview} />
        </>
      )}
    </ToggleGroup>
  )
}

/**
 * The kinds of annotation, as PAR-184's design names, draws and colors them (its `categories`). Each is its own item in
 * the review menu, so picking one starts annotating in it.
 */
const annotationKinds = {
  behaviour: { label: "Behaviour", icon: MousePointerClick, hue: 250 },
  content: { label: "Content", icon: Type, hue: 150 },
  accessibility: { label: "Accessibility", icon: Accessibility, hue: 300 },
  development: { label: "Development", icon: CodeXml, hue: 60 }
} as const

type AnnotationKind = keyof typeof annotationKinds

/**
 * What the review button can be: Comment, or annotating in one of the kinds. The list is all that changes if Comment
 * waits for the comments service (PAR-372).
 */
type ReviewTool = "comment" | AnnotationKind

const isReviewTool = (value: string): value is ReviewTool => value === "comment" || value in annotationKinds

/** How a review tool is named and drawn on the button, in its tooltip and in the bar above the toolbar. */
function reviewSpec(tool: ReviewTool) {
  if (tool === "comment") {
    return {
      label: "Comment",
      doing: "Commenting",
      keys: "C",
      icon: MessageCircle,
      color: "currentColor",
      hint: "Click anywhere to start a thread"
    }
  }

  const kind = annotationKinds[tool]

  return {
    label: `${kind.label} annotation`,
    doing: `Annotating ${kind.label.toLowerCase()}`,
    keys: "Shift T",
    icon: kind.icon,
    color: `oklch(0.7 0.15 ${kind.hue})`,
    hint: "Click a layer to annotate it"
  }
}

/**
 * The review button and its menu, from PAR-184's annotations design, and while one is picked, a bar just above the
 * toolbar saying what a click does, with Done. The menu lists Comment first, then each kind of annotation; the button
 * shows the one picked last, in its kind's color, and starts on Comment. Shift+T annotates in the kind picked last. A
 * click on the canvas only selects here; placing annotations and threads is the Annotations exploration's.
 */
function ReviewTools({
  current,
  picked,
  onPick,
  onDone
}: {
  current: ReviewTool
  picked: ReviewTool | undefined
  onPick: (id: ReviewTool) => void
  onDone: () => void
}) {
  const { label, keys, icon: Icon, color } = reviewSpec(current)

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <ToggleGroupItem
              value={current}
              aria-label={label}
              className={`${pickedTool} text-(--kind)`}
              style={{ "--kind": color } as CSSProperties}
            >
              <Icon />
            </ToggleGroupItem>
          }
        />
        <TooltipContent side="top">
          {label} <Kbd>{formatKeys(keys)}</Kbd>
        </TooltipContent>
      </Tooltip>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-xs" aria-label="Comment or annotate" className={chevron} />}
        >
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-60">
          <DropdownMenuRadioGroup
            value={picked ?? current}
            onValueChange={(value) => {
              if (isReviewTool(value)) {
                onPick(value)
              }
            }}
          >
            <DropdownMenuRadioItem value="comment">
              <MessageCircle />
              Comment
              <DropdownMenuShortcut>{formatKeys("C")}</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center">
              Annotate
              <DropdownMenuShortcut>{formatKeys("Shift T")}</DropdownMenuShortcut>
            </DropdownMenuLabel>
            {(Object.keys(annotationKinds) as AnnotationKind[]).map((kind) => {
              const { label: name, icon: KindIcon } = annotationKinds[kind]

              return (
                <DropdownMenuRadioItem key={kind} value={kind}>
                  <KindIcon style={{ color: reviewSpec(kind).color }} />
                  {name}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {picked && <ReviewBar tool={picked} onDone={onDone} />}
    </>
  )
}

/** What Esc does while a review tool is picked, if one is. */
let escapeReview: (() => void) | undefined

/** What C and Shift+T do while a bar with the review tools is showing, if one is. */
let reviewKey: ((key: "comment" | "annotate") => void) | undefined

/** Whether a pointer is down, so a drag in progress keeps Esc to cancel it, as the canvas's shortcuts let it. */
let pointerHeld = false

window.addEventListener("pointerdown", () => (pointerHeld = true), { capture: true })

window.addEventListener("pointerup", () => (pointerHeld = false), { capture: true })

window.addEventListener("pointercancel", () => (pointerHeld = false), { capture: true })

/** Whether the canvas in view is on Interact. Other projects' tabs stay mounted, hidden, with their own tools. */
function interacting(): boolean {
  const shown = [...document.querySelectorAll<HTMLElement>(".canvas-area")].find((area) => !area.closest("[hidden]"))

  return shown?.dataset.tool === "interact"
}

/*
 * The canvas's shortcuts take keys on the window while they're captured, and stop them there. Listening from when this
 * module loads, before the app's window draws, puts this ahead of them, so Esc puts a review tool down rather than
 * stepping back through the selection, and C and Shift+T pick the review tools, which aren't in the keymap yet.
 */
window.addEventListener(
  "keydown",
  (event) => {
    // An open menu, picker or dialog takes Esc first, as the canvas's shortcuts let it.
    const target = event.target instanceof Element ? event.target : undefined
    const inOverlay = !!target?.closest("[role=menu], [role=listbox], [role=dialog]")

    if (event.key === "Escape" && escapeReview && !inOverlay && !pointerHeld) {
      event.stopImmediatePropagation()
      escapeReview()

      return
    }

    // Typing, and Interact, where keys are the designs', keep C and T.
    const typing = !!target?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")

    if (!reviewKey || inOverlay || typing || interacting() || event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    const comment = event.code === "KeyC" && !event.shiftKey
    const annotate = event.code === "KeyT" && event.shiftKey

    if (comment || annotate) {
      event.preventDefault()
      event.stopImmediatePropagation()
      reviewKey(comment ? "comment" : "annotate")
    }
  },
  { capture: true }
)

/** What a click does while a review tool is picked, and the way out, which Esc takes too. */
function ReviewBar({ tool, onDone }: { tool: ReviewTool; onDone: () => void }) {
  const { doing, hint, icon: Icon, color } = reviewSpec(tool)

  useEffect(() => {
    escapeReview = onDone

    return () => {
      escapeReview = undefined
    }
  }, [onDone])

  return (
    <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-popover p-1 pl-3 text-sm whitespace-nowrap text-popover-foreground shadow-lg">
      <Icon className="size-4" style={{ color }} />
      <span className="font-medium">{doing}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <Button size="xs" variant="secondary" onClick={onDone}>
        Done <Kbd>{formatKeys("Esc")}</Kbd>
      </Button>
    </div>
  )
}

/** The arrow beside Move and select, and its menu: Move and select, Hand, or Interact. */
function MoveMenu({ current }: { current: PointerTool }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-xs" aria-label="Move and select, Hand or Interact" className={chevron} />
        }
      >
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-56">
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => void actions[value as PointerTool].run("toolbar")}
        >
          {pointerTools.map((id) => {
            const Icon = toolIcons[id]

            return (
              <DropdownMenuRadioItem key={id} value={id}>
                <Icon />
                {keymap[id].label}
                <DropdownMenuShortcut>{formatKeys(keymap[id].keys[0])}</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">Or hold Space and drag to pan with any tool.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Insert, which opens the picker of components, icons and images at the pointer, as / does. */
function InsertButton() {
  return (
    <Tip command="insert">
      <Button
        variant="ghost"
        size="icon"
        aria-label={keymap.insert.label}
        onClick={() => void actions.insert.run("toolbar")}
      >
        <SquarePlus />
      </Button>
    </Tip>
  )
}

/** The frame tool's menu, as in the app: the modes' sizes, then New screen and New component. */
function FrameMenu() {
  const session = useProject()
  const settings = useModeSettings(session.store)
  const selected = useSelection(session.selection)
  const entry = useContainerEntry(session.store, selected.design)
  const frame = entry?.container.kind === "frame" && !selected.node ? entry : undefined

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Frame sizes, New screen and New component"
            className={chevron}
          />
        }
      >
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{frame ? "Resize the frame to" : "Frame sizes from your modes"}</DropdownMenuLabel>
          {framePresets(settings).map((preset) => (
            <DropdownMenuItem
              key={`${preset.name} ${preset.width}`}
              className="items-start"
              onClick={() => placeFrame(session, preset, frame?.key)}
            >
              <ModeViewportIcon of={preset.mode} className="mt-0.5 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{preset.name}</span>
                <span className="truncate text-xs text-muted-foreground">{preset.modes.join(", ")}</span>
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {preset.width} × {preset.height}
              </span>
            </DropdownMenuItem>
          ))}
          <p className="px-2 pt-1 pb-1.5 text-xs text-muted-foreground">Or drag on the canvas for any size.</p>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void actions.newScreen.run("toolbar")}>
          <AppWindow />
          {keymap.newScreen.label}
          <DropdownMenuShortcut>{formatKeys(keymap.newScreen.keys[0])}</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void actions.newComponent.run("toolbar")}>
          <Component />
          {keymap.newComponent.label}
          <DropdownMenuShortcut>{formatKeys(keymap.newComponent.keys[0])}</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Zoom at the top right, as today without Undo and Redo, which the Edit menu and their keys cover: zoom out, the level
 * (which goes to 100%), zoom in and zoom to fit.
 */
function ZoomCorner() {
  const { editor } = useProject()
  const zoom = useValue("zoom", () => editor?.getZoomLevel() ?? 1, [editor])

  const button = (command: Command, children: ReactNode) => (
    <Tip command={command}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={keymap[command].label}
        disabled={!editor}
        onClick={() => void actions[command].run("toolbar")}
      >
        {children}
      </Button>
    </Tip>
  )

  return (
    <div
      data-option
      className="absolute top-3 right-3 z-[400] flex items-center gap-0.5 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      {button("zoomOut", <Minus />)}
      <Tip command="zoomTo100">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${keymap.zoomTo100.label}, now ${Math.round(zoom * 100)}%`}
          className="min-w-14 tabular-nums"
          disabled={!editor}
          onClick={() => void actions.zoomTo100.run("toolbar")}
        >
          {Math.round(zoom * 100)}%
        </Button>
      </Tip>
      {button("zoomIn", <Plus />)}
      {button("zoomToFit", <Maximize />)}
    </div>
  )
}

const zoomCommands: Command[] = ["zoomIn", "zoomOut", "zoomToFit", "zoomToSelection", "zoomTo100"]

/** The zoom level, opening every way to zoom, as Figma's and Penpot's do. */
function ZoomMenu() {
  const { editor, selection } = useProject()
  const zoom = useValue("zoom", () => editor?.getZoomLevel() ?? 1, [editor])
  const selected = useSelection(selection)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            aria-label={`Zoom, ${Math.round(zoom * 100)}%`}
            className="h-8 min-w-16 gap-1 px-2 tabular-nums"
            disabled={!editor}
          />
        }
      >
        {Math.round(zoom * 100)}%
        <ChevronDown className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-56">
        {zoomCommands.map((command) => (
          <DropdownMenuItem
            key={command}
            disabled={command === "zoomToSelection" && !selected.design && !selected.note}
            onClick={() => void actions[command].run("toolbar")}
          >
            {keymap[command].label}
            <DropdownMenuShortcut>{formatKeys(keymap[command].keys[0])}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Search actions, the way to every command the bar leaves out. */
function SearchActions() {
  return (
    <Tip command="actions">
      <Button
        variant="ghost"
        size="icon"
        aria-label={keymap.actions.label}
        onClick={() => void actions.actions.run("toolbar")}
      >
        <Search />
      </Button>
    </Tip>
  )
}

/** A: the toolbar as it is, fixed, with Insert beside the tools that make things. Zoom stays at the top right. */
export function TidiedToolbar() {
  return (
    <Bar label="Toolbar">
      <Tools />
    </Bar>
  )
}

/**
 * B: one bar for everything on the canvas. The zoom level joins the tools and opens a menu of every way to zoom, so
 * the top right of the canvas is clear.
 */
export function OneBarToolbar() {
  return (
    <Bar label="Toolbar">
      <Tools />
      <Divider />
      <ZoomMenu />
    </Bar>
  )
}

/**
 * C: A, with the review tools at the end, Annotate and Comment in one button from PAR-184's annotations design, then
 * Search actions for every command the bar leaves out. Zoom stays at the top right.
 */
export function ReviewToolbar() {
  return (
    <Bar label="Toolbar">
      <Tools review />
      <Divider />
      <SearchActions />
    </Bar>
  )
}

/** Each option's bar, and whether zoom stays at the top right of the canvas. */
export const options: Record<ToolbarOption, { Toolbar: () => ReactNode; zoomInCorner: boolean }> = {
  tidied: { Toolbar: TidiedToolbar, zoomInCorner: true },
  "one-bar": { Toolbar: OneBarToolbar, zoomInCorner: false },
  review: { Toolbar: ReviewToolbar, zoomInCorner: true }
}

export { ZoomCorner }
