import type { Transition } from "@parity-app/core"
import { useState } from "react"
import type { TransitionEntry } from "../controls/motion-data.ts"
import { newEntryId, TransitionsSection } from "../controls/transitions.tsx"
import { entriesOf, transitionsOf } from "../motion-values.ts"
import type { SectionProps } from "./section-edits.ts"

/**
 * Motion, on the approved Transition list (PAR-186): the selected layers' transitions, in the state being edited, with
 * the project's durations and easings in their fields. A state change on the canvas plays them. Layers whose lists
 * differ show none, and a list made then replaces each one's. A list saved as a transition token waits for a token kind
 * that holds one, so the list offers no Create token.
 */
export function MotionSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const differs = editor.selection.differs("transitions")
  const entries = useKeyedEntries(differs ? undefined : style.transition)

  const change = (next: TransitionEntry[]) => {
    entries.remember(next)
    edit("transitions", { transition: transitionsOf(next) }, "Change transitions")
  }

  return <TransitionsSection entries={entries.list} onSaveToken={() => undefined} onChange={change} />
}

/**
 * The list's entries, keyed by ids that last across edits: while the layers hold what the last change wrote, its
 * entries keep their ids, so their rows and open details stay put; read afresh, each keeps the id at its place.
 */
function useKeyedEntries(transitions: readonly Transition[] | undefined) {
  const [keyed, setKeyed] = useState<TransitionEntry[]>([])
  const read = entriesOf(transitions)
  // Compared as the list writes them, so the order the document gives each one's keys in doesn't count.
  const current = JSON.stringify(transitionsOf(keyed)) === JSON.stringify(transitionsOf(read.map(withId(""))))
  let list = keyed

  if (!current) {
    list = read.map((entry, index) => withId(keyed[index]?.id ?? newEntryId())(entry))
    setKeyed(list)
  }

  return { list, remember: setKeyed }
}

const withId =
  (id: string) =>
  (entry: Omit<TransitionEntry, "id">): TransitionEntry => ({ ...entry, id })
