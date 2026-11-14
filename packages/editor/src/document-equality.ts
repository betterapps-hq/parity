import type { CanvasDocument, ContainerSpec, ContainerViewSettings } from "@parity-app/core"

/**
 * A design's view without what says nothing: every state not shown, no modes or variants beside the defaults, the
 * first state named as the one shown. Undefined when nothing is left, so turning a view setting on and off again gives
 * back the view the file had. A frame has none, since it shows only the primary mode, and only a component names a
 * state, since only a component has states.
 */
export function tidyView(
  container: Pick<ContainerSpec, "states" | "kind">,
  view: ContainerViewSettings | undefined
): ContainerViewSettings | undefined {
  if (!view || container.kind === "frame") {
    return undefined
  }

  const next: ContainerViewSettings = { ...view }

  if (!next.allStates || container.kind !== "component") {
    delete next.allStates
  }

  if (next.modes?.length === 0) {
    delete next.modes
  }

  if (next.order?.length === 0) {
    delete next.order
  }

  if (next.scales && Object.keys(next.scales).length === 0) {
    delete next.scales
  }

  if (next.variants && Object.keys(next.variants).length === 0) {
    delete next.variants
  }

  if (next.state === undefined || next.state === container.states?.[0]?.id || container.kind !== "component") {
    delete next.state
  }

  if (next.mode === undefined) {
    delete next.mode
  }

  return Object.keys(next).length > 0 ? next : undefined
}

/** A design with its view tidied; the same design when that changes nothing. */
export function withTidyView(container: ContainerSpec, view = container.view): ContainerSpec {
  const tidy = tidyView(container, view)

  if (sameValue(tidy, container.view)) {
    return container
  }

  const next: ContainerSpec = { ...container }

  if (tidy) {
    next.view = tidy
  } else {
    delete next.view
  }

  return next
}

/**
 * Whether two versions of a project file would say the same: the same designs, notes and settings, with views compared
 * tidied. Designs the two share are skipped, so comparing a file with a few changes stays cheap.
 */
export function sameDocument(a: CanvasDocument, b: CanvasDocument): boolean {
  if (a === b) {
    return true
  }

  const { containers: first, ...restA } = a
  const { containers: second, ...restB } = b

  if (first.length !== second.length || !sameValue(restA, restB)) {
    return false
  }

  return first.every((container, index) => sameDesign(container, second[index]!))
}

/** Whether two versions of a design would say the same in a file, with their views compared tidied. */
export function sameDesign(a: ContainerSpec, b: ContainerSpec): boolean {
  if (a === b) {
    return true
  }

  return sameValue({ ...a, view: tidyView(a, a.view) }, { ...b, view: tidyView(b, b.view) })
}

/** Deep equality as JSON sees it: key order doesn't matter, and a key set to undefined is a key left out. */
// A file's parsed values hold component props, which core's schema leaves `unknown`, so this compares values as given.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }

  // Anything but an object or an array (a string, number, boolean, null or undefined) equals only itself.
  if (a === null || a === undefined || b === null || b === undefined || Object(a) !== a || Object(b) !== b) {
    return false
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return false
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => sameValue(value, b[index]))
  }

  const first = Object.entries(a).filter(([, value]) => value !== undefined)
  const second = new Map(Object.entries(b).filter(([, value]) => value !== undefined))

  return first.length === second.size && first.every(([key, value]) => sameValue(value, second.get(key)))
}
