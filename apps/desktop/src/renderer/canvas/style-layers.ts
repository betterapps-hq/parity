/** What a preview writes inline on: an element's own style. */
export interface Styled {
  style: Pick<CSSStyleDeclaration, "getPropertyValue" | "setProperty" | "removeProperty">
}

interface Written {
  /** The property's inline value before any preview wrote it, empty when it had none. */
  base: string
  /** Each preview's value, by its key, the latest last: the latest is what's drawn. */
  by: Map<string, string>
}

/**
 * Inline values written by previews, by element and property: several previews can write one property, as when a
 * person scrubs a field while someone else's drag shows, and each takes back only its own. What was there before any of
 * them comes back once the last lets go.
 */
const written = new WeakMap<Styled, Map<string, Written>>()

/** Writes `value` for preview `key` on an element's `name` (empty removes it), over what other previews wrote. */
export function writeLayer(element: Styled, name: string, key: string, value: string): void {
  const properties = written.get(element) ?? new Map<string, Written>()
  written.set(element, properties)
  const property = properties.get(name) ?? { base: element.style.getPropertyValue(name), by: new Map() }
  properties.set(name, property)
  property.by.delete(key)
  property.by.set(key, value)
  apply(element, name, value)
}

/** Takes back what preview `key` wrote on an element's `name`: the latest other preview's value shows, or the base. */
export function takeLayer(element: Styled, name: string, key: string): void {
  const property = written.get(element)?.get(name)

  if (!property?.by.delete(key)) {
    return
  }

  const latest = [...property.by.values()].at(-1)
  apply(element, name, latest ?? property.base)

  if (latest === undefined) {
    written.get(element)?.delete(name)
  }
}

/**
 * Forgets what preview `key` wrote on an element's `name`, leaving it drawn, for the change that makes it to draw over.
 * Other previews' values stay; with none, the property is the element's own again.
 */
export function leaveLayer(element: Styled, name: string, key: string): void {
  const property = written.get(element)?.get(name)

  if (property?.by.delete(key) && property.by.size === 0) {
    written.get(element)?.delete(name)
  }
}

function apply(element: Styled, name: string, value: string): void {
  if (value === "") {
    element.style.removeProperty(name)
  } else {
    element.style.setProperty(name, value)
  }
}
