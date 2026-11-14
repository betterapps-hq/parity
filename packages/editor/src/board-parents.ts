import { renderProblem } from "@parity-app/core"
import { componentLabel } from "./insert.ts"
import { neededWrapper } from "./render-failures.ts"

/**
 * Where a board's search for what its part needs around it stands (read-only viewer): the parents it draws in now,
 * outermost first, the parents that got it further, the parents tried at this step that didn't, and the error it
 * last failed with. A part of the project's own UI kit doesn't say what it goes inside, so its board learns it by
 * trying, as AvatarImage needs Avatar, and TabsTrigger needs TabsList inside Tabs.
 */
export interface BoardParents {
  chain: string[]
  kept: string[]
  tried: string[]
  error?: string
  /**
   * The first chain it drew in without failing but showing nothing, as an inactive TabsContent hides what's in it:
   * where it stays if no chain shows it, since an AvatarImage with no picture shows nothing anywhere.
   */
  quiet?: string[]
  /** How many chains it's drawn in, to stop a search that goes nowhere. */
  trials: number
  /** It drew, or nothing's left to try. */
  done: boolean
}

/** A board's first search: no parents, nothing tried. */
export const noBoardParents: BoardParents = { chain: [], kept: [], tried: [], trials: 0, done: false }

/** How many chains a board tries before it stops and shows its error. */
const maxTrials = 12

/**
 * The next parents to draw a board's `part` in, after it drew in `state.chain` and `failure` was the first of its
 * layers to fail, `"nothing"` when nothing failed but the part drew nothing, or undefined when it drew. Only a part that needs a parent or provider (`renderProblem`)
 * searches. A chain in which the part failed with another error got it further, so it's kept and the search goes on
 * from it; one in which it failed the same way, or a parent tried failed itself, is dropped for the next of
 * `group`, the components of the part's file. It tries, in order, the component the error names, the components whose
 * names begin the part's (Tabs for TabsTrigger), each outermost, then the rest of its file, each nearest the part.
 */
export function nextBoardParents(
  part: string,
  group: readonly string[],
  state: BoardParents,
  failure: { component: string; error: string } | "nothing" | undefined
): BoardParents {
  if (state.done) {
    return state
  }

  if (failure === undefined) {
    return { ...state, kept: state.chain, done: true }
  }

  const nothing = failure === "nothing"
  const error = nothing ? (state.error ?? "") : failure.error
  const trying = state.chain.length !== state.kept.length
  const stuck = nothing || (trying && (error === state.error || failure.component !== part))
  const kept = stuck ? state.kept : state.chain
  const tried = stuck ? [...state.tried, ...state.chain.filter((each) => !state.kept.includes(each))] : []
  const quiet = state.quiet ?? (nothing ? state.chain : undefined)
  const base: BoardParents = { ...state, kept, tried, error: stuck ? state.error : error }

  if (quiet) {
    base.quiet = quiet
  }

  // Where it ends: the chain that drew it without failing, though it showed nothing, else the furthest it got.
  const end = { ...base, chain: quiet ?? kept, done: true }

  if (renderProblem(base.error ?? error) !== "provider" || state.trials >= maxTrials) {
    return end
  }

  const next = candidates(part, group, base.error ?? error).find(
    ({ component }) => !kept.includes(component) && !tried.includes(component)
  )

  if (!next) {
    return end
  }

  const chain = next.outermost ? [next.component, ...kept] : [...kept, next.component]

  return { ...base, chain, trials: state.trials + 1 }
}

/** The components a part might go inside, most likely first, and whether each goes outside the others. */
function candidates(
  part: string,
  group: readonly string[],
  error: string
): { component: string; outermost: boolean }[] {
  const name = componentLabel(part)
  const others = group.filter((component) => component !== part)
  const wrapper = neededWrapper(error)
  const named = wrapper && "parent" in wrapper ? wrapper.parent : undefined

  const prefixes = others
    .filter((component) => name.startsWith(componentLabel(component)))
    .sort((a, b) => componentLabel(a).length - componentLabel(b).length)

  return [
    ...others.flatMap((component) =>
      componentLabel(component) === named ? [{ component, outermost: prefixes.includes(component) }] : []
    ),
    ...prefixes.map((component) => ({ component, outermost: true })),
    ...others.flatMap((component) => (prefixes.includes(component) ? [] : [{ component, outermost: false }]))
  ]
}
