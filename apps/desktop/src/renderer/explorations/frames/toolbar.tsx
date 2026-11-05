import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  Separator,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { AppWindow, ChevronDown, Component, Frame, Hand, MousePointer2, Pointer, Type } from "lucide-react"
import { Fragment } from "react"
import { ModeViewportIcon } from "../../chrome/viewports.tsx"
import { type FramePreset, framePresets } from "./data.ts"

export type ExploreTool = "select" | "hand" | "frame" | "text" | "interact"

interface ToolSpec {
  id: ExploreTool
  label: string
  /** Its keys, as the keymap writes them; the first is the one shown. */
  keys: string[]
  icon: typeof Hand
}

/**
 * The tools, in three groups: getting around, making things, and trying the real app. Frame takes F and A, as in
 * Figma.
 */
const groups: ToolSpec[][] = [
  [
    { id: "select", label: "Move and select", keys: ["V"], icon: MousePointer2 },
    { id: "hand", label: "Hand", keys: ["H"], icon: Hand }
  ],
  [
    { id: "frame", label: "Frame", keys: ["F", "A"], icon: Frame },
    { id: "text", label: "Text", keys: ["T"], icon: Type }
  ],
  [{ id: "interact", label: "Interact with designs", keys: ["I"], icon: Pointer }]
]

/** The tool a key picks, if any. */
export function toolForKey(key: string): ExploreTool | undefined {
  return groups.flat().find((spec) => spec.keys.includes(key.toUpperCase()))?.id
}

const item =
  "size-9 rounded-lg aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90"

/** What the frame tool's menu does: a frame at a size, or a new screen or component. */
export interface FrameMenuActions {
  /** Picked a size: the selected frame takes it, or a new frame is made at it. */
  onPreset: (preset: FramePreset) => void
  onNewScreen: () => void
  onNewComponent: () => void
}

/**
 * The floating toolbar with the frame tool added. The frame tool has a menu beside it: a frame at one of the
 * modes' sizes, and New screen and New component.
 */
export function FramesToolbar({
  tool,
  onTool,
  menu,
  menuOpen,
  onMenuOpen,
  tooltip,
  frameSelected
}: {
  tool: ExploreTool
  onTool: (tool: ExploreTool) => void
  menu: FrameMenuActions
  menuOpen: boolean
  onMenuOpen: (open: boolean) => void
  /** The tool whose tooltip shows, as when pointing at it. */
  tooltip?: ExploreTool
  /** A frame is selected, so a size resizes it rather than making one. */
  frameSelected: boolean
}) {
  return (
    <div className="absolute bottom-4 left-1/2 z-[400] flex -translate-x-1/2 items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur">
      <ToggleGroup
        size="sm"
        spacing={0}
        value={[tool]}
        onValueChange={([value]) => {
          const picked = groups.flat().find((spec) => spec.id === value)
          if (picked) onTool(picked.id)
        }}
        aria-label="Tools"
        className="gap-0.5"
      >
        {groups.map((group, index) => (
          <Fragment key={group[0]!.id}>
            {index > 0 && <Separator orientation="vertical" className="mx-1 h-5" />}
            {group.map((spec) => (
              <Fragment key={spec.id}>
                <Tooltip open={tooltip === spec.id ? true : undefined}>
                  <TooltipTrigger
                    render={
                      <ToggleGroupItem value={spec.id} aria-label={spec.label} className={item}>
                        <spec.icon />
                      </ToggleGroupItem>
                    }
                  />
                  <TooltipContent side="top">
                    {spec.label} <Kbd>{spec.keys[0]!}</Kbd>
                  </TooltipContent>
                </Tooltip>
                {spec.id === "frame" && (
                  <FrameMenu open={menuOpen} onOpenChange={onMenuOpen} actions={menu} frameSelected={frameSelected} />
                )}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** The arrow beside the frame tool, and its menu: the modes' sizes, then the heavier kinds. */
function FrameMenu({
  open,
  onOpenChange,
  actions,
  frameSelected
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: FrameMenuActions
  frameSelected: boolean
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger
        aria-label="Frame sizes, New screen and New component"
        className="-ml-0.5 grid h-9 w-4 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-popup-open:bg-accent data-popup-open:text-foreground"
      >
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{frameSelected ? "Resize the frame to" : "Frame sizes from your modes"}</DropdownMenuLabel>
          {framePresets.map((preset) => (
            <DropdownMenuItem key={preset.name} className="items-start" onClick={() => actions.onPreset(preset)}>
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
        <DropdownMenuItem onClick={actions.onNewScreen}>
          <AppWindow />
          New screen
        </DropdownMenuItem>
        <DropdownMenuItem onClick={actions.onNewComponent}>
          <Component />
          New component
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
