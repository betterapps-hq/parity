import { useEffect } from "react"
import type { Alignment } from "../chrome/arrange.ts"
import {
  alignSelection,
  closeTab,
  copy,
  copySelectionStyle,
  cut,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  exportImages,
  openProjectFile,
  openProjectFolder,
  paste,
  pasteSelectionStyle,
  renameSelection,
  save,
  saveCopy,
  selectEverything,
  unwrapSelection,
  wrapSelection,
  zoomToSelection
} from "../chrome/commands.ts"
import { togglePanels } from "../chrome/layout.ts"
import { getPreferences, setPreferences } from "../chrome/preferences.ts"
import { openQuickInsert } from "../chrome/QuickInsert.tsx"
import { revealSelection } from "../chrome/reveal.ts"
import type { ProjectSession } from "../workspace.ts"
import { firstChildLayer, parentLayer } from "./layers.ts"

/**
 * Shortcuts for the File menu and the panels. They work anywhere in the window, even in a text field, and with no
 * project open.
 */
export function useAppShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      const command = event.shiftKey
        ? { o: openProjectFile, s: saveCopy, e: () => exportImages("selection") }[key]
        : { o: openProjectFolder, s: save, w: closeTab, "\\": togglePanels }[key]
      if (!command) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void command()
    }
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [])
}

/**
 * Keyboard shortcuts for the active tab. They're handled before tldraw sees them, because the design store, not
 * tldraw, owns undo, deletion and the selection inside designs.
 */
type Command = (session: ProjectSession) => unknown

/** Ctrl (Cmd on a Mac) shortcuts that act on the canvas selection. Keyed by the physical key, so Alt doesn't change it. */
function modCommands(event: KeyboardEvent): Command | undefined {
  const { code, shiftKey: shift, altKey: alt } = event
  if (code === "KeyC") return alt ? copySelectionStyle : shift ? undefined : copy
  if (code === "KeyV") return alt ? pasteSelectionStyle : shift ? undefined : paste
  if (code === "KeyX" && !alt && !shift) return cut
  if (code === "KeyD" && !alt && !shift) return duplicateSelection
  if (code === "KeyA" && !alt && !shift) return selectEverything
  if (code === "KeyG") return shift ? unwrapSelection : wrapSelection
  return undefined
}

const alignKeys: Record<string, Alignment> = {
  KeyA: "left",
  KeyH: "center",
  KeyD: "right",
  KeyW: "top",
  KeyV: "middle",
  KeyS: "bottom"
}

function altCommands(event: KeyboardEvent): Command | undefined {
  if (event.shiftKey) {
    if (event.code === "KeyH") return (session) => distributeSelection("horizontal", session)
    if (event.code === "KeyV") return (session) => distributeSelection("vertical", session)
    return undefined
  }
  const alignment = alignKeys[event.code]
  return alignment ? (session) => alignSelection(alignment, session) : undefined
}

export function useShortcuts(session: ProjectSession | undefined, active: boolean): void {
  useEffect(() => {
    if (!active || !session) return undefined
    const { store, selection } = session

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
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const handled = () => {
        event.preventDefault()
        event.stopImmediatePropagation()
      }

      if (typing || inMenu) return
      if (mod && (key === "z" || key === "y")) {
        handled()
        if (key === "y" || event.shiftKey) store.redo()
        else store.undo()
        return
      }
      // The design store owns copying, pasting, duplicating and grouping; tldraw would act on shapes it doesn't know.
      if (mod) {
        const command = modCommands(event)
        if (command) {
          handled()
          void command(session)
        } else if (["c", "x", "v", "d", "g", "a"].includes(key)) handled()
        return
      }
      // Figma's align keys: Alt with A, H or D across, W, V or S down; with Shift, H and V distribute.
      if (event.altKey) {
        const command = altCommands(event)
        if (!command) return
        handled()
        command(session)
        return
      }
      if (event.shiftKey && key === "a") {
        handled()
        wrapSelection(session)
        return
      }
      if (event.shiftKey && key === "i") {
        handled()
        openQuickInsert()
        return
      }
      if (event.shiftKey && key === "g") {
        handled()
        setPreferences({ layoutGrid: !getPreferences().layoutGrid })
        return
      }

      const current = selection.get()
      const entry = current.design ? store.getEntry(current.design) : undefined
      switch (key) {
        case "v":
          handled()
          selection.setTool("select")
          return
        case "h":
          handled()
          selection.setTool("hand")
          return
        case "t":
          handled()
          selection.setTool("text")
          return
        case "i":
          handled()
          selection.setTool("interact")
          return
        case "/":
          handled()
          openQuickInsert()
          return
        case "escape": {
          handled()
          if (selection.getEditing()) selection.setEditing(undefined)
          else if (selection.getTool() !== "select") selection.setTool("select")
          else if (entry && current.node) {
            const parent = parentLayer(store, entry.container, current.node)
            const toDesign = !parent || parent === entry.container.root.id
            selection.set(
              toDesign
                ? { design: entry.key }
                : { design: entry.key, node: parent, mode: current.mode, state: current.state }
            )
          } else selection.set({})
          return
        }
        case "enter": {
          if (!entry) return
          handled()
          const child = firstChildLayer(store, entry.container, current.node ?? entry.container.root.id)
          if (child) selection.set({ design: entry.key, node: child, mode: current.mode, state: current.state })
          return
        }
        case "delete":
        case "backspace":
          handled()
          deleteSelection(session)
          return
        case "!":
        case "1":
          if (event.shiftKey || key === "!") {
            handled()
            session.editor?.zoomToFit({ animation: { duration: 200 } })
          }
          return
        case "@":
        case "2":
          if (event.shiftKey || key === "@") {
            handled()
            zoomToSelection(session)
          }
          return
        case "f2":
          handled()
          renameSelection(session)
          return
        default:
          if (key.startsWith("arrow") && current.node) {
            handled()
            revealSelection(session)
          }
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [session, active])
}
