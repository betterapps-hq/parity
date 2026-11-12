import type { NodeStyle } from "@parity-app/core"
import type { Capabilities, RowKey, StyleControl, StyleEdit, StyleRow } from "@parity-app/editor"
import { useContext, useEffect, useMemo, useRef } from "react"
import { ProjectContext } from "../../canvas/context.ts"
import { GestureRun } from "../../canvas/gesture.ts"
import { FieldTarget } from "../../chrome/fields.tsx"
import type { StyleChange, StyleEditor } from "../../chrome/style-editor.ts"
import {
  type FieldSessionEvent,
  initialSession,
  reduceSession,
  type SessionEffect,
  type SessionEvent
} from "../controls/edit-session.ts"
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
  /** Every edit a section makes goes through this, so its fields' previews, runs and Escape reach the design. */
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
 * The Design tab's one edit session (`edit-session.ts`), run against the style editor. A field tells it what happened
 * through `live` (`LiveEditsContext`), with the change that comes to; the edits the change makes through `edit` are
 * gathered, and the session says whether they preview on the canvas, are made, or are one step of a run of Up and Down
 * presses, which Escape takes back (CAN-48, PAR-441, PAR-968). An edit made outside a field's change, as a toggle
 * makes, is made at once.
 */
export function useEditSession(editor: StyleEditor): SectionEdits {
  const store = useContext(ProjectContext)?.store
  const target = useContext(FieldTarget)
  // The edits a field's change is coming to, while it runs.
  const gathering = useRef<StyleChange[]>(undefined)
  // The editor and target as of the last render, since a field's events come after it.
  const now = useRef({ editor, target })
  useEffect(() => {
    now.current = { editor, target }
  })
  // A run of presses is one gesture (`GestureRun`), with a checkpoint Escape takes it back to.
  const run = useMemo(() => (store ? new GestureRun(store, "fieldNudge") : undefined), [store])

  const session = useMemo(() => new SessionRunner(run, now), [run])
  const dispatch = (event: SessionEvent<StyleChange>) => session.dispatch(event)

  // A run ends as the selection changes, and the session as the panel goes, keeping what it made.
  useEffect(() => session.dispatch({ type: "target", target }), [session, target])
  useEffect(() => () => session.dispatch({ type: "end" }), [session])

  const edit: SectionEdit = (row, change, label) => {
    // SAFETY: `change` edits `row`'s keys, which is what a `StyleChange` of any row holds; it's only ever applied to its
    // own row (`StyleEditor.make` and `preview` pass each change's edit with its row).
    const made = { row, edit: change, label } as StyleChange

    if (gathering.current) {
      gathering.current.push(made)
    } else {
      dispatch({ type: "make", edits: [made] })
    }
  }

  const live: LiveEdits = {
    send: (event: FieldSessionEvent, change?: () => void) => {
      const edits: StyleChange[] = []
      gathering.current = edits

      try {
        change?.()
      } finally {
        gathering.current = undefined
      }

      dispatch(event.type === "step" ? { type: "step", edits, target: now.current.target } : { ...event, edits })
    }
  }

  return { edit, live }
}

/** What a session's effects are run against, as of the last render. */
interface SessionTarget {
  editor: StyleEditor
  target: string | undefined
}

/** Keeps a session's state, and runs what it asks for against the style editor and the store's gestures. */
class SessionRunner {
  private state = initialSession
  /** The run of presses under way: its gesture, and the checkpoint Escape takes it back to. */
  private open: { gesture: string; checkpoint?: { revert: () => void } } | undefined

  constructor(
    private readonly run: GestureRun | undefined,
    private readonly now: { readonly current: SessionTarget }
  ) {}

  dispatch(event: SessionEvent<StyleChange>): void {
    const update = reduceSession(this.state, event)
    this.state = update.state

    for (const effect of update.effects) {
      this.apply(effect)
    }
  }

  private apply(effect: SessionEffect<StyleChange>): void {
    const { editor, target } = this.now.current

    switch (effect.type) {
      case "preview":
        return editor.preview(effect.edits)
      case "unpreview":
        return editor.endPreview()
      case "make":
        return editor.make(effect.edits, effect.inRun ? this.open?.gesture : undefined)
      case "beginRun": {
        const gesture = this.run?.gesture(target)
        this.open = gesture === undefined ? undefined : { gesture, checkpoint: editor.checkpoint(gesture) }

        return
      }

      case "endRun":
        this.open = undefined

        return this.run?.end()
      case "revertRun":
        this.open?.checkpoint?.revert()
        this.open = undefined

        return this.run?.cancel()
    }
  }
}
