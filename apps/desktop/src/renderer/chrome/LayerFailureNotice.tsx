import type { LayerFailure } from "@parity-app/core"
import { failureAdvice } from "@parity-app/editor"
import { OctagonAlert } from "lucide-react"
import { useProject } from "../canvas/context.ts"
import { useLayerFailure } from "../failures-store.ts"

/**
 * Why the selected layer's component fails to draw on the canvas, and how to fix it (PAR-165), above its fields while it
 * fails in any of the design's frames. It goes once the component draws again.
 */
export function LayerFailureNotice({ design, nodeId }: { design: string; nodeId: string }) {
  const session = useProject()
  const failure = useLayerFailure(session.loaded, design, nodeId)
  if (!failure) return null
  return <FailureCallout failure={failure} />
}

/** A failure as the inspector shows it: what fails and why, the fix when there's one, and the error as thrown. */
export function FailureCallout({ failure }: { failure: LayerFailure }) {
  const { reason, fix } = failureAdvice(failure.error)
  return (
    <div className="border-b p-3">
      <div role="alert" className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <OctagonAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-sm font-medium">{failure.component} fails to draw</p>
          <p className="text-xs">
            {reason} {fix}
          </p>
          <p className="font-mono text-xs break-words text-muted-foreground select-text">{failure.error}</p>
        </div>
      </div>
    </div>
  )
}
