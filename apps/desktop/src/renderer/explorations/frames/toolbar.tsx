import { AppWindow, ChevronDown, Component, Frame, Hand, MousePointer2, Pointer, StickyNote, Type } from "lucide-react"
import { Fragment } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ModeViewportIcon } from "../../chrome/viewports.tsx"
import { framePresets } from "./data.ts"

export type ExploreTool = "select" | "hand" | "frame" | "text" | "note" | "interact"

interface ToolSpec {
  id: ExploreTool
  label: string
  /** Its keys, as the keymap writes them; the first is the one shown. */
  keys: string[]
  icon: typeof Hand
}

/**
 * The tools, in three groups: getting around, making things, and trying the real app. Frame takes F and A, as in
 * Figma. Note takes S, FigJam's key for a sticky note; Figma's own S is the slice tool, which Parity doesn't have, and
 * the keymap has no S yet (N is Next design).
 */
const groups: ToolSpec[][] = [
  [
    { id: "select", label: "Move and select", keys: ["V"], icon: MousePointer2 },
    { id: "hand", label: "Hand", keys: ["H"], icon: Hand }
  ],
  [
    { id: "frame", label: "Frame", keys: ["F", "A"], icon: Frame },
    { id: "text", label: "Text", keys: ["T"], icon: Type },
    { id: "note", label: "Note", keys: ["S"], icon: StickyNote }
  ],
  [{ id: "interact", label: "Interact with designs", keys: ["I"], icon: Pointer }]
]

const item =
  "size-9 rounded-lg aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:hover:bg-primary/90"

/**
 * The floating toolbar with the frame and note tools added. The frame tool has a menu beside it: a frame at one of the
 * modes' sizes, and New screen and New component.
 */
export function FramesToolbar({
  tool,
  onTool,
  menuOpen = false,
  tooltip
}: {
  tool: ExploreTool
  onTool?: (tool: ExploreTool) => void
  /** The frame tool's menu is open, as after clicking its arrow. */
  menuOpen?: boolean
  /** The tool whose tooltip shows, as when pointing at it. */
  tooltip?: ExploreTool
}) {
  return (
    <div className="absolute bottom-4 left-1/2 z-[400] flex -translate-x-1/2 items-center gap-0.5 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur">
      <ToggleGroup
        type="single"
        size="sm"
        spacing={0}
        value={tool}
        onValueChange={(value) => {
          const picked = groups.flat().find((spec) => spec.id === value)
          if (picked) onTool?.(picked.id)
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
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value={spec.id} aria-label={spec.label} className={item}>
                      <spec.icon />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {spec.label} <Kbd>{spec.keys[0]!}</Kbd>
                  </TooltipContent>
                </Tooltip>
                {spec.id === "frame" && <FrameMenu open={menuOpen} />}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** The arrow beside the frame tool, and its menu: the modes' sizes, then the heavier kinds. */
function FrameMenu({ open }: { open: boolean }) {
  return (
    <DropdownMenu defaultOpen={open} modal={false}>
      <DropdownMenuTrigger
        aria-label="Frame sizes and more"
        className="-ml-0.5 grid h-9 w-4 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-accent data-[state=open]:text-foreground"
      >
        <ChevronDown className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={10} className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Frame sizes from your modes</DropdownMenuLabel>
          {framePresets.map((preset) => (
            <DropdownMenuItem key={preset.name} className="items-start">
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
        <DropdownMenuItem>
          <AppWindow />
          New screen
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Component />
          New component
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
