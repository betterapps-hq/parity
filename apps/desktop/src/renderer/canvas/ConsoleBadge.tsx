import { CircleX, TriangleAlert } from "lucide-react"
import { stopEventPropagation } from "tldraw"
import { showConsole } from "../chrome/ConsolePanel.tsx"
import { Hint } from "../chrome/Hint.tsx"
import { useDesignCounts } from "../console-store.ts"
import { useProject } from "./context.ts"

/**
 * A design's errors and warnings in the console, beside its name on the canvas (PAR-147), always shown while there
 * are any, so a failing design stands out on a busy canvas. Clicking it opens the console on the design's messages.
 */
export function ConsoleBadge({ design, name }: { design: string; name: string }) {
  const session = useProject()
  const { errors, warnings } = useDesignCounts(session.id, design)
  if (errors === 0 && warnings === 0) return null
  const said = [
    errors > 0 && `${errors} ${errors === 1 ? "error" : "errors"}`,
    warnings > 0 && `${warnings} ${warnings === 1 ? "warning" : "warnings"}`
  ].filter(Boolean)
  return (
    <Hint label={`${said.join(" and ")} from ${name}`} detail="Click to show them in the console">
      <button
        type="button"
        aria-label={`${said.join(" and ")} from ${name} in the console`}
        className="flex h-6 shrink-0 items-center gap-1 rounded-md border bg-background px-1.5 text-xs font-medium tabular-nums shadow-xs hover:bg-accent"
        data-canvas-control
        onPointerDown={stopEventPropagation}
        onClick={() => showConsole(design)}
      >
        {errors > 0 && (
          <>
            <CircleX className="size-3.5 text-destructive" /> {errors}
          </>
        )}
        {warnings > 0 && (
          <>
            <TriangleAlert className={`size-3.5 text-amber-500 ${errors > 0 ? "ml-1" : ""}`} /> {warnings}
          </>
        )}
      </button>
    </Hint>
  )
}
