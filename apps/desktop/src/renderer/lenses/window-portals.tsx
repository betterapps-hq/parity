import { Dialog, DialogPortal } from "@buildkitgg/shadcn"
import { type ReactNode, useEffect, useState } from "react"
import { ShownIn } from "../lens-windows.ts"
import { readopt } from "../window-sheets.ts"

/**
 * Menus, tooltips and dialogs that `children` open show in the window they're in, the main one or a lens's own. Base UI
 * draws them in the container of the portal around them, or the main window's body without one. So `children` sit in a
 * portal that's always mounted, whose container is an element in the body of the window `shownIn`, moved there as they
 * move: moving the element, rather than portalling into another, keeps what's drawn in it mounted. The dialog it
 * belongs to never opens. What's inside hears which window it's in through `useShownIn`.
 */
export function WindowPortals({ shownIn, children }: { shownIn: Window; children: ReactNode }) {
  const [container] = useState(() => {
    const element = document.createElement("div")
    element.dataset.windowPortals = ""

    return element
  })

  useEffect(() => {
    shownIn.document.body.append(container)
    // An open menu's icons take their stylesheets in the window it's moved to.
    readopt(container)
  }, [container, shownIn])

  useEffect(() => () => container.remove(), [container])

  return (
    <Dialog open={false}>
      <DialogPortal keepMounted container={container}>
        <ShownIn value={shownIn}>{children}</ShownIn>
      </DialogPortal>
    </Dialog>
  )
}
