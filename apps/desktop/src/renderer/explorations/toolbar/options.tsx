import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  Kbd,
  Separator,
  Toggle,
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
  CodeXml,
  Component,
  Frame,
  Hand,
  MousePointer2,
  SquarePlus,
  Pointer,
  Redo2,
  Search,
  Type,
  Undo2
} from "lucide-react"
import { Fragment, type ReactElement, type ReactNode } from "react"
import { useValue } from "tldraw"
import { useProject } from "../../canvas/context.ts"
import { placeFrame } from "../../canvas/frame-tool.ts"
import { actions } from "../../chrome/actions.ts"
import { type Command, keymap } from "../../chrome/keymap.ts"
import { formatKeys } from "../../chrome/keys.ts"
import { setLayout, useLayout } from "../../chrome/layout.ts"
import { ModeViewportIcon } from "../../chrome/viewports.tsx"
import { useContainerEntry, useHistory, useModeSettings } from "../../design-store.ts"
import { type Tool, useSelection, useTool } from "../../selection.ts"

/*
 * Options for the floating toolbar (PAR-780). Each one runs the app's own commands on the real canvas, so tools pick,
 * Insert opens the picker, and zoom and history act on the example.
 *
 * What's fixed in all of them: the separators run the bar's full height (the app's set `h-5` over the kit's
 * `self-stretch`), the picked tool keeps its rounded corners (the app's `spacing={0}` squares the inner ones), and the
 * picked tool takes the kit's own pressed look rather than a solid block of the primary color.
 */

export type ToolbarOption = "tidied" | "one-bar" | "code"

const toolIcons: Record<Tool, typeof Hand> = {
  select: MousePointer2,
  hand: Hand,
  frame: Frame,
  text: Type,
  interact: Pointer
}

/** Getting around, making things, and trying the real app, as today. */
const toolGroups: Tool[][] = [["select", "hand"], ["frame", "text"], ["interact"]]

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
function Tools() {
  const { selection } = useProject()
  const tool = useTool(selection)

  return (
    <ToggleGroup
      size="lg"
      spacing={1}
      value={[tool]}
      onValueChange={([value]) => {
        if (value) {
          void actions[value as Tool].run("toolbar")
        }
      }}
      aria-label="Tools"
      className="items-stretch gap-0.5"
    >
      {toolGroups.map((group, index) => (
        <Fragment key={group[0]}>
          {index > 0 && <Divider />}
          {group.map((id) => {
            const Icon = toolIcons[id]

            return (
              <Fragment key={id}>
                <Tip command={id}>
                  <ToggleGroupItem value={id} aria-label={keymap[id].label} className="h-full">
                    <Icon />
                  </ToggleGroupItem>
                </Tip>
                {id === "frame" && <FrameMenu />}
                {id === "text" && <InsertButton />}
              </Fragment>
            )
          })}
        </Fragment>
      ))}
    </ToggleGroup>
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

/** Undo and Redo, each naming the step it would take. */
function History() {
  const { store } = useProject()
  const history = useHistory(store)

  return (
    <>
      <Tip command="undo" label={history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : undefined}>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : keymap.undo.label}
          disabled={!history.canUndo}
          onClick={() => void actions.undo.run("toolbar", { instead: () => store.undo() })}
        >
          <Undo2 />
        </Button>
      </Tip>
      <Tip command="redo" label={history.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : undefined}>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label={history.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : keymap.redo.label}
          disabled={!history.canRedo}
          onClick={() => void actions.redo.run("toolbar", { instead: () => store.redo() })}
        >
          <Redo2 />
        </Button>
      </Tip>
    </>
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

/**
 * The inspector's Code tab, as a switch that shows whether it's open. The console stays in the status bar, where its
 * button counts the designs' errors and warnings.
 */
function CodeTab() {
  const layout = useLayout()
  const shown = layout.right && layout.rightTab === "code"

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            size="lg"
            aria-label="Code"
            pressed={shown}
            onPressedChange={(pressed) => setLayout({ right: true, rightTab: pressed ? "code" : "design" })}
            className="h-full"
          />
        }
      >
        <CodeXml />
      </TooltipTrigger>
      <TooltipContent side="top">Code for the selection</TooltipContent>
    </Tooltip>
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

/**
 * A: the toolbar as it is, fixed, with Insert beside the tools that make things. History and zoom stay at the top
 * right.
 */
export function TidiedToolbar() {
  return (
    <Bar label="Toolbar">
      <Tools />
    </Bar>
  )
}

/**
 * B: one bar for everything on the canvas. History and the zoom level join the tools, and the zoom level opens a menu
 * of every way to zoom, so the top right of the canvas is clear.
 */
export function OneBarToolbar() {
  return (
    <Bar label="Toolbar">
      <Tools />
      <Divider />
      <History />
      <Divider />
      <ZoomMenu />
    </Bar>
  )
}

/**
 * C: A, with what engineers reach for at the end: the Code tab, and Search actions for every command the bar leaves
 * out. History and zoom stay at the top right.
 */
export function CodeToolbar() {
  return (
    <Bar label="Toolbar">
      <Tools />
      <Divider />
      <CodeTab />
      <SearchActions />
    </Bar>
  )
}

export const options: Record<ToolbarOption, { Toolbar: () => ReactNode; keepsViewControls: boolean }> = {
  tidied: { Toolbar: TidiedToolbar, keepsViewControls: true },
  "one-bar": { Toolbar: OneBarToolbar, keepsViewControls: false },
  code: { Toolbar: CodeToolbar, keepsViewControls: true }
}
