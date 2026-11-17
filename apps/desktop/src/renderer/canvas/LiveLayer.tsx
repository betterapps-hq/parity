import { reparkAfter } from "@parity-app/frames"
import { useEffect, useState } from "react"
import { react, useEditor } from "tldraw"
import { useInteracting } from "../selection.ts"
import { useProject } from "./context.ts"
import { poolFor } from "./live-frames.ts"

/**
 * Where a project's live frame and spares draw (docs/proposals/route-frames.md, "What the desktop app changes"): one
 * layer in the canvas's page space, so the live frame moves with the camera as its board does, and spares re-park in
 * the view a moment after it stops moving. It takes no pointer itself; only the engaged live frame does. Mounted as
 * part of tldraw's `OnTheCanvas`, under the titles.
 */
export function LiveLayer() {
  const editor = useEditor()
  const session = useProject()
  const interacting = useInteracting(session.selection)
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const pool = poolFor(session.id)

  useEffect(() => {
    if (!element) {
      return undefined
    }

    pool.attach({ element, editor })

    return () => pool.attach(undefined)
  }, [pool, element, editor])

  useEffect(() => pool.setInteracting(interacting), [pool, interacting])

  // Spares park in the view again once the camera has stopped for a moment.
  useEffect(() => {
    let timer = 0

    const stop = react("park spares", () => {
      editor.getCamera()
      window.clearTimeout(timer)
      timer = window.setTimeout(() => pool.viewSettled(), reparkAfter)
    })

    return () => {
      stop()
      window.clearTimeout(timer)
    }
  }, [pool, editor])

  return <div ref={setElement} data-live-layer="" className="pointer-events-none absolute top-0 left-0 z-[999999]" />
}
