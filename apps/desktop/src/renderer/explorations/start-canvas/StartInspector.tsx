import { MousePointerClick } from "lucide-react"
import { useProject } from "../../canvas/context.ts"
import { DesignTab } from "../../chrome/DesignPanel.tsx"
import { useSelection } from "../../selection.ts"

/**
 * The Design tab as proposed. With nothing selected, it asks for a screen or component, in the glossary's words; with
 * something selected, it's today's tab. There's no empty-canvas state, since every project opens on a screen (PAR-560).
 */
export function StartDesignTab() {
  const { selection } = useProject()
  const selected = useSelection(selection)
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
