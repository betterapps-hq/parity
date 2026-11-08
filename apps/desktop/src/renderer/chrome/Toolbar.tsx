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
  Minus,
  MousePointer2,
  Plus,
  Pointer,
  Redo2,
  Type,
  Undo2
} from "lucide-react"
import { Fragment, type ReactNode } from "react"
import { useValue } from "tldraw"
import { useProject } from "../canvas/context.ts"
import { placeFrame } from "../canvas/frame-tool.ts"
import { useContainerEntry, useHistory, useModeSettings } from "../design-store.ts"
import { type Tool, useSelection, useTool } from "../selection.ts"
import { actions } from "./actions.ts"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { formatKeys } from "./keys.ts"
import { ModeViewportIcon } from "./viewports.tsx"

/**
 * The tools, each named and with its keys as the keymap has it, in three groups: getting around, making things, and
 * trying the real app.
 */
const toolGroups: { id: Tool; icon: typeof Hand }[][] = [
  [
    { id: "select", icon: MousePointer2 },
    { id: "hand", icon: Hand }
  ],
  [
    { id: "frame", icon: Frame },
    { id: "text", icon: Type }
  ],
  [{ id: "interact", icon: Pointer }]
]

/** A pill floating over the canvas. */
function Floating({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div
      className={`absolute z-[400] flex items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * The tools, floating at the bottom of the canvas, Figma style. The frame tool has a menu beside it: a frame at one of
 * the modes' sizes, and New screen and New component, so every kind starts from the same place.
 */
export function FloatingToolbar() {
  const { selection } = useProject()
  const tool = useTool(selection)
  return (
    <Floating className="bottom-4 left-1/2 -translate-x-1/2">
      <ToggleGroup
        size="sm"
        spacing={0}
        value={[tool]}
        onValueChange={([value]) => {
          const picked = toolGroups.flat().find((each) => each.id === value)
          if (picked) void actions[picked.id].run("toolbar")
        }}
        aria-label="Tools"
        className="gap-0.5"
      >
        {toolGroups.map((group, index) => (
          <Fragment key={group[0]!.id}>
            {index > 0 && <Separator orientation="vertical" className="mx-1 h-5" />}
            {group.map(({ id, icon: Icon }) => {
              const { label, keys } = keymap[id]
              return (
                <Fragment key={id}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <ToggleGroupItem
                          value={id}
                          aria-label={label}
                          className="size-9 rounded-lg aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90"
                        >
                          <Icon />
                        </ToggleGroupItem>
                      }
                    />
                    <TooltipContent side="top">
                      {label} <Kbd>{formatKeys(keys[0])}</Kbd>
                    </TooltipContent>
                  </Tooltip>
                  {id === "frame" && <FrameMenu />}
                </Fragment>
              )
            })}
          </Fragment>
        ))}
      </ToggleGroup>
    </Floating>
  )
}

/**
 * The arrow beside the frame tool, and its menu: a size for each viewport the modes use, then New screen and New
 * component. A size resizes the selected frame, or adds a frame at that size in the middle of the view.
 */
function FrameMenu() {
  const session = useProject()
  const settings = useModeSettings(session.store)
  const selected = useSelection(session.selection)
  const entry = useContainerEntry(session.store, selected.design)
  const frame = entry?.container.kind === "frame" && !selected.node ? entry : undefined
  const presets = framePresets(settings)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label="Frame sizes, New screen and New component"
        className="-ml-0.5 grid h-9 w-4 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-expanded:bg-accent aria-expanded:text-foreground"
      >
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{frame ? "Resize the frame to" : "Frame sizes from your modes"}</DropdownMenuLabel>
          {presets.map((preset) => (
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

/** History and zoom, floating at the top right of the canvas. */
export function ViewControls() {
  const { editor, store } = useProject()
  const history = useHistory(store)
  const zoom = useValue("zoom", () => editor?.getZoomLevel() ?? 1, [editor])
  return (
    <Floating className="top-3 right-3">
      <IconButton
        label={history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : keymap.undo.label}
        shortcut={keymap.undo.keys[0]}
        disabled={!history.canUndo}
        onClick={() => void actions.undo.run("toolbar", { instead: () => store.undo() })}
      >
        <Undo2 />
      </IconButton>
      <IconButton
        label={history.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : keymap.redo.label}
        shortcut={keymap.redo.keys[0]}
        disabled={!history.canRedo}
        onClick={() => void actions.redo.run("toolbar", { instead: () => store.redo() })}
      >
        <Redo2 />
      </IconButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <IconButton
        label={keymap.zoomOut.label}
        shortcut={keymap.zoomOut.keys[0]}
        disabled={!editor}
        onClick={() => void actions.zoomOut.run("toolbar", { instead: () => editor?.zoomOut() })}
      >
        <Minus />
      </IconButton>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="min-w-14 tabular-nums"
              disabled={!editor}
              onClick={() => void actions.zoomTo100.run("toolbar", { instead: () => editor?.resetZoom() })}
            >
              {Math.round(zoom * 100)}%
            </Button>
          }
        />
        <TooltipContent side="top">
          {keymap.zoomTo100.label} <Kbd>{formatKeys(keymap.zoomTo100.keys[0])}</Kbd>
        </TooltipContent>
      </Tooltip>
      <IconButton
        label={keymap.zoomIn.label}
        shortcut={keymap.zoomIn.keys[0]}
        disabled={!editor}
        onClick={() => void actions.zoomIn.run("toolbar", { instead: () => editor?.zoomIn() })}
      >
        <Plus />
      </IconButton>
      <IconButton
        label={keymap.zoomToFit.label}
        shortcut={keymap.zoomToFit.keys[0]}
        disabled={!editor}
        onClick={() => void actions.zoomToFit.run("toolbar", { instead: () => editor?.zoomToFit() })}
      >
        <Maximize />
      </IconButton>
    </Floating>
  )
}
