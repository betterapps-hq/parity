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
  AppWindow,
  ChevronDown,
  Component,
  Frame,
  Hand,
  Maximize,
  MessageCircle,
  Minus,
  MousePointer2,
  NotebookPen,
  SquarePlus,
  Plus,
  Pointer,
  Search,
  Type
} from "lucide-react"
import { Fragment, type ReactElement, type ReactNode, useEffect, useState } from "react"
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
  interact: Pointer
}

/**
 * Getting around, making things, and trying the real app. Move and select and Hand share a button, as in Figma: it
 * shows whichever was picked last, and the menu beside it switches. V and H still pick each, and Space still pans.
 */
const toolGroups = [["move"], ["frame", "text"], ["interact"]] as const

/**
 * The picked tool, in the canvas's selection blue at the step its chips use, so the white icon on it reads at about
 * 4.9:1, as tldraw and Figma pick theirs out in blue. Switches like Code keep the kit's quieter pressed look.
 */
const pickedTool =
  "h-full aria-pressed:bg-(--canvas-layer-chip) aria-pressed:text-white aria-pressed:hover:bg-(--canvas-layer-chip)/90"

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
      className="absolute bottom-4 left-1/2 z-[400] flex h-11 -translate-x-1/2 items-stretch gap-0.5 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
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
  const [lastReview, setLastReview] = useState<ReviewTool>("annotate")

  const pickReview = (id: ReviewTool) => {
    setReviewing(id)
    setLastReview(id)
  }

  // The one of the pair picked last, kept while another tool is picked so the button still shows it.
  const [move, setMove] = useState<"select" | "hand">(tool === "hand" ? "hand" : "select")

  if ((tool === "select" || tool === "hand") && tool !== move) {
    setMove(tool)
  }

  return (
    <ToggleGroup
      size="lg"
      spacing={1}
      value={[reviewing ?? tool]}
      onValueChange={([value]) => {
        if (value === "annotate" || value === "comment") {
          pickReview(value)
        } else if (value) {
          setReviewing(undefined)
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
          <ReviewTools
            current={lastReview}
            picked={reviewing}
            onPick={pickReview}
            onDone={() => setReviewing(undefined)}
          />
        </>
      )}
    </ToggleGroup>
  )
}

/**
 * The review tools, from PAR-184's annotations design: one button with a menu, as Figma groups Comment and Annotation,
 * showing the one picked last and starting on Annotate. The list is all that changes if Comment waits for the comments
 * service (PAR-372).
 */
const reviewTools = {
  annotate: {
    label: "Annotate",
    doing: "Annotating",
    keys: "Shift T",
    icon: NotebookPen,
    hint: "Click a layer to annotate it"
  },
  comment: {
    label: "Comment",
    doing: "Commenting",
    keys: "C",
    icon: MessageCircle,
    hint: "Click anywhere to start a thread"
  }
} as const

type ReviewTool = keyof typeof reviewTools

/**
 * The review button and its menu, and while one is picked, a bar just above the toolbar saying what a click does, with
 * Done. The canvas doesn't place anything here; the Annotations exploration (PAR-184) does.
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
  const { label, keys, icon: Icon } = reviewTools[current]

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <ToggleGroupItem value={current} aria-label={label} className={pickedTool}>
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
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Annotate or Comment"
              className="-ml-0.5 h-full w-4 text-muted-foreground"
            />
          }
        >
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-56">
          <DropdownMenuRadioGroup value={picked ?? current} onValueChange={(value) => onPick(value as ReviewTool)}>
            {(Object.keys(reviewTools) as ReviewTool[]).map((id) => {
              const item = reviewTools[id]

              return (
                <DropdownMenuRadioItem key={id} value={id}>
                  <item.icon />
                  {item.label}
                  <DropdownMenuShortcut>{formatKeys(item.keys)}</DropdownMenuShortcut>
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

/** What a click does while a review tool is picked, and the way out, which Esc takes too. */
function ReviewBar({ tool, onDone }: { tool: ReviewTool; onDone: () => void }) {
  const { doing, hint, icon: Icon } = reviewTools[tool]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDone()
      }
    }

    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [onDone])

  return (
    <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-popover p-1 pl-3 text-sm whitespace-nowrap text-popover-foreground shadow-lg">
      <Icon className="size-4" />
      <span className="font-medium">{doing}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <Button size="xs" variant="secondary" onClick={onDone}>
        Done <Kbd>{formatKeys("Esc")}</Kbd>
      </Button>
    </div>
  )
}

/** The arrow beside Move and select, and its menu: Move and select, or Hand. */
function MoveMenu({ current }: { current: "select" | "hand" }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Move and select, or Hand"
            className="-ml-0.5 h-full w-4 text-muted-foreground"
          />
        }
      >
        <ChevronDown />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-56">
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(value) => void actions[value as "select" | "hand"].run("toolbar")}
        >
          {(["select", "hand"] as const).map((id) => {
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
        size="icon-lg"
        aria-label={keymap.insert.label}
        className="h-full"
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
            className="-ml-0.5 h-full w-4 text-muted-foreground"
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
            size="lg"
            aria-label={`Zoom, ${Math.round(zoom * 100)}%`}
            className="h-full min-w-18 gap-1 px-2 tabular-nums"
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
        size="icon-lg"
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
