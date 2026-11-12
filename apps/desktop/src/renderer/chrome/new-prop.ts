import type { ValuePropType } from "@parity-app/core"
import { useSyncExternalStore } from "react"
import { projectPart } from "../project-part.ts"
import type { ProjectSession } from "../workspace.ts"

/**
 * The prop being added in a component design's Props: its kind, chosen from Add, while its name is typed, and why the
 * last name was refused. It outlasts the panel drawing again, as it does when the canvas's hover changes, and goes when
 * its tab closes.
 */
interface NewProp {
  design: string
  type: ValuePropType
  error?: string
}

type Session = Pick<ProjectSession, "untilClosed">

/** One open project's prop being added, if any. */
class NewPropState {
  private state: NewProp | undefined
  private readonly listeners = new Set<() => void>()

  get = (): NewProp | undefined => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  set(next: NewProp | undefined): void {
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

/** An open project's prop being added, dropped when its tab closes. */
export const newPropOf = projectPart((_session: Session) => new NewPropState())

/** Starts adding a prop of `type`, or stops with `undefined`. */
export function startNewProp(session: Session, design: string, type: ValuePropType | undefined): void {
  newPropOf(session).set(type === undefined ? undefined : { design, type })
}

/** Says why the name typed for the new prop can't be used. */
export function refuseNewProp(session: Session, error: string): void {
  const adding = newPropOf(session)
  const state = adding.get()

  if (state) {
    adding.set({ ...state, error })
  }
}

export function useNewProp(session: Session, design: string): NewProp | undefined {
  const adding = newPropOf(session)
  const current = useSyncExternalStore(adding.subscribe, adding.get)

  return current?.design === design ? current : undefined
}
