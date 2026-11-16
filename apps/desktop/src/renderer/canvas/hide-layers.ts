import { styleElements } from "./element-lift.ts"

/** Elements and everything inside them, each before what it holds. */
function andInside(elements: readonly Element[]): Element[] {
  return elements.flatMap((element) => [element, ...element.querySelectorAll("*")])
}

/**
 * Hides `elements` and everything inside them, one by one: visibility is inherited, so one inside that sets its own
 * would otherwise still show. They keep their place, as a hidden element does. Whatever's collapsed in `drawn`, the
 * same elements or the layers they're copies of, stays collapsed, since a collapsed table row or flex item takes no room
 * and a hidden one would. Gives back what shows them again.
 */
export function hideLayers(elements: readonly Element[], drawn: readonly Element[] = elements): () => void {
  const looks = andInside(drawn)

  const parts = andInside(elements).filter((_, index) => {
    const look = looks[index]

    return !look || getComputedStyle(look).visibility !== "collapse"
  })

  return styleElements(parts, { visibility: "hidden" })
}
