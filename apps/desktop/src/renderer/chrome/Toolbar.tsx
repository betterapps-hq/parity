import { Hand, Maximize, Minus, MousePointer2, Plus, Pointer, Redo2, Type, Undo2 } from "lucide-react"
import type { ReactNode } from "react"
import { useValue } from "tldraw"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useProject } from "../canvas/context.ts"
import { useHistory } from "../design-store.ts"
import { type Tool, useTool } from "../selection.ts"
import { IconButton } from "./IconButton.tsx"

const tools: { id: Tool; label: string; shortcut: string; icon: typeof Hand }[] = [
  { id: "select", label: "Move and select", shortcut: "V", icon: MousePointer2 },
  { id: "hand", label: "Hand", shortcut: "H", icon: Hand },
  { id: "text", label: "Text", shortcut: "T", icon: Type },
  { id: "interact", label: "Interact with designs", shortcut: "I", icon: Pointer }
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

/** The tools, floating at the bottom of the canvas, Figma style. New designs are added from the Layers panel. */
export function FloatingToolbar() {
  const { selection } = useProject()
  const tool = useTool(selection)
  return (
    <Floating className="bottom-4 left-1/2 -translate-x-1/2">
      <ToggleGroup
        type="single"
        size="sm"
        spacing={0}
        value={tool}
        onValueChange={(value) => value && selection.setTool(value as Tool)}
        aria-label="Tools"
        className="gap-0.5"
      >
        {tools.map(({ id, label, shortcut, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={id}
                aria-label={label}
                // The tooltip takes over data-state, so the pressed look keys off aria-checked.
                className="size-9 rounded-lg aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:hover:bg-primary/90"
              >
                <Icon />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="top">
              {label} <Kbd>{shortcut}</Kbd>
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
    </Floating>
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
        label={history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : "Undo"}
        shortcut="Ctrl Z"
        disabled={!history.canUndo}
        onClick={() => store.undo()}
      >
        <Undo2 />
      </IconButton>
      <IconButton
        label={history.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : "Redo"}
        shortcut="Ctrl Shift Z"
        disabled={!history.canRedo}
        onClick={() => store.redo()}
      >
        <Redo2 />
      </IconButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <IconButton label="Zoom out" shortcut="Ctrl −" disabled={!editor} onClick={() => editor?.zoomOut()}>
        <Minus />
      </IconButton>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="min-w-14 tabular-nums"
            disabled={!editor}
            onClick={() => editor?.resetZoom()}
          >
            {Math.round(zoom * 100)}%
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          Zoom to 100% <Kbd>Shift 0</Kbd>
        </TooltipContent>
      </Tooltip>
      <IconButton label="Zoom in" shortcut="Ctrl +" disabled={!editor} onClick={() => editor?.zoomIn()}>
        <Plus />
      </IconButton>
      <IconButton label="Zoom to fit" shortcut="Shift 1" disabled={!editor} onClick={() => editor?.zoomToFit()}>
        <Maximize />
      </IconButton>
    </Floating>
  )
}
