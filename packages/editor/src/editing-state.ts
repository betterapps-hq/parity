import type { ContainerSpec, StateSpec } from "@parity-app/core"

/** The state a design's board shows: the one its view picks, else its base. */
export function activeState(container: ContainerSpec): StateSpec {
  return container.states.find((state) => state.id === container.view?.state) ?? container.states[0]!
}

/**
 * The state edits go to: the one the layer was picked in, else the one the design's board shows. The panels, the
 * canvas's gestures, its menu and every drop and paste read and write a layer in this state.
 */
export function editingState(container: ContainerSpec, picked: string | undefined): StateSpec {
  return container.states.find((state) => state.id === picked) ?? activeState(container)
}
