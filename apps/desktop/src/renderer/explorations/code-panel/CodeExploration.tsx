import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { type ReactNode, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AppWindow } from "../../App.tsx"
import { ProjectContext } from "../../canvas/context.ts"
import { useActiveTabId, useTabs } from "../../workspace.ts"
import { CodePanel } from "./CodePanel.tsx"
import { InspectOverlay } from "./InspectOverlay.tsx"

/**
 * The window with the Code panel where the inspector was, and Inspect's outlines over the canvas. The app no longer has
 * either, so the panel sits beside the window and the overlay is put into the canvas area from outside.
 */
export function CodeExploration() {
  const active = useActiveTabId()
  const session = useTabs().find((tab) => tab.id === active)?.session

  return (
    <div className="flex h-screen bg-background text-foreground">
      <div className="min-w-0 flex-1">
        <AppWindow />
      </div>
      {session && (
        <TooltipProvider>
          <ProjectContext value={session}>
            <section aria-label="Code" className="flex w-80 flex-none flex-col border-l">
              <h2 className="shrink-0 border-b px-4 py-3 text-sm font-medium">Code</h2>
              <CodePanel />
            </section>
            <OnCanvas>
              <InspectOverlay />
            </OnCanvas>
          </ProjectContext>
        </TooltipProvider>
      )}
    </div>
  )
}

/** Puts `children` into the canvas area once the window draws it, as the app's own overlays are. */
function OnCanvas({ children }: { children: ReactNode }) {
  const [area, setArea] = useState<Element>()

  useEffect(() => {
    let frame = 0

    const find = () => {
      const found = document.querySelector(".canvas-area")

      if (found) {
        setArea(found)
      } else {
        frame = requestAnimationFrame(find)
      }
    }

    find()

    return () => cancelAnimationFrame(frame)
  }, [])

  return area ? createPortal(children, area) : null
}
