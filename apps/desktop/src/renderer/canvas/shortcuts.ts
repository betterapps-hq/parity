import { useEffect } from "react"
import { actions } from "../chrome/actions.ts"
import { type Command, keymap, shortcutFor } from "../chrome/keymap.ts"
import { revealSelection } from "../chrome/reveal.ts"
import type { ProjectSession } from "../workspace.ts"

const commands = Object.keys(keymap) as Command[]
const appCommands = commands.filter((command) => actions[command].scope === "app")
const canvasCommands = commands.filter((command) => actions[command].scope !== "app")

/**
 * Shortcuts for the File and Help menus, the panels and the tabs. They work anywhere in the window, even in a text
 * field, and with no project open.
 */
export function useAppShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = shortcutFor(event, appCommands)
      if (!command) return
      event.preventDefault()
      event.stopImmediatePropagation()
      const action = actions[command]
      if (action.available?.() !== false) void action.run()
    }
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [])
}

/**
 * Keyboard shortcuts for the active tab, from the keymap. They're handled before tldraw sees them, because the design
 * store, not tldraw, owns undo, deletion and the selection inside designs; tldraw's own shortcuts are off.
 */
export function useShortcuts(session: ProjectSession | undefined, active: boolean): void {
  useEffect(() => {
    if (!active || !session) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      // Keys typed into a design, as when interacting with it, are the design's. Shadow DOM hands this listener the
      // frame instead of the element inside it, so the frame is found on the event's path.
      if (
        event.composedPath().some((element) => element instanceof HTMLElement && element.hasAttribute("data-frame"))
      ) {
        return
      }
      const target = event.target as HTMLElement | null
      const typing = !!target?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")
      const inMenu = !!target?.closest("[role=menu], [role=listbox], [role=dialog]")
      if (typing || inMenu) return
      const mod = event.ctrlKey || event.metaKey
      const handled = () => {
        event.preventDefault()
        event.stopImmediatePropagation()
      }

      const command = shortcutFor(event, canvasCommands)
      if (command) {
        const action = actions[command]
        // A key that doesn't apply now does what it would anyway, as Enter on a button, unless it's a Ctrl shortcut.
        if (action.available?.() === false) {
          if (mod) handled()
          return
        }
        handled()
        void action.run()
        return
      }
      // The browser's own Ctrl shortcuts for these would select the page's text or act on nothing here.
      if (mod && ["c", "x", "v", "d", "g", "a"].includes(event.key.toLowerCase())) handled()
      else if (!mod && event.key.startsWith("Arrow") && session.selection.get().node) {
        handled()
        revealSelection(session)
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [session, active])
}
