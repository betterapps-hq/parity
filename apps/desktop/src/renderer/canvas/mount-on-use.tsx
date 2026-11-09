import {
  createContext,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  useContext,
  useState
} from "react"
import { flushSync } from "react-dom"

/**
 * Whether the controls in an area that mounts on use (see `useMountOnUse`) have been used yet, so their menus and hints
 * should be mounted. Outside such an area they always have been, so a control drawn on its own mounts as it would.
 */
export const Used = createContext(true)

/** Whether the menus and hints of the area this control is in should be mounted (see `useMountOnUse`). */
export function useUsed(): boolean {
  return useContext(Used)
}

const focusable = "button, input, [tabindex]"

/**
 * Leaves an area's menus and hints unmounted until the area is first used: hovered, focused or right-clicked, or
 * `ready`, as a board is while it's hovered or selected (PAR-760). Every board's title has a context menu, a hint and
 * its state and modes menus, and mounting them all as the canvas opens took about 0.12 s on the example project.
 *
 * Spread `area` on the area's element and pass `used` to its controls through `Used`. Once used, the area stays used, so
 * an open menu never unmounts. The pointer enters an area before it presses or right-clicks there, so the menus are
 * mounted by then, and synchronously, so the next event finds them. Swapping a plain control for a menu's trigger
 * replaces its element, so a focus or right-click that arrives first is passed on to the new element in its place.
 */
export function useMountOnUse(ready: boolean): {
  used: boolean
  area: {
    onPointerEnter?: () => void
    onFocusCapture?: (event: ReactFocusEvent<HTMLElement>) => void
    onContextMenuCapture?: (event: ReactMouseEvent<HTMLElement>) => void
  }
} {
  const [used, setUsed] = useState(ready)

  if (ready && !used) {
    setUsed(true)
  }

  if (used) {
    return { used, area: {} }
  }

  const mountNow = () => flushSync(() => setUsed(true))

  return {
    used,
    area: {
      onPointerEnter: mountNow,
      onFocusCapture(event) {
        const area = event.currentTarget
        const index = [...area.querySelectorAll(focusable)].indexOf(event.target)
        mountNow()

        area.querySelectorAll<HTMLElement>(focusable)[index]?.focus()
      },
      onContextMenuCapture(event) {
        event.preventDefault()
        event.stopPropagation()
        const area = event.currentTarget
        const { clientX, clientY, screenX, screenY } = event
        mountNow()

        const target =
          [document.elementFromPoint(clientX, clientY), document.activeElement].find(
            (element) => element && area.contains(element)
          ) ?? area

        target.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX,
            clientY,
            screenX,
            screenY
          })
        )
      }
    }
  }
}
