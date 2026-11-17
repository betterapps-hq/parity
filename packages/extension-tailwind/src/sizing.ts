/** A length a width can be set to: a step of the scale, `px`, a bracketed length that isn't a percentage, or a variable. */
const fixedLength = /^(\d+(\.\d+)?|px|\[[^\]%]+\]|\(--[\w-]+\))$/

/**
 * Whether the classes a component writes on its own element set its size, so text put inside is cut off or spills out
 * rather than sizing it (PAR-518): a width (`size-8`, `w-10`, `w-(--sidebar-width)`), a height under a line of text
 * (`h-px`), or `@container`, whose width doesn't come from what's inside. Classes for its own states
 * (`data-horizontal:h-px`) count; ones it takes from elsewhere (`group-data-[size=sm]/avatar:size-6`) or that style
 * what's inside it (`[&_svg]:size-4`) don't.
 */
export function setsOwnSize(classes: readonly string[]): boolean {
  return classes.some(sizingClass)
}

function sizingClass(token: string): boolean {
  // Variants are split at colons outside brackets: `data-[size=lg]:size-10`.
  const parts = token.replace(/^!/, "").split(/:(?![^[]*\])/)
  const utility = parts.pop() ?? ""

  if (!parts.every((variant) => /^(data|aria)-/.test(variant))) {
    return false
  }

  if (/^@container(\/|$)/.test(utility)) {
    return true
  }

  const [, axis, value] = /^(size|w|h)-(.+)$/.exec(utility) ?? []

  if (!axis || !value || !fixedLength.test(value)) {
    return false
  }

  // A height holds text unless it's under a line: 16px, step 4.
  return axis !== "h" || value === "px" || Number(value) < 4
}
