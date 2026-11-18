import { useEffect } from "react"
import { actions, commandsFor } from "../chrome/actions.ts"
import { type Command, keymap, shortcutFor } from "../chrome/keymap.ts"
import { runExtensionKey } from "../extension-editor.ts"
import { isElement, onEachWindow } from "../lens-windows.ts"
import type { SelectionStore } from "../selection.ts"
import type { ProjectSession } from "../workspace.ts"
import { escapeOnCanvas } from "./surface/index.ts"

// SAFETY: `keymap` has a key for each command and no others.
const commands = Object.keys(keymap) as Command[]
const appCommands = commands.filter((command) => actions[command].scope === "app")
const canvasCommands = commands.filter((command) => actions[command].scope !== "app")

/**
 * Shortcuts for the File and Help menus, the panels and the tabs. They work anywhere in the window, a lens's own window
 * included, even in a text field, and with no project open.
 */
export function useAppShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const command = shortcutFor(event, appCommands)

      if (!command) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      // One that doesn't apply is recorded as tried, as a Ctrl shortcut on the canvas is.
      void actions[command].run("key", { event })
    }

    return onEachWindow((target) => {
      target.addEventListener("keydown", onKeyDown, { capture: true })

      return () => target.removeEventListener("keydown", onKeyDown, { capture: true })
    })
  }, [])
}

/**
 * Keyboard shortcuts for the active tab, from the keymap, in the main window and each lens's own. They're handled before tldraw sees them, because the design
 * store, not tldraw, owns undo, deletion and the selection inside designs; tldraw's own shortcuts are off.
 */
export function useShortcuts(selection: SelectionStore | undefined, active: boolean, session?: ProjectSession): void {
  useEffect(() => {
    if (!active || !selection) {
      return undefined
    }

    // tldraw acts on Tab and Enter when they're released, so a key handled here is taken from it on the way up too.
    const handledKeys = new Set<string>()
    let pointerHeld = false

    const onKeyDown = (event: KeyboardEvent) => {
      // Keys typed into a design, as when interacting with it, are the design's. Shadow DOM hands this listener the
      // frame instead of the element inside it, so the frame is found on the event's path.
      // A lens's own window has elements of its own, which aren't this window's `HTMLElement`s.
      if (event.composedPath().some((element) => isElement(element) && element.hasAttribute("data-frame"))) {
        return
      }

      // SAFETY: key events reach the window from the focused element, or from the body when nothing has focus.
      const target = event.target as HTMLElement | null
      // A menu or dialog playing its closing animation still holds focus for a moment, but its keys, a field's in it
      // included, are the canvas's again: Ctrl+Z straight after picking an item undoes it (PAR-424).
      const closing = !!target?.closest(":is([role=menu], [role=listbox], [role=dialog])[data-closed]")

      const typing =
        !closing && !!target?.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")

      const inMenu = !closing && !!target?.closest("[role=menu], [role=listbox], [role=dialog]")

      if (typing || inMenu) {
        return
      }

      // Escape mid-drag cancels the drag, a layer's or a design's, rather than selecting the parent.
      if (pointerHeld && event.key === "Escape") {
        return
      }

      // Enter, Tab and the arrows on a focused button, tab, Layers row or other control are that control's: they press
      // it, move focus on, or move within it. They're the canvas's when the canvas, or nothing, has focus, and on a
      // design's title, where Enter selects the layers inside; a title's menus and a board's captions and state labels
      // are controls (`data-canvas-control`).
      const control =
        !!target &&
        !closing &&
        target !== target.ownerDocument.body &&
        (!target.closest(".tl-container") || !!target.closest("[data-canvas-control]")) &&
        !!target.closest("button, a[href], [role], [tabindex]")

      if (control && (event.key === "Enter" || event.key === "Tab" || event.key.startsWith("Arrow"))) {
        return
      }

      const mod = event.ctrlKey || event.metaKey

      const handled = () => {
        event.preventDefault()
        event.stopImmediatePropagation()
        handledKeys.add(event.code)
      }

      // Esc stops following someone before it steps back out of the selection.
      if (event.key === "Escape" && session?.editor && escapeOnCanvas(session.editor)) {
        handled()

        return
      }

      const command = shortcutFor(event, canvasCommands)

      if (command) {
        const action = actions[command]

        // A key that doesn't apply now does what it would anyway, as Enter on a button, unless it's a Ctrl shortcut.
        if (!commandsFor()[command].enabled) {
          if (!mod) {
            return
          }

          handled()
          // Tried while it doesn't apply: recorded, without running.
          void action.run("key", { event })

          return
        }

        handled()
        void action.run("key", { event })

        return
      }

      // A key no command of Parity's has can be an extension's (PAR-1092).
      if (session && runExtensionKey(session, event)) {
        handled()

        return
      }

      // The browser's own Ctrl shortcuts for these would select the page's text or act on nothing here.
      if (mod && ["c", "x", "v", "d", "g", "a"].includes(event.key.toLowerCase())) {
        handled()
      }
      // Nudging is the keymap's: tldraw would move the selected design with the arrows the keymap doesn't bind.
      else if (event.key.startsWith("Arrow")) {
        const { design, note, reference } = selection.get()

        if (design || note || reference) {
          handled()
        }
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (!handledKeys.delete(event.code)) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
    }

    const onPointerDown = () => {
      pointerHeld = true
    }

    const onPointerUp = () => {
      pointerHeld = false
    }

    return onEachWindow((target) => {
      target.addEventListener("keydown", onKeyDown, { capture: true })
      target.addEventListener("keyup", onKeyUp, { capture: true })
      target.addEventListener("pointerdown", onPointerDown, { capture: true })
      target.addEventListener("pointerup", onPointerUp, { capture: true })
      target.addEventListener("pointercancel", onPointerUp, { capture: true })
      // A release outside the window never arrives, so leaving it ends the hold too.
      target.addEventListener("blur", onPointerUp)

      return () => {
        target.removeEventListener("blur", onPointerUp)
        target.removeEventListener("keydown", onKeyDown, { capture: true })
        target.removeEventListener("keyup", onKeyUp, { capture: true })
        target.removeEventListener("pointerdown", onPointerDown, { capture: true })
        target.removeEventListener("pointerup", onPointerUp, { capture: true })
        target.removeEventListener("pointercancel", onPointerUp, { capture: true })
      }
    })
  }, [selection, active, session])
}
