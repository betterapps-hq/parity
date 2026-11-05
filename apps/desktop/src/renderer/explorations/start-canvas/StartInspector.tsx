import { MousePointerClick, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { useProject } from "../../canvas/context.ts"
import { DesignIcon, designColor } from "../../canvas/kinds.tsx"
import { DesignTab } from "../../chrome/DesignPanel.tsx"
import { useSelection } from "../../selection.ts"
import { useCanvasEmpty } from "./CanvasStart.tsx"
import { keysOf, makeNew } from "./commands.ts"

/**
 * The Design tab as proposed. On an empty canvas there's nothing to select, so it says how to start, and what it will
 * show once there's something. With something on the canvas and nothing selected, it asks for a screen or component,
 * in the glossary's words; with something selected, it's today's tab.
 */
export function StartDesignTab() {
  const { selection } = useProject()
  const selected = useSelection(selection)
  const empty = useCanvasEmpty()
  if (empty) return <EmptyCanvas />
  if (!selected.design && !selected.note) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-muted-foreground">
        <MousePointerClick className="size-5" />
        Select a screen or component on the canvas or in Layers.
        <span className="text-xs">Click inside one to select a layer, and double-click to go deeper.</span>
      </div>
    )
  }
  return <DesignTab />
}

/** How to start, from the inspector, where a new person looks for what to do next. */
function EmptyCanvas() {
  const session = useProject()
  const kinds = [
    { kind: "screen", label: "New screen", command: "newScreen" },
    { kind: "component", label: "New component", command: "newComponent" }
  ] as const
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <SlidersHorizontal className="size-5" />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">Nothing to inspect yet</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Make a screen or a component to start. Select it to set its size, layout and styles here.
        </p>
      </div>
      <div className="flex w-full max-w-64 flex-col gap-2">
        {kinds.map(({ kind, label, command }) => (
          <Button key={kind} variant="outline" size="sm" onClick={() => makeNew(session, kind)}>
            <DesignIcon kind={kind} style={{ color: designColor(kind) }} />
            <span className="flex-1 text-left">{label}</span>
            <Kbd>{keysOf(command)}</Kbd>
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Or type <Kbd>/</Kbd> to insert a layout, text or a component.
      </p>
    </div>
  )
}
