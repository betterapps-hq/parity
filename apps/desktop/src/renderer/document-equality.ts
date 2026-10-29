import type { CanvasDocument, ContainerSpec, ContainerViewSettings } from "@parity/core"

/**
 * A design's view without what says nothing: every state not shown, no modes or variants beside the defaults, the
 * first state named as the one shown. Undefined when nothing is left, so turning a view setting on and off again gives
 * back the view the file had.
 */
export function tidyView(
  container: Pick<ContainerSpec, "states">,
  view: ContainerViewSettings | undefined
): ContainerViewSettings | undefined {
  if (!view) return undefined
  const next: ContainerViewSettings = { ...view }
  if (!next.allStates) delete next.allStates
  if (next.modes?.length === 0) delete next.modes
  if (next.variants && Object.keys(next.variants).length === 0) delete next.variants
  if (next.state === undefined || next.state === container.states[0]?.id) delete next.state
  if (next.mode === undefined) delete next.mode
  return Object.keys(next).length > 0 ? next : undefined
}

/** A design with its view tidied; the same design when that changes nothing. */
export function withTidyView(container: ContainerSpec, view = container.view): ContainerSpec {
  const tidy = tidyView(container, view)
  if (sameValue(tidy, container.view)) return container
  const next: ContainerSpec = { ...container }
  if (tidy) next.view = tidy
  else delete next.view
  return next
}

/**
 * Whether two versions of a project file would say the same: the same designs, notes and settings, with views compared
 * tidied. Designs the two share are skipped, so comparing a file with a few changes stays cheap.
 */
export function sameDocument(a: CanvasDocument, b: CanvasDocument): boolean {
  if (a === b) return true
  const { containers: first, ...restA } = a
  const { containers: second, ...restB } = b
  if (first.length !== second.length || !sameValue(restA, restB)) return false
  return first.every((container, index) => sameContainer(container, second[index]!))
}

function sameContainer(a: ContainerSpec, b: ContainerSpec): boolean {
  if (a === b) return true
  return sameValue({ ...a, view: tidyView(a, a.view) }, { ...b, view: tidyView(b, b.view) })
}

/** Deep equality as JSON sees it: key order doesn't matter, and a key set to undefined is a key left out. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => sameValue(value, b[index]))
  }
  const keys = (value: object) => Object.keys(value).filter((key) => Reflect.get(value, key) !== undefined)
  const first = keys(a)
  const second = keys(b)
  return first.length === second.length && first.every((key) => sameValue(Reflect.get(a, key), Reflect.get(b, key)))
}
