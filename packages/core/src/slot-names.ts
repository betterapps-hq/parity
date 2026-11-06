/** The default slot's name: what goes between a component's tags in code. */
export const defaultSlot = "children"

/** Props React or the canvas gives a meaning of their own, so a slot can't take their names. */
const reservedNames = new Set(["key", "ref", "style", "className"])

/**
 * Why a slot can't have this name, worded to follow "its name", or undefined when it can. A slot becomes a prop in
 * code, so its name is one a prop could have.
 */
export function slotNameProblem(name: string): string | undefined {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return "has to start with a letter and have only letters and digits"
  if (reservedNames.has(name)) return `is "${name}", which React keeps for itself`
  return undefined
}

/**
 * A slot name from what someone typed, as code would write it: "Side actions" is `sideActions`. Empty when nothing
 * typed could start one.
 */
export function slotName(text: string): string {
  const words = text
    .trim()
    .replace(/^[^A-Za-z]+/, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  return words
    .map((word, index) =>
      index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join("")
}
