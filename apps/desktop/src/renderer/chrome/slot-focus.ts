import { useSyncExternalStore } from "react"

/**
 * Which slot's row is open in a component design's Props, so a layer's slot chip can open it there, and why the last
 * change to it was refused. Both outlast the panel drawing again, as it does when the canvas's hover changes.
 */
interface SlotRowState {
  design: string
  slot: string
  error?: string
}

let state: SlotRowState | undefined
const listeners = new Set<() => void>()

function set(next: SlotRowState | undefined): void {
  state = next
  for (const listener of listeners) listener()
}

/** Opens a slot's row, or closes it with `undefined`, forgetting any refusal. */
export function openSlotRow(design: string, slot: string | undefined): void {
  set(slot === undefined ? undefined : { design, slot })
}

/** Says why a change to the open row was refused, or clears it with `undefined`. */
export function refuseSlotRow(design: string, slot: string, error: string | undefined): void {
  set({ design, slot, ...(error ? { error } : {}) })
}

export function useOpenSlotRow(design: string): { slot: string; error?: string } | undefined {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state
  )
  return current?.design === design ? current : undefined
}
