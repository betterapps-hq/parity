import { failureAdvice } from "@parity-app/editor"
import { OctagonAlert } from "lucide-react"
import { stopEventPropagation } from "tldraw"
import { Hint } from "../chrome/Hint.tsx"
import { useDesignFailures } from "../failures-store.ts"
import { useProject } from "./context.ts"

/**
 * The design's layers whose components fail to draw, beside its name on the canvas (PAR-165), while any do in any of
 * its frames. Each failing layer draws its error box in its place, which is easy to miss zoomed out or below the fold.
 * Clicking it selects the first, so Layers and the inspector show why and how to fix it.
 */
export function FailureBadge({ design, name }: { design: string; name: string }) {
  const session = useProject()
  const failures = useDesignFailures(session.loaded, design)
  const first = failures[0]
  if (!first) return null
  const one = failures.length === 1
  const label = one ? `${first.component} fails to draw` : `${failures.length} layers fail to draw`
  const select = one
    ? `Select ${first.component}, which fails to draw in ${name}`
    : `Select ${first.component}, the first of ${failures.length} layers that fail to draw in ${name}`
  return (
    <Hint
      label={label}
      detail={
        one
          ? `${failureAdvice(first.error).reason}\nClick to select it.`
          : `Click to select ${first.component}, the first.`
      }
    >
      <button
        type="button"
        aria-label={select}
        className="flex h-6 shrink-0 items-center gap-1 rounded-md border bg-background px-1.5 text-xs font-medium tabular-nums shadow-xs hover:bg-accent"
        data-canvas-control
        onPointerDown={stopEventPropagation}
        onClick={() => session.selection.set({ design, node: first.nodeId })}
      >
        <OctagonAlert className="size-3.5 text-destructive" /> {failures.length}
      </button>
    </Hint>
  )
}
