import {
  Button,
  Separator,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  Kbd
} from "@buildkitgg/shadcn-baseui-kit"
import { Hand, Maximize, Minus, MousePointer2, Plus, Pointer, Redo2, Type, Undo2 } from "lucide-react"
import type { ReactNode } from "react"
import { useValue } from "tldraw"
import { useProject } from "../canvas/context.ts"
import { useHistory } from "../design-store.ts"
import { type Tool, useTool } from "../selection.ts"
import { IconButton } from "./IconButton.tsx"
import { keymap } from "./keymap.ts"
import { formatKeys } from "./keys.ts"

/** The tools, each named and with its keys as the keymap has it. */
const tools: { id: Tool; icon: typeof Hand }[] = [
  { id: "select", icon: MousePointer2 },
  { id: "hand", icon: Hand },
  { id: "text", icon: Type },
  { id: "interact", icon: Pointer }
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
        size="sm"
        spacing={0}
        value={[tool]}
        onValueChange={([value]) => value && selection.setTool(value as Tool)}
        aria-label="Tools"
        className="gap-0.5"
      >
        {tools.map(({ id, icon: Icon }) => {
          const { label, keys } = keymap[id]
          return (
            <Tooltip key={id}>
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
          )
        })}
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
        label={history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : keymap.undo.label}
        shortcut={keymap.undo.keys[0]}
        disabled={!history.canUndo}
        onClick={() => store.undo()}
      >
        <Undo2 />
      </IconButton>
      <IconButton
        label={history.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : keymap.redo.label}
        shortcut={keymap.redo.keys[0]}
        disabled={!history.canRedo}
        onClick={() => store.redo()}
      >
        <Redo2 />
      </IconButton>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <IconButton
        label={keymap.zoomOut.label}
        shortcut={keymap.zoomOut.keys[0]}
        disabled={!editor}
        onClick={() => editor?.zoomOut()}
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
              onClick={() => editor?.resetZoom()}
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
        onClick={() => editor?.zoomIn()}
      >
        <Plus />
      </IconButton>
      <IconButton
        label={keymap.zoomToFit.label}
        shortcut={keymap.zoomToFit.keys[0]}
        disabled={!editor}
        onClick={() => editor?.zoomToFit()}
      >
        <Maximize />
      </IconButton>
    </Floating>
  )
}
