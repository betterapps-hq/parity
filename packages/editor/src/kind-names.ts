import type { ContainerKind } from "@parity-app/core"

/**
 * What a design is called in a sentence: its kind, "screen", "component" or "frame". A container with no kind is a
 * screen. Labels and messages use it rather than "design", which names the inspector's tab, not a thing.
 */
export function kindName(kind: ContainerKind | undefined): string {
  return kind ?? "screen"
}

/** The same, starting with a capital, for a label of its own: "Screen name". */
export function kindTitle(kind: ContainerKind | undefined): string {
  const name = kindName(kind)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** The order kinds are named in a mix, as the canvas's menus and Layers list them. */
const kindOrder: readonly string[] = ["screen", "component", "frame"]

/**
 * Screens and components counted by kind, for a label that names what it acts on: "screen" for one, "2 components" for
 * several of one kind, and "3 screens and components" for a mix, screens first.
 */
export function kindsName(kinds: readonly (ContainerKind | undefined)[]): string {
  if (kinds.length === 1) return kindName(kinds[0])
  const rank = (name: string) => (kindOrder.includes(name) ? kindOrder.indexOf(name) : kindOrder.length)
  const plural = [...new Set(kinds.map(kindName))].sort((a, b) => rank(a) - rank(b)).map((name) => `${name}s`)
  const list = plural.length === 1 ? plural[0]! : `${plural.slice(0, -1).join(", ")} and ${plural.at(-1)}`
  return `${kinds.length} ${list}`
}
