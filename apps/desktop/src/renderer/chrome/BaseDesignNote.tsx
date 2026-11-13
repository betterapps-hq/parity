import { editingState } from "@parity-app/editor"
import { Info } from "lucide-react"
import { useProject } from "../canvas/context.ts"
import { kindColors } from "../canvas/kinds.tsx"
import type { ContainerEntry } from "../design-store.ts"
import { useSelection } from "../selection.ts"
import { baseDesignNote } from "./edit-scope.ts"

/**
 * Says, before anything is changed, that the controls it heads change the design itself, when the Editing control
 * above sends other edits to a state or a variant: `what` can't differ from one state to another. It's tinted as that
 * control is, so the two read together. Nothing shows while edits change the design anyway.
 */
export function BaseDesignNote({ entry, what }: { entry: ContainerEntry; what: string }) {
  const { selection } = useProject()
  const selected = useSelection(selection)
  const note = baseDesignNote(entry.container, editingState(entry.container, selected.state), what)

  if (!note) {
    return null
  }

  return (
    <p
      className="type-message mb-2 flex items-start gap-1.5 rounded-md border px-2.5 py-1.5"
      style={{
        borderColor: kindColors.component,
        background: "color-mix(in oklch, var(--canvas-component) 8%, transparent)"
      }}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" style={{ color: kindColors.component }} aria-hidden />
      <span>{note}</span>
    </p>
  )
}
