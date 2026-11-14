import { type ContainerSpec, type ContainerViewSettings, designStates, type StateSpec } from "./document.ts"

/*
 * A design's rows on the canvas: the states it shows, a row each, in its own order (PAR-1071). A Storybook file's
 * stories are its states, so its board has a row per story it shows. Any state can be off while another shows.
 */

/** A design's states in its own order (`stateOrder`), those it doesn't name after them in the design's order. */
export function orderedStates(design: Pick<ContainerSpec, "states" | "view">): StateSpec[] {
  const states = designStates(design)
  const order = design.view?.stateOrder ?? []
  const named = order.flatMap((id) => states.filter((state) => state.id === id))

  return [...named, ...states.filter((state) => !order.includes(state.id))]
}

/**
 * The states a design shows, a row each, in its order: those its view lists, every one where it shows them all, or else
 * the one it's set to show, the first by default.
 */
export function shownStates(design: Pick<ContainerSpec, "states" | "view">): StateSpec[] {
  const ordered = orderedStates(design)
  const view = design.view
  const listed = view?.states ? ordered.filter((state) => view.states!.includes(state.id)) : []

  if (listed.length > 0) {
    return listed
  }

  if (view?.allStates) {
    return ordered
  }

  const states = designStates(design)

  return [states.find((state) => state.id === view?.state) ?? states[0]!]
}

/**
 * A design's view showing these states, at least one, in the fewest words: every state as `allStates`, one as the
 * `state` it shows (unwritten for the first), and several as the list of them.
 */
export function withShownStates(
  view: ContainerViewSettings,
  design: Pick<ContainerSpec, "states">,
  ids: readonly string[]
): ContainerViewSettings {
  const states = designStates(design)
  const shown = states.filter((state) => ids.includes(state.id))

  if (shown.length === 0) {
    return view
  }

  const next: ContainerViewSettings = { ...view }
  delete next.states
  delete next.allStates

  if (shown.length === 1) {
    if (shown[0] === states[0]) {
      delete next.state
    } else {
      next.state = shown[0]!.id
    }
  } else if (shown.length === states.length) {
    next.allStates = true
  } else {
    next.states = shown.map((state) => state.id)
  }

  return next
}

/** A design's view with its states in this order, unwritten where it's the design's own. */
export function withStateOrder(
  view: ContainerViewSettings,
  design: Pick<ContainerSpec, "states">,
  order: readonly string[]
): ContainerViewSettings {
  const next: ContainerViewSettings = { ...view }

  if (designStates(design).every((state, index) => state.id === order[index])) {
    delete next.stateOrder
  } else {
    next.stateOrder = [...order]
  }

  return next
}

/**
 * A design's order once one of the entries it shows moves from one place among those shown to another (`to`, where it
 * lands among them), as a row or a column is carried on its board: entries it doesn't show keep their places.
 */
export function reorderShown(ordered: readonly string[], shown: readonly string[], from: number, to: number): string[] {
  const visible = ordered.filter((id) => shown.includes(id))

  if (from < 0 || from >= visible.length || to < 0 || to >= visible.length || from === to) {
    return [...ordered]
  }

  const [entry] = visible.splice(from, 1)
  visible.splice(to, 0, entry!)
  let next = 0

  return ordered.map((id) => (shown.includes(id) ? visible[next++]! : id))
}
