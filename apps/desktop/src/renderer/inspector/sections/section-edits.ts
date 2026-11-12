import type { NodeStyle } from "@parity-app/core"
import type { Capabilities, RowKey, StyleControl, StyleEdit, StyleRow } from "@parity-app/editor"
import { useContext, useEffect, useMemo, useRef } from "react"
import { ProjectContext } from "../../canvas/context.ts"
import { GestureRun } from "../../canvas/gesture.ts"
import { FieldTarget } from "../../chrome/fields.tsx"
import type { StyleEditor } from "../../chrome/style-editor.ts"
import type { LiveEdits } from "../controls/field-parts.tsx"

/** Makes a row's edit of every selected layer, with what Undo calls it. */
export type SectionEdit = <R extends StyleRow>(row: R, edit: StyleEdit<RowKey<R>>, label: string) => void

/** What every one of the Design tab's style sections works from. */
export interface SectionProps {
  editor: StyleEditor
  /** What the selected layers can do together. */
  can: Capabilities
  /** Whether one of the controls only some layers get shows, as `@parity-app/editor`'s `styleTable` says. */
  shows: (control: StyleControl) => boolean
  edit: SectionEdit
}

/** A section's edits of the style, and the live edits its controls make them through. */
export interface SectionEdits {
  edit: SectionEdit
  live: LiveEdits
}

/** Whether a row's keys are changed in the state edited or differ across the layers, and how to reset them. */
export function rowState(editor: StyleEditor, row: StyleRow) {
  return {
    changed: editor.selection.changed(row),
    mixed: editor.selection.differs(row),
    onReset: () => editor.reset(row)
  }
}

/** Whether one property differs across the selected layers; never, with one layer. */
export function mixedOf(editor: StyleEditor): (name: keyof NodeStyle) => boolean {
  return (name) => editor.selection.mixed.includes(name)
}

/**
 * The controls' edits of the style, and the live edits they make them through (`LiveEditsContext`): what's typed or
 * scrubbed shows on the canvas as a preview until it's made, and a run of Up and Down presses is one undo step, as the
 * fields have always done (CAN-48, PAR-441). A control calls its `onChange` either way; this sends the edit to the
 * preview, to the run, or to the design.
 */
export function useSectionEdits(editor: StyleEditor): SectionEdits {
  const store = useContext(ProjectContext)?.store
  const target = useContext(FieldTarget)
  const mode = useRef<"make" | "preview" | "step">("make")
  // A run of presses lasts while only Up and Down are pressed on one selection (`GestureRun`).
  const run = useMemo(() => (store ? new GestureRun(store, "fieldNudge") : undefined), [store])
  useEffect(() => () => run?.end(), [run])
  useEffect(() => run?.select(target), [run, target])

  const during = (next: "preview" | "step", change: () => void) => {
    mode.current = next

    try {
      change()
    } finally {
      mode.current = "make"
    }
  }

  const edit: SectionEdit = (row, change, label) => {
    if (mode.current === "preview") {
      editor.preview?.(row, change)

      return
    }

    if (mode.current === "make") {
      run?.end()
    }

    editor.set(row, change, label, mode.current === "step" ? run?.gesture(target) : undefined)
  }

  const live: LiveEdits = {
    preview: (change) => during("preview", change),
    cancel: () => editor.endPreview?.(),
    step: (change) => during("step", change),
    endRun: () => run?.end()
  }

  return { edit, live }
}
