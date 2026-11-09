import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { AppWindow } from "../../App.tsx"
import { ProjectContext } from "../../canvas/context.ts"
import { useActiveTabId, useTabs } from "../../workspace.ts"
import { options, type ToolbarOption } from "./options.tsx"

/**
 * The whole app window with one toolbar option in place of the app's own, on the real canvas: designs select, tools
 * pick, the canvas zooms and pans, and the option's buttons run the app's commands. Without an option it's the app as
 * it is today.
 */
export function ToolbarStage({ option }: { option?: ToolbarOption }) {
  const tabs = useTabs()
  const activeId = useActiveTabId()
  const session = tabs.find((tab) => tab.id === activeId)?.session
  const canvas = useCanvasArea()
  const chosen = option ? options[option] : undefined

  return (
    <>
      {chosen && (
        <style>{`
          .canvas-area > div:not([data-option]):has(> [role="group"][aria-label="Tools"]) { display: none }
          ${chosen.keepsViewControls ? "" : ".canvas-area > div.top-3.right-3 { display: none }"}
        `}</style>
      )}
      <AppWindow />
      {chosen &&
        session &&
        canvas &&
        createPortal(
          <ProjectContext value={session}>
            <chosen.Toolbar />
          </ProjectContext>,
          canvas
        )}
    </>
  )
}

/**
 * The active tab's canvas area once it's drawn. Other projects' tabs stay mounted but hidden, so it's the one outside
 * any hidden element, found again whenever a tab is shown or hidden.
 */
function useCanvasArea(): HTMLElement | undefined {
  const [area, setArea] = useState<HTMLElement>()
  useEffect(() => {
    const find = () => {
      const found = [...document.querySelectorAll<HTMLElement>(".canvas-area")].find(
        (area) => !area.closest("[hidden]")
      )

      setArea((current) => (current === found ? current : found))
    }

    find()
    const observer = new MutationObserver(find)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] })

    return () => observer.disconnect()
  }, [])

  return area
}
