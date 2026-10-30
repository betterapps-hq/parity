// What a token is, from its value, then its name, else nothing: method E, which you approved on 2026-10-30
// (docs/decisions.md). It reads CSS values and generic English words only, never a framework's naming.

/** The categories a token can be inferred as. `setting` is none of the others: a plain value with no preview. */
export type InferredKind =
  | "color"
  | "gradient"
  | "radius"
  | "border-width"
  | "border"
  | "spacing"
  | "size"
  | "breakpoint"
  | "font-family"
  | "font-size"
  | "font-weight"
  | "line-height"
  | "letter-spacing"
  | "type-style"
  | "shadow"
  | "inset-shadow"
  | "drop-shadow"
  | "text-shadow"
  | "blur"
  | "opacity"
  | "z-index"
  | "duration"
  | "easing"
  | "animation"
  | "aspect"
  | "perspective"
  | "cursor"
  | "setting"

/**
 * A token's kind from what it's worth and what it's called:
 * 1. The value's shape gives the kinds it allows (a resolved value: `var()`s already replaced).
 * 2. When it allows one, that's the kind.
 * 3. Otherwise the name's words choose among those; the name never overrides the value.
 * 4. When they don't, it's a setting, never a guess from the value alone.
 *
 * A DTCG `$type` the author gives narrows the kinds first, and decides when it names one. The group the token is filed
 * under (`font-size`, `motion`) is read after its own name, the same way.
 */
export function inferTokenKind(name: string, value: string, type?: string, group?: string): InferredKind {
  let allowed = valueKinds(simplifyCalc(value.trim()))
  // 0 is a length and a number alike, so a type saying it's either leaves it both.
  const zero = value.trim() === "0" && (type === "number" || type === "dimension")
  const stated = type && !zero ? typeKinds[type] : undefined
  if (stated) {
    const both = allowed.filter((kind) => stated.includes(kind))
    allowed = both.length > 0 ? both : stated
  }
  if (allowed.length === 1) return allowed[0]!
  const named = [...nameKinds(name), ...(group ? nameKinds(group) : [])]
  return named.find((kind) => allowed.includes(kind)) ?? "setting"
}

/** What each DTCG type allows: one kind when it names one, a few when it only says it's a length or a number. */
const typeKinds: Record<string, InferredKind[]> = {
  color: ["color"],
  gradient: ["gradient"],
  fontFamily: ["font-family"],
  fontWeight: ["font-weight"],
  duration: ["duration"],
  cubicBezier: ["easing"],
  border: ["border"],
  typography: ["type-style"],
  shadow: ["shadow", "inset-shadow", "drop-shadow", "text-shadow"],
  dimension: [
    "spacing",
    "size",
    "radius",
    "font-size",
    "line-height",
    "letter-spacing",
    "breakpoint",
    "blur",
    "border-width",
    "perspective"
  ],
  number: ["font-weight", "line-height", "z-index", "opacity", "setting"]
}

const units: Record<string, number> = { px: 1, rem: 16, em: 16 }

function pixels(text: string): number | undefined {
  const match = /^(-?\d*\.?\d+)(px|rem|em)$/.exec(text.trim())
  return match ? Number(match[1]) * units[match[2]!]! : undefined
}

/**
 * A value with each simple `calc()` worked out in pixels: a length times a number (Mantine's `calc(1rem * 1)`, a
 * radius step's `calc(0.625rem * 0.8)`), or two lengths added or taken away. Anything else stays as written.
 */
export function simplifyCalc(value: string): string {
  return value.replaceAll(/calc\(([^()]*)\)/g, (whole, body: string) => {
    const parts = body.trim().split(/\s+/)
    if (parts.length !== 3) return whole
    const [a = "", op, b = ""] = parts
    const [lengthA, lengthB, numberA, numberB] = [pixels(a), pixels(b), Number(a), Number(b)]
    if (op === "*" && lengthA !== undefined && !Number.isNaN(numberB)) return `${lengthA * numberB}px`
    if (op === "*" && lengthB !== undefined && !Number.isNaN(numberA)) return `${lengthB * numberA}px`
    if ((op === "+" || op === "-") && lengthA !== undefined && lengthB !== undefined) {
      return `${op === "+" ? lengthA + lengthB : lengthA - lengthB}px`
    }
    return whole
  })
}

const colorFunction = /^(?:#[\da-f]{3,8}$|(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix|light-dark)\()/i
const namedColor = /^(?:transparent|currentcolor|white|black|red|green|blue|gray|grey)$/i
const lengthText = /^-?\d*\.?\d+(?:px|rem|em|%|vw|vh|dvh|svh|lvh|dvw|svw|lvw|ch|ex|cqw|cqh)$/
const lengthKinds: InferredKind[] = [
  "spacing",
  "size",
  "radius",
  "font-size",
  "line-height",
  "letter-spacing",
  "breakpoint",
  "blur",
  "border-width",
  "perspective"
]

const anyKind: InferredKind[] = [
  "color",
  "gradient",
  "radius",
  "border-width",
  "border",
  "spacing",
  "size",
  "breakpoint",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "type-style",
  "shadow",
  "inset-shadow",
  "drop-shadow",
  "text-shadow",
  "blur",
  "opacity",
  "z-index",
  "duration",
  "easing",
  "animation",
  "aspect",
  "perspective",
  "cursor",
  "setting"
]

/** The kinds a value could be, from its shape alone. The order of the checks matters. */
function valueKinds(raw: string): InferredKind[] {
  // A path into the library's own colors stands for one (`{colors.gray.900/10}`), and a calc() of only numbers and
  // lengths is a length, or a number without a unit.
  let value = raw.replaceAll(/\{colors\.[^}]+\}/g, "rgb(0 0 0)")
  if (value.startsWith("calc(") && /^[calc()\d.\s*/+-]*$/.test(value.replaceAll(/px|rem|em/g, ""))) {
    value = /px|rem|em/.test(value) ? "1px" : "1.5"
  }
  if (/^(?:max|min|fit)-content$/.test(value)) value = "1px"
  // One a component fills in, as Chakra's `colors.colorPalette.500`.
  if (/^\{?colors\.[\w.]+\}?$/.test(value)) return ["color"]
  // A reference to a variable that isn't a token (Mantine's `var(--checkbox-color)`, which its component sets) says
  // nothing of its own, so the name decides. So does a keyword any property takes (MUI's `font-size-inherit`).
  if (/^var\(\s*--[\w-]+\s*\)$|^(?:inherit|initial|unset|revert)$/.test(value)) return anyKind
  if (value === "") return ["blur", "shadow", "radius", "setting"]
  if (/^-?\d*\.?\d+(?:px|rem|em)\s+(?:solid|dashed|dotted|double)\b/.test(value)) return ["border"]
  // A font shorthand: a weight, a size, perhaps over a line height, and a family (a generic one, a quoted one or a
  // plain name, as `400 16px Inter`), or all of them inherited.
  const family = /(?:serif|sans-serif|monospace|system-ui|ui-\w+|"[^"]+"|'[^']+'|inherit)\s*,?[^,]*$/i
  const shorthand =
    /^(?:\d{3}|inherit)\s+(?:\d*\.?\d+(?:px|rem|em)|inherit)(?:\s*\/\s*[\d.]+|\s+[\w"'-])|^inherit\s+inherit\/inherit/
  const named = /^\d{3}\s+\d*\.?\d+(?:px|rem|em)(?:\s*\/\s*[\d.]+)?\s+[A-Za-z][\w -]*(?:,|$)/
  if (shorthand.test(value) && (family.test(value) || named.test(value))) return ["type-style"]
  if (colorFunction.test(value) || namedColor.test(value)) return ["color"]
  // Bare channels, as `255 255 255`, which a color function wraps.
  if (/^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(value)) return ["color"]
  if (/-gradient\(/.test(value)) return ["gradient"]
  if (/^-?\d*\.?\d+m?s$/.test(value)) return ["duration"]
  if (
    /^(?:cubic-bezier|steps|linear)\(|^(?:ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$/.test(value)
  ) {
    return ["easing"]
  }
  if (/^\d*\.?\d+\s*\/\s*\d*\.?\d+$/.test(value)) return ["aspect"]
  const fonts = /(?:serif|sans-serif|monospace|system-ui|ui-\w+|emoji|"[^"]+"|'[^']+')/i
  if (value.includes(",") && fonts.test(value) && !/\d+px\s+\d/.test(value)) return ["font-family"]
  if (/^[\w-]+\s+(?:var\(|\d*\.?\d+m?s)/.test(value) && !/^\d/.test(value)) return ["animation"]
  if (/^inset\s/.test(value)) return ["inset-shadow"]
  const words = value.split(/\s+(?![^(]*\))/)
  const lengths = words.filter((word) => lengthText.test(word) || word === "0")
  // A color in any form says it's a shadow: a function, a name, or a variable (`0 1px 2px black`, `var(--ink)`).
  const colored = words.some((word) => colorFunction.test(word) || namedColor.test(word) || word.startsWith("var("))
  if (lengths.length >= 2 && (colored || value.includes(","))) {
    return ["shadow", "drop-shadow", "text-shadow"]
  }
  // Two to four lengths alone are a shadow in the current color, or a padding's sides, so the name decides.
  if (lengths.length >= 2 && lengths.length <= 4 && lengths.length === words.length) {
    return ["shadow", "drop-shadow", "text-shadow", "spacing", "setting"]
  }
  if (value === "none") return ["shadow", "gradient", "blur", "radius", "setting"]
  // 0 is a length and a number alike.
  if (value === "0") return [...lengthKinds, "font-weight", "z-index", "opacity"]
  if (lengthText.test(value)) return lengthKinds
  if (/^-?\d*\.?\d+$/.test(value)) return ["font-weight", "line-height", "z-index", "opacity", "setting"]
  if (/^(?:auto|default|pointer|not-allowed|text|move|grab|wait|help|crosshair)$/.test(value)) {
    return ["cursor", "setting"]
  }
  // One family by itself, quoted or named as a proper noun (`Inter`), when the name says it's one; a lowercase keyword
  // (`grayscale`, `wrap`) isn't.
  if (/^(?:"[^"]+"|'[^']+'|[A-Z][\w-]*(?: [A-Z][\w-]*)*)$/.test(value)) return ["font-family", "setting"]
  return ["setting"]
}

/** Words that say what a token is for, and the kind each says. Compounds are read first, in `nameKinds`. */
const hints: [string[], InferredKind][] = [
  [["radius", "radii", "rounded", "corner"], "radius"],
  [["spacing", "space", "spaces", "gap", "gutter", "padding", "margin"], "spacing"],
  [["breakpoint", "breakpoints", "screen", "screens"], "breakpoint"],
  [["size", "sizes", "width", "height", "container", "max", "min", "prose"], "size"],
  [["weight", "weights"], "font-weight"],
  [["leading", "lineheight", "lineheights", "line"], "line-height"],
  [["tracking", "letter", "letterspacing", "letterspacings"], "letter-spacing"],
  [["family", "fonts", "typeface"], "font-family"],
  [["blur", "blurs"], "blur"],
  [["z", "zindex", "layer", "layers"], "z-index"],
  [["opacity", "alpha"], "opacity"],
  [["duration", "durations", "delay"], "duration"],
  [["ease", "easing", "easings", "curve"], "easing"],
  [["animate", "animation", "animations"], "animation"],
  [["aspect", "ratio", "ratios"], "aspect"],
  [["cursor"], "cursor"],
  [["perspective"], "perspective"],
  [["stroke", "strokewidth", "borderwidth"], "border-width"],
  [["shadow", "shadows", "elevation"], "shadow"],
  [["overlay", "overlays", "gradient"], "gradient"],
  [["text", "fontsize", "fontsizes"], "font-size"],
  [["color", "colors", "palette", "bg", "fg", "background", "foreground"], "color"],
  [["font"], "font-family"]
]

const compounds: [string, InferredKind][] = [
  ["fontsize", "font-size"],
  ["lineheight", "line-height"],
  ["fontweight", "font-weight"],
  ["letterspacing", "letter-spacing"],
  ["borderradius", "radius"],
  ["strokewidth", "border-width"],
  ["borderwidth", "border-width"],
  ["outlinewidth", "border-width"],
  ["insetshadow", "inset-shadow"],
  ["dropshadow", "drop-shadow"],
  ["textshadow", "text-shadow"]
]

/**
 * A name's words, lowercased: split at dashes, underscores, dots, camelCase humps and where letters turn to digits, so
 * `shadow2` is `shadow 2` and `fontSizeBase300` is `font size base 300`.
 */
function nameWords(name: string): string[] {
  return name
    .split(/[-_.\\]+|(?<=[a-z\d])(?=[A-Z])|(?<=[a-zA-Z])(?=\d)/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())
}

/** The kinds a name says, most specific first. */
function nameKinds(name: string): InferredKind[] {
  const words = nameWords(name)
  const joined = words.join("")
  const found: InferredKind[] = []
  // A font's or text's size (Primer's `base-text-size-md`).
  if ((words.includes("font") || words.includes("text")) && words.includes("size")) found.push("font-size")
  // An outline's width, however it's named (`outline-focus-width`).
  if (words.includes("outline") && words.includes("width")) found.push("border-width")
  for (const [compound, kind] of compounds) if (joined.includes(compound)) found.push(kind)
  for (const [list, kind] of hints) if (words.some((word) => list.includes(word))) found.push(kind)
  return [...new Set(found)]
}
