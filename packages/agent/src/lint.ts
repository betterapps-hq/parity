import {
  type CanvasDocument,
  childEntries,
  type Color,
  type ComponentInfo,
  type ComponentLibrary,
  type DesignNode,
  isSpring,
  type LineHeight,
  type Named,
  type NodeStyle,
  type PropValues,
  radiusKeywords,
  type Shadow,
  type Size,
  type StyleKey,
  type Time,
  type Track
} from "@parity-app/core"
import type { TokenCategory } from "@parity-app/core"
import { type Easing, validate } from "@parity-app/style-schema"
import { compareNames, readNearValue } from "@parity-app/tokens"
import type { Warning } from "./warnings.ts"

/** What a design is checked against: the project's components, tokens and icon sets, and what this call inserted. */
export interface LintContext {
  components: readonly string[]
  /** The project's tokens. A warning about a name that isn't one lists those of the `category` its style takes. */
  tokens: readonly { name: string; category?: string }[]
  /** The project's icon sets. An icon is a component named `<id>/<Icon>`. */
  iconSets?: readonly { id: string }[]
  /** The component designs instances can place. */
  library: ComponentLibrary
  /** Components' props as inferred from their source, by component. */
  props: Record<string, ComponentInfo>
  /** Nodes this call inserted, whose props and names are checked too. */
  inserted: ReadonlySet<string>
}

/** Warnings for things in a document that are valid but probably not what was meant. */
export function lintDocument(document: CanvasDocument, context: LintContext): Warning[] {
  const found: Warning[] = []
  const warn = (category: Warning["category"], message: string, at: string) => found.push({ category, message, at })
  const components = new Set(context.components)
  const icons = (context.iconSets ?? []).map((set) => `${set.id}/`)
  const tokens = new Set(context.tokens.map((token) => token.name))

  const known = (name: string, value: string) =>
    tokens.has(value) || (name === "borderRadius" && value in radiusKeywords)

  /** What's wrong with a style's values, in a design, a viewport's patch or a state. */
  const checkStyle = (style: NodeStyle | undefined, where: string) => {
    for (const entry of styleValues(style)) {
      const { name, value } = entry

      if ("token" in value) {
        if (known(name, value.token)) {
          continue
        }

        if (entry.takes === "zIndex") {
          warn(
            "not_a_token",
            `zIndex "${value.token}" isn't a token. Use a whole number ({ step: 10 }) instead.`,
            where
          )
        } else if (entry.takes === "length") {
          warn(
            "not_a_length_token",
            `${name} "${value.token}" isn't a length token. Use spacing steps ({ step: 4 }) instead.`,
            where
          )
        } else {
          warn("not_a_token", notAToken({ ...entry, value: value.token, named: true }, context.tokens), where)
        }

        continue
      }

      const written = writtenOut(value)

      if (written === undefined) {
        continue
      }

      // A value CSS wouldn't take is said once, as that: which token is nearest it isn't worth knowing.
      if (!validate(entry.property, entry.css ? entry.css(written) : written).valid) {
        warn("invalid_value", `${name} "${written}" isn't a value ${entry.property} takes.`, where)
      } else if (entry.tokened && "value" in value) {
        warn("not_a_token", notAToken({ ...entry, value: written, named: false }, context.tokens), where)
      }
    }

    for (const [property, declaration] of Object.entries(style?.css ?? {})) {
      const validity = validate(property, declaration.value)

      if (validity.valid) {
        continue
      }

      warn(
        "invalid_value",
        validity.problem === "property"
          ? `css "${property}" isn't a CSS property.`
          : `css.${property} "${declaration.value}" isn't a value ${property} takes.`,
        where
      )
    }
  }

  for (const container of document.containers) {
    const check = (node: DesignNode, where: string) => {
      if (node.type === "instance" && !context.library.has(node.design)) {
        warn("unknown_component_design", `no component design "${node.design}"`, where)
      }

      if (
        node.type === "component" &&
        !components.has(node.component) &&
        !icons.some((prefix) => node.component.startsWith(prefix))
      ) {
        warn(
          "unknown_component",
          `"${node.component}" isn't one of the project's components; it renders as a placeholder. Check Components().`,
          where
        )
      }

      if (node.type === "component" && context.inserted.has(node.id)) {
        found.push(...propWarnings(context.props[node.component], node.component, node.props, where))
      }

      for (const style of [node.style, ...Object.values(node.responsive ?? {}).map((patch) => patch.style)]) {
        checkStyle(style, where)
      }

      if (
        context.inserted.has(node.id) &&
        !node.name &&
        node.type === "layout" &&
        childEntries(node).some((entry) => entry.nodes.length > 1)
      ) {
        warn("unnamed_layout", "name layouts that group things, so the layers tree reads well", where)
      }

      for (const entry of childEntries(node)) {
        for (const child of entry.nodes) {
          check(child, `${container.id}/${child.id}`)
        }
      }
    }

    check(container.root, `${container.id}/${container.root.id}`)

    for (const state of container.states ?? []) {
      for (const [nodeId, patch] of Object.entries(state.overrides ?? {})) {
        checkStyle(patch.style, `${container.id} state ${state.id}/${nodeId}`)
      }
    }
  }

  return found
}

/**
 * Props a component doesn't declare, and values outside a prop's options. A component whose props aren't inferred yet
 * gets none.
 */
export function propWarnings(
  info: ComponentInfo | undefined,
  component: string,
  props: PropValues | undefined,
  where: string
): Warning[] {
  if (!info || !props) {
    return []
  }

  const found: Warning[] = []

  for (const [name, value] of Object.entries(props)) {
    // `null` takes a prop away, which suits any prop, even one the component no longer has (PAR-885).
    if (value === null) {
      continue
    }

    const prop = info.props.find((candidate) => candidate.name === name)

    if (!prop) {
      if (!name.startsWith("data-")) {
        found.push({
          category: "unknown_prop",
          message: `${component} has no prop "${name}". Check Props("${component}").`,
          at: where
        })
      }

      continue
    }

    if (prop.kind === "enum" && value !== undefined && !prop.options?.some((option) => option === value)) {
      found.push({
        category: "invalid_option",
        message: `${component} ${name} is one of ${prop.options?.map((option) => JSON.stringify(option)).join(", ")}, not ${JSON.stringify(value)}`,
        at: where
      })
    }
  }

  return found
}

/** A stored value that can name a token or be written out. A size's `{ size }` and a track's `{ fr }` are neither. */
type Stored = Size | Track | Color | Named | LineHeight | Time | Exclude<Easing, { spring: object }>

/** The category of tokens a color or length is compared with, to find the nearest. */
type NearestCategory = "color" | "radius" | "font-size" | "tracking"

/**
 * A value in a style that can name a token or be written out: where (`boxShadow[1].color`), the CSS property it's
 * written to, and what a name there has to be.
 */
interface StyleValue {
  name: string
  /** The property a value written out is checked against. */
  property: string
  value: Stored
  /** A name there is a token of the key's kind, a length token or a z-index token, each with its own warning. */
  takes: "token" | "length" | "zIndex"
  /** The category of tokens that goes there, when it's one category, which a warning lists the project's tokens of. */
  category?: TokenCategory
  /** The category to find the nearest token in, for a color or a length written where a token goes. */
  nearest?: NearestCategory
  /** Whether the project's tokens are what goes there, so a `{ value }` is off them and gets the token's warning. */
  tokened?: boolean
  /** The value as its property reads it, where that isn't the value alone: a blur's length inside `blur()`. */
  css?: (written: string) => string
}

/** A color, whose tokens are colors, and the token its alpha names when it names one. */
function colorValues(name: string, property: string, value: Color): StyleValue[] {
  const color: StyleValue = {
    name,
    property,
    value,
    takes: "token",
    category: "color",
    nearest: "color",
    tokened: true
  }

  const alpha = "alpha" in value ? value.alpha : undefined

  return alpha !== undefined && "token" in alpha
    ? [color, { name: `${name}.alpha`, property: "opacity", value: { token: alpha.token }, takes: "token" }]
    : [color]
}

/** The keys that take one token of one category, with the property each writes. */
const tokenKeys = [
  { key: "borderRadius", property: "border-radius", category: "radius", nearest: "radius" },
  { key: "fontFamily", property: "font-family", category: "font" },
  { key: "fontSize", property: "font-size", category: "font-size", nearest: "font-size" },
  { key: "lineHeight", property: "line-height", category: "leading" },
  { key: "letterSpacing", property: "letter-spacing", category: "tracking", nearest: "tracking" }
] as const satisfies readonly { key: StyleKey; property: string; category: TokenCategory; nearest?: NearestCategory }[]

/** The keys that take a length, with the property each writes. */
const lengthKeys = [
  ["gap", "gap"],
  ["rowGap", "row-gap"],
  ["padding", "padding"],
  ["margin", "margin"],
  ["width", "width"],
  ["height", "height"],
  ["minWidth", "min-width"],
  ["maxWidth", "max-width"],
  ["minHeight", "min-height"],
  ["maxHeight", "max-height"],
  ["top", "top"],
  ["right", "right"],
  ["bottom", "bottom"],
  ["left", "left"]
] as const satisfies readonly [StyleKey, string][]

/** The values in a style that can name a token or be written out, in the order their warnings are given. */
function styleValues(style: NodeStyle | undefined): StyleValue[] {
  if (!style) {
    return []
  }

  const found: StyleValue[] = []

  // A fill's colors, then its gradient tokens, all under `fills` (PAR-931).
  for (const layer of style.fills ?? []) {
    if (layer.type === "solid") {
      found.push(...colorValues("fills", "background-color", layer.color))
    } else if (layer.type !== "gradient" && layer.type !== "image") {
      found.push(...layer.stops.flatMap((stop) => colorValues("fills", "color", stop.color)))
    }
  }

  for (const layer of style.fills ?? []) {
    if (layer.type === "gradient") {
      found.push({ name: "fills", property: "background-image", value: { token: layer.token }, takes: "token" })
    }
  }

  if (style.color) {
    found.push(...colorValues("color", "color", style.color))
  }

  if (style.borderColor) {
    found.push(...colorValues("borderColor", "border-color", style.borderColor))
  }

  const shadowValues = (entry: Shadow, at: string) => {
    if ("token" in entry) {
      found.push({
        name: `${at}.token`,
        property: "box-shadow",
        value: { token: entry.token },
        takes: "token",
        category: "shadow"
      })
    }

    if (entry.color) {
      found.push(...colorValues(`${at}.color`, "color", entry.color))
    }
  }

  for (const { key, ...takes } of tokenKeys) {
    const value = style[key]

    if (value) {
      found.push({ name: key, value, takes: "token", tokened: true, ...takes })
    }

    // Shadows come after the radius, as a style's keys are ordered.
    if (key === "borderRadius") {
      style.boxShadow?.forEach((entry, index) => shadowValues(entry, `boxShadow[${index}]`))
    }
  }

  for (const key of ["filter", "backdropFilter"] as const) {
    style[key]?.forEach((entry, index) => {
      if (entry.type === "blur") {
        found.push({
          name: `${key}[${index}].value`,
          property: key === "filter" ? "filter" : "backdrop-filter",
          value: entry.value,
          takes: "token",
          css: (written) => `blur(${written})`
        })
      } else if (entry.type === "dropShadow") {
        shadowValues(entry.shadow, `${key}[${index}].shadow`)
      }
    })
  }

  for (const [index, transition] of (style.transition ?? []).entries()) {
    for (const key of ["duration", "delay"] as const) {
      const time = transition[key]

      if (time !== undefined) {
        found.push({
          name: `transition[${index}].${key}`,
          property: `transition-${key}`,
          value: time,
          takes: "token"
        })
      }
    }

    const easing = transition.easing

    // A spring names nothing and is written as no CSS value of its own.
    if (easing !== undefined && !isSpring(easing)) {
      found.push({
        name: `transition[${index}].easing`,
        property: "transition-timing-function",
        value: easing,
        takes: "token"
      })
    }
  }

  // A layer order is a whole number, or names a z-index token.
  if (style.zIndex !== undefined) {
    found.push({ name: "zIndex", property: "z-index", value: style.zIndex, takes: "zIndex" })
  }

  // An opacity, a border's width and a font weight are numbers, or name a token of their own kind.
  if (style.opacity !== undefined && "token" in style.opacity) {
    found.push({ name: "opacity", property: "opacity", value: style.opacity, takes: "token" })
  }

  if (style.borderWidth !== undefined && !("step" in style.borderWidth)) {
    found.push({
      name: "borderWidth",
      property: "border-width",
      value: style.borderWidth,
      takes: "token"
    })
  }

  if (style.fontWeight !== undefined && !("value" in style.fontWeight)) {
    found.push({
      name: "fontWeight",
      property: "font-weight",
      value: style.fontWeight,
      takes: "token",
      category: "font-weight"
    })
  }

  for (const [key, property] of lengthKeys) {
    const value = style[key]

    for (const side of Array.isArray(value) ? value : [value]) {
      if (side !== undefined) {
        found.push({ name: key, property, value: side, takes: "length" })
      }
    }
  }

  for (const [key, property] of [
    ["gridTemplateColumns", "grid-template-columns"],
    ["gridTemplateRows", "grid-template-rows"]
  ] as const) {
    found.push(...(style[key] ?? []).map((value): StyleValue => ({ name: key, property, value, takes: "length" })))
  }

  for (const axis of ["x", "y"] as const) {
    const value = style.translate?.[axis]

    if (value !== undefined) {
      found.push({ name: `translate.${axis}`, property: "translate", value, takes: "length" })
    }
  }

  return found
}

/** A stored value's text when it's written out as CSS reads it, rather than naming a token, steps or a size. */
function writtenOut(value: Stored): string | undefined {
  if ("value" in value) {
    return value.value
  }

  if ("keyword" in value) {
    return value.keyword
  }

  return "expr" in value ? value.expr : undefined
}

/** How many of the project's tokens a warning lists by name before it points at `GetTokens` instead. */
const listedTokens = 8

/** A name `SetTokens` could add as a token, rather than a raw value such as `#ff00aa` or `0 1px 2px black`. */
const tokenName = /^[a-z_][\w-]*$/i

/** What a style has where a token goes, which isn't one of the project's: a name, or a value written out. */
interface OffToken {
  /** Where it is in the style: `boxShadow[1].color`. */
  name: string
  value: string
  category?: TokenCategory
  nearest?: NearestCategory
  /** Whether it was given as a token's name (`{ token }`) rather than written out (`{ value }`). */
  named: boolean
}

/**
 * What to say about a style value that isn't one of the project's tokens: that the project has none of the category
 * that goes there; else, for a raw color or length, the call that lists the tokens nearest it; else the project's
 * tokens of that category, by name while they're few. A name that could be a token's is one `SetTokens` can add.
 * A place that takes several categories gets the plain hint.
 */
function notAToken({ name, value, category, nearest, named: asName }: OffToken, tokens: LintContext["tokens"]): string {
  const said = `${name} "${value}" isn't a token`

  if (!category) {
    return `${said}. Use a name from GetTokens().`
  }

  const names = tokens
    .filter((token) => token.category === category)
    .map((token) => token.name)
    .toSorted(compareNames)

  const named = asName && tokenName.test(value)

  if (names.length === 0) {
    return `${said}, and the project has no ${category} tokens. Add ${named ? value : "one"} with SetTokens.`
  }

  const near = nearestHint(nearest, value)

  if (near) {
    return `${said}. ${near}`
  }

  const add = named ? `, or add ${value} with SetTokens` : ""

  if (names.length > listedTokens) {
    return `${said}. Use a name from GetTokens({ category: "${category}" })${add}.`
  }

  if (names.length === 1) {
    return `${said}. The project's only ${category} token is ${names[0]}. Use it${add}.`
  }

  const listed = `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`

  return `${said}. The project's ${category} tokens are ${listed}. Use one${add}.`
}

/**
 * For a value that isn't a token but a color under a color's key or a length under a length's, the call that lists
 * the tokens nearest it, as `GetTokens({ nearest: "#2f6fed", category: "color" })`.
 */
function nearestHint(category: NearestCategory | undefined, value: string): string | undefined {
  const read = readNearValue(value)

  if (!category || !read || "color" in read !== (category === "color")) {
    return undefined
  }

  return `Use a name from GetTokens({ nearest: ${JSON.stringify(value)}, category: "${category}" }), which lists the nearest first.`
}
