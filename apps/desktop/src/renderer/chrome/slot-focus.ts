import { useSyncExternalStore } from "react"
import { projectPart } from "../project-part.ts"
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

/** One open project's slot to focus, if any. */
class SlotFocusState {
  private state: SlotFocus | undefined
  private readonly listeners = new Set<() => void>()

  get = (): SlotFocus | undefined => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  set(next: SlotFocus | undefined): void {
    this.state = next

    for (const listener of this.listeners) {
      listener()
    }
  }

  dispose(): void {
    this.listeners.clear()
    this.state = undefined
  }
}

/** An open project's slot to focus, dropped when its tab closes. */
export const slotFocusOf = projectPart((_session: Session) => new SlotFocusState())

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
  const current = useSyncExternalStore(focus.subscribe, focus.get)

  return current?.design === design ? current : undefined
}
