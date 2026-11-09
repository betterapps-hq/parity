import { type ContainerSpec, type ModeSettings, resolveModes, type StateSpec } from "@parity-app/core"

/**
 * Which design, state and viewport an edit lands on (PAR-570). Every edit to a selection, and everything placed at a
 * point on the canvas, works this out the same way: in the state and viewport of the frame it was picked in, or the
 * state the board shows when it wasn't picked in one.
 */

/**
 * Where something was picked: a design, and the frame's mode and state. A selection, a hit on the canvas, a layer's
 * resize handles and the text being edited all say it this way.
 */
export interface Picked {
  design?: string
  mode?: string
  state?: string
}

/** What an edit lands on: the design, the state that takes it, and the viewport whose styles it reads and writes. */
export interface EditFrame {
  /** The design's key. */
  design: string
  container: ContainerSpec
  state: StateSpec
  /** The viewport of the frame it was picked in; none for a design picked whole, which edits the base styles. */
  viewport?: string
}

/** The state the board shows: its own pick, else the first. */
export function activeState(container: ContainerSpec): StateSpec {
  return container.states.find((state) => state.id === container.view?.state) ?? container.states[0]!
}

/** The state edits go to: the one picked, else the one the board shows, as when the picked state is gone. */
export function editingState(container: ContainerSpec, picked: string | undefined): StateSpec {
  return container.states.find((state) => state.id === picked) ?? activeState(container)
}

/**
 * The viewport of the frame a layer was picked in, by its mode: the key its design's responsive patches use, so an edit
 * reads the layer as that frame shows it. None when no frame is known.
 */
export function modeViewport(modes: ModeSettings, mode: string | undefined): string | undefined {
  return mode === undefined ? undefined : resolveModes(modes).find((candidate) => candidate.id === mode)?.viewport
}

/**
 * What an edit to what's `picked` lands on: its design, found through `design`, in the state and viewport of the frame
 * it was picked in (see `editingState` and `modeViewport`). For several designs it's the one picked last. Undefined
 * when no design is picked, as for a note or nothing, or the design is gone.
 */
export function editFrame(
  picked: Picked,
  design: (key: string) => ContainerSpec | undefined,
  modes: ModeSettings
): EditFrame | undefined {
  const container = picked.design === undefined ? undefined : design(picked.design)

  if (!container || picked.design === undefined) {
    return undefined
  }

  const viewport = modeViewport(modes, picked.mode)

  return {
    design: picked.design,
    container,
    state: editingState(container, picked.state),
    ...(viewport === undefined ? {} : { viewport })
  }
}
