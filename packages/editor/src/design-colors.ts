import { type DesignNode, walkNodes } from "@parity-app/core"

/*
 * The colors a design uses, which a color picker offers under In this design: each color its layers' styles write out
 * (`{ value: "#2563eb" }`), in fills, text, strokes, shadows and gradient stops alike. A color token isn't one, since
 * the picker lists the project's tokens on their own.
 */

/** A color as CSS writes it out: hex, or one of its color functions. */
const writtenColor = /^(#[\da-f]{3,8}|(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(.*\))$/i

/** A color written out in a style, wherever it's held: the `value` of a color (`"value":"#2563eb"`). */
const heldColor = /"value":"([^"]+)"/g

/** Every color written out somewhere in a style, read from the style as JSON writes it. */
function colorsIn(style: DesignNode["style"], found: (color: string) => void) {
  for (const [, value] of JSON.stringify(style ?? {}).matchAll(heldColor)) {
    if (value !== undefined && writtenColor.test(value.trim())) {
      found(value.trim())
    }
  }
}

/**
 * The colors a design's layers write out, most used first and then in the order the layers come, the same color
 * written two ways (`#FFF`, `#fff`) counted once, up to `limit`.
 */
export function designColors(root: DesignNode, limit = 12): string[] {
  const counts = new Map<string, { color: string; uses: number; first: number }>()

  walkNodes(root, (node) => {
    colorsIn(node.style, (color) => {
      const key = color.toLowerCase()
      const seen = counts.get(key)

      if (seen) {
        seen.uses += 1
      } else {
        counts.set(key, { color, uses: 1, first: counts.size })
      }
    })
  })

  return [...counts.values()]
    .toSorted((one, other) => other.uses - one.uses || one.first - other.first)
    .slice(0, limit)
    .map((each) => each.color)
}
