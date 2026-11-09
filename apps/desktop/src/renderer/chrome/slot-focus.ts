import { useSyncExternalStore } from "react"

/**
 * Which slot's name a component design's Props should focus, so a layer's slot chip or a new slot lands there, and why
 * the last rename was refused. Both outlast the panel drawing again, as it does when the canvas's hover changes. A
 * slot is known by its layout, since a rename changes its name.
 */
interface SlotFocus {
  design: string
  node: string
  /** Set until the slot's row has taken focus. */
  focus?: boolean
  error?: string
}

let state: SlotFocus | undefined
const listeners = new Set<() => void>()

function set(next: SlotFocus | undefined): void {
  state = next

  for (const listener of listeners) {
    listener()
  }
}

/** Asks Props to focus the name of the slot that `node` is, forgetting any refusal. */
export function focusSlot(design: string, node: string): void {
  set({ design, node, focus: true })
}

/** The slot's row has taken focus. */
export function slotFocused(): void {
  if (state?.focus) {
    set({ ...state, focus: undefined })
  }
}

/** Says why a rename of the slot `node` was refused, or clears it with `undefined`. */
export function refuseSlotName(design: string, node: string, error: string | undefined): void {
  const refused: SlotFocus = { design, node }

  if (error) {
    refused.error = error
  }

  set(refused)
}

export function useSlotFocus(design: string): SlotFocus | undefined {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    () => state
  )

  return current?.design === design ? current : undefined
}
