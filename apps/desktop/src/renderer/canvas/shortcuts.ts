import { useEffect } from "react"
import { actions } from "../chrome/actions.ts"
import { type Command, keymap, shortcutFor } from "../chrome/keymap.ts"
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
      if (action.available?.() !== false) void action.run(event)
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
    // tldraw acts on Tab and Enter when they're released, so a key handled here is taken from it on the way up too.
    const handledKeys = new Set<string>()
    let pointerHeld = false

    const onKeyDown = (event: KeyboardEvent) => {
      // Keys typed into a design, as when interacting with it, are the design's. Shadow DOM hands this listener the
      // frame instead of the element inside it, so the frame is found on the event's path.
      if (
        event.composedPath().some((element) => element instanceof HTMLElement && element.hasAttribute("data-frame"))
      ) {
        return
      }
      const target = event.target as HTMLElement | null
      // A menu or dialog playing its closing animation still holds focus for a moment, but its keys, a field's in it
      // included, are the canvas's again: Ctrl+Z straight after picking an item undoes it (PAR-424).
      const closing = !!target?.closest(":is([role=menu], [role=listbox], [role=dialog])[data-state=closed]")
      const typing =
        !closing && !!target?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")
      const inMenu = !closing && !!target?.closest("[role=menu], [role=listbox], [role=dialog]")
      if (typing || inMenu) return
      // Escape mid-drag cancels the drag, a layer's or a design's, rather than selecting the parent.
      if (pointerHeld && event.key === "Escape") return
      // Enter, Tab and the arrows on a focused button, tab, Layers row or other control are that control's: they press
      // it, move focus on, or move within it. They're the canvas's when the canvas, or nothing, has focus, and on a
      // design's title, where Enter selects the layers inside; a title's menus and a board's captions and state labels
      // are controls (`data-canvas-control`).
      const control =
        !!target &&
        !closing &&
        target !== document.body &&
        (!target.closest(".tl-container") || !!target.closest("[data-canvas-control]")) &&
        !!target.closest("button, a[href], [role], [tabindex]")
      if (control && (event.key === "Enter" || event.key === "Tab" || event.key.startsWith("Arrow"))) return
      const mod = event.ctrlKey || event.metaKey
      const handled = () => {
        event.preventDefault()
        event.stopImmediatePropagation()
        handledKeys.add(event.code)
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
        void action.run(event)
        return
      }
      // The browser's own Ctrl shortcuts for these would select the page's text or act on nothing here.
      if (mod && ["c", "x", "v", "d", "g", "a"].includes(event.key.toLowerCase())) handled()
      // Nudging is the keymap's: tldraw would move the selected design with the arrows the keymap doesn't bind.
      else if (event.key.startsWith("Arrow") && (session.selection.get().design || session.selection.get().note)) {
        handled()
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (!handledKeys.delete(event.code)) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const onPointerDown = () => {
      pointerHeld = true
    }
    const onPointerUp = () => {
      pointerHeld = false
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    window.addEventListener("keyup", onKeyUp, { capture: true })
    window.addEventListener("pointerdown", onPointerDown, { capture: true })
    window.addEventListener("pointerup", onPointerUp, { capture: true })
    window.addEventListener("pointercancel", onPointerUp, { capture: true })
    // A release outside the window never arrives, so leaving it ends the hold too.
    window.addEventListener("blur", onPointerUp)
    return () => {
      window.removeEventListener("blur", onPointerUp)
      window.removeEventListener("keydown", onKeyDown, { capture: true })
      window.removeEventListener("keyup", onKeyUp, { capture: true })
      window.removeEventListener("pointerdown", onPointerDown, { capture: true })
      window.removeEventListener("pointerup", onPointerUp, { capture: true })
      window.removeEventListener("pointercancel", onPointerUp, { capture: true })
    }
  }, [session, active])
}
