import { projectPart } from "../project-part.ts"
import { createStore, useStore } from "../store.ts"
import type { ProjectSession } from "../workspace.ts"

/**
 * Which slot's name a component design's Props should focus, so a layer's slot chip or a new slot lands there, and why
 * the last rename was refused. Both outlast the panel drawing again, as it does when the canvas's hover changes, and go
 * when the tab closes. A slot is known by its layout, since a rename changes its name.
 */
interface SlotFocus {
  design: string
  node: string
  /** Set until the slot's row has taken focus. */
  focus?: boolean
  error?: string
}

type Session = Pick<ProjectSession, "untilClosed">

/** An open project's slot to focus, if any, dropped when its tab closes. */
export const slotFocusOf = projectPart((_session: Session) => createStore<SlotFocus | undefined>(() => undefined))

/** Asks Props to focus the name of the slot that `node` is, forgetting any refusal. */
export function focusSlot(session: Session, design: string, node: string): void {
  slotFocusOf(session).set({ design, node, focus: true })
}

/** The slot's row has taken focus. */
export function slotFocused(session: Session): void {
  const focus = slotFocusOf(session)
  const state = focus.get()

  if (state?.focus) {
    focus.set({ ...state, focus: undefined })
  }
}

/** Says why a rename of the slot `node` was refused, or clears it with `undefined`. */
export function refuseSlotName(session: Session, design: string, node: string, error: string | undefined): void {
  const refused: SlotFocus = { design, node }

  if (error) {
    refused.error = error
  }

  slotFocusOf(session).set(refused)
}

export function useSlotFocus(session: Session, design: string): SlotFocus | undefined {
  const focus = slotFocusOf(session)
  const current = useStore(focus)

  return current?.design === design ? current : undefined
}
