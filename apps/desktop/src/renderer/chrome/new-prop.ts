import type { ValuePropType } from "@parity-app/core"
import { useSyncExternalStore } from "react"

/**
 * The prop being added in a component design's Props: its kind, chosen from Add, while its name is typed, and why the
 * last name was refused. It outlasts the panel drawing again, as it does when the canvas's hover changes.
 */
interface NewProp {
  design: string
  type: ValuePropType
  error?: string
}

let state: NewProp | undefined
const listeners = new Set<() => void>()

function set(next: NewProp | undefined): void {
  state = next

  for (const listener of listeners) {
    listener()
  }
}

/** Starts adding a prop of `type`, or stops with `undefined`. */
export function startNewProp(design: string, type: ValuePropType | undefined): void {
  set(type === undefined ? undefined : { design, type })
}

/** Says why the name typed for the new prop can't be used. */
export function refuseNewProp(error: string): void {
  if (state) {
    set({ ...state, error })
  }
}

export function useNewProp(design: string): NewProp | undefined {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    () => state
  )

  return current?.design === design ? current : undefined
}
