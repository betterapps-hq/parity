/** Why the project has nothing for a lens yet, and what to do about it, as its canvas and inspector say. */
export interface Unavailable {
  title: string
  description: string
  action: string
}

/** A lens: one layer of the app, with a canvas, a left panel and an inspector of its own, as data. */
export interface Lens<Id extends string = string> {
  id: Id
  name: string
  /** Its icon's name in the app's icon set, such as `route`. */
  icon: string
  /** Where it sits in the lens bar and the View menu, lowest first. */
  order: number
  /** The keys that show it, such as `Ctrl+1`. */
  shortcut?: string
  /** Why the project has nothing for it, when it hasn't. It can still be shown, and says so. */
  unavailable?: Unavailable
}

/** The lenses lowest `order` first, as the View menu lists them. */
export function inOrder<L extends Lens>(lenses: readonly L[]): L[] {
  return lenses.toSorted((a, b) => a.order - b.order)
}

/** The lens bar's order: the lenses the project has, in order, then the ones it has nothing for, at the bottom. */
export function barOrder<L extends Lens>(lenses: readonly L[]): L[] {
  const ordered = inOrder(lenses)

  return [...ordered.filter((lens) => !lens.unavailable), ...ordered.filter((lens) => lens.unavailable)]
}

/** The lens these keys show, if any. */
export function lensForShortcut<L extends Lens>(lenses: readonly L[], keys: string): L | undefined {
  return lenses.find((lens) => lens.shortcut === keys)
}
