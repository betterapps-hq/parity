import {
  type CanvasDocument,
  type ContainerSpec,
  type ContainerViewSettings,
  designStates,
  type ModeSettings,
  previewOf,
  resolveModes
} from "@parity-app/core"
import { sameValue, withTidyView } from "./document-equality.ts"

/** What a design's view may still name: the project's modes, and its route's params where it's a page of the app. */
export interface ViewScope {
  modes: ModeSettings
  /** A page's route's params, by name; leave it out for a design that isn't a page, and its params are kept. */
  params?: readonly string[]
}

/**
 * A design's view without what it names that's gone (see `withPrunedView`), or the same view when nothing is: the
 * modes it shows, orders and scales that the project no longer has, the states it shows or orders that the design no
 * longer has, the previews of either, and the values of params its route no longer takes.
 */
export function prunedView(design: ContainerSpec, scope: ViewScope): ContainerViewSettings | undefined {
  const { view } = design

  if (!view) {
    return view
  }

  const modes = new Set(resolveModes(scope.modes).map((mode) => mode.id))
  const states = new Set(designStates(design).map((state) => state.id))
  const params = scope.params && new Set(scope.params)
  const next: ContainerViewSettings = { ...view }
  const isMode = (id: string) => modes.has(id)
  const isState = (id: string) => states.has(id)

  if (next.mode !== undefined && !isMode(next.mode)) {
    delete next.mode
  }

  if (next.state !== undefined && !isState(next.state)) {
    delete next.state
  }

  next.modes = next.modes?.filter(isMode)
  next.order = next.order?.filter(isMode)
  next.states = next.states?.filter(isState)
  next.stateOrder = next.stateOrder?.filter(isState)
  next.scales = next.scales && keep(next.scales, isMode)

  next.previews =
    next.previews &&
    keep(next.previews, (key) => {
      const { state, mode } = previewOf(key)

      // A screen's or a frame's one state is its base, which its previews may name or leave blank.
      return isMode(mode) && (state === "" || isState(state))
    })

  next.params = next.params && params ? keep(next.params, (name) => params.has(name)) : next.params

  for (const field of ["modes", "order", "states", "stateOrder", "scales", "previews", "params"] as const) {
    if (next[field] === undefined) {
      delete next[field]
    }
  }

  return sameValue(next, view) ? view : next
}

/**
 * A design whose view names nothing that's gone: a mode the project took away, a state the design no longer has, as a
 * story taken out of its file, or a param its route renamed, so nothing stale shows in its menus or piles up in its
 * file. The same design when its view names nothing that's gone.
 */
export function withPrunedView(design: ContainerSpec, scope: ViewScope): ContainerSpec {
  const view = prunedView(design, scope)

  return view === design.view ? design : withTidyView(design, view)
}

/** A record's entries whose keys pass `test`. */
function keep<T>(record: Readonly<Record<string, T>>, test: (key: string) => boolean): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => test(key)))
}

/**
 * A design file with every design's view pruned (see `withPrunedView`), as the project's modes change, its designs'
 * params kept. The same document when nothing in it names anything that's gone.
 */
export function prunedDocument(document: CanvasDocument, modes: ModeSettings): CanvasDocument {
  const containers = document.containers.map((design) => withPrunedView(design, { modes }))

  return containers.every((design, at) => design === document.containers[at]) ? document : { ...document, containers }
}
