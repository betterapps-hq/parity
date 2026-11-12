import {
  type CanvasDocument,
  childEntries,
  type ComponentInfo,
  type ComponentLibrary,
  type DesignNode,
  fillTokens,
  isEasingFunction,
  isEasingKeyword,
  isSpring,
  isTimeToken,
  type NodeStyle,
  type PropValues,
  radiusKeywords,
  type Shadow
} from "@parity-app/core"
import type { TokenCategory } from "@parity-app/core"
import { compareNames, readNearValue } from "@parity-app/tokens"
import { z } from "zod"
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
  const known = (name: string, value: string) => tokens.has(value) || (name === "radius" && value in radiusKeywords)

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
        for (const token of styleTokens(style)) {
          if (!known(token.name, token.value)) {
            warn("not_a_token", notAToken(token, context.tokens), where)
          }
        }

        // A layer order is a whole number, or names a z-index token.
        const zIndex = lengthName.safeParse(style?.zIndex).data

        if (zIndex !== undefined && !tokens.has(zIndex)) {
          warn("not_a_token", `zIndex "${zIndex}" isn't a token. Use a whole number instead.`, where)
        }

        for (const [name, value] of lengthTokens(style)) {
          if (!tokens.has(value)) {
            warn(
              "not_a_length_token",
              `${name} "${value}" isn't a length token. Use a spacing step (a number) instead.`,
              where
            )
          }
        }
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

    for (const state of container.states) {
      for (const [nodeId, patch] of Object.entries(state.overrides ?? {})) {
        for (const token of styleTokens(patch.style)) {
          if (!known(token.name, token.value)) {
            warn("not_a_token", notAToken(token, context.tokens), `${container.id} state ${state.id}/${nodeId}`)
          }
        }
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

/** A length written as a name, a token's or `fill` or `hug`, rather than a number of spacing steps. */
const lengthName = z.string()

/** Lengths given as token names rather than spacing steps, by the style key they're under. */
function lengthTokens(style: NodeStyle | undefined): [string, string][] {
  const found: [string, string][] = []

  for (const name of lengthStyleKeys) {
    const value = style?.[name]

    for (const side of Array.isArray(value) ? value : [value]) {
      const token = lengthName.safeParse(side).data

      if (token !== undefined && token !== "fill" && token !== "hug") {
        found.push([name, token])
      }
    }
  }

  for (const axis of ["x", "y"] as const) {
    const token = lengthName.safeParse(style?.transform?.[axis]).data

    if (token !== undefined) {
      found.push([`transform.${axis}`, token])
    }
  }

  return found
}

const lengthStyleKeys = [
  "gap",
  "rowGap",
  "padding",
  "margin",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "top",
  "right",
  "bottom",
  "left"
] as const

const tokenStyleKeys = [
  "background",
  "foreground",
  "border",
  "radius",
  "shadow",
  "font",
  "size",
  "leading",
  "tracking"
] as const

/** The category of tokens a color or length is compared with, to find the nearest. */
type NearestCategory = "color" | "radius" | "font-size" | "tracking"

/** The category of tokens a color or length under each key is compared with, to find the nearest. */
const nearestCategories: Partial<Record<(typeof tokenStyleKeys)[number], NearestCategory>> = {
  background: "color",
  foreground: "color",
  border: "color",
  radius: "radius",
  size: "font-size",
  tracking: "tracking"
}

/** The category of tokens each key takes, which a warning lists the project's tokens of. */
const keyCategories: Record<(typeof tokenStyleKeys)[number], TokenCategory> = {
  background: "color",
  foreground: "color",
  border: "color",
  radius: "radius",
  shadow: "shadow",
  font: "font",
  size: "font-size",
  leading: "leading",
  tracking: "tracking"
}

/**
 * A token a style names: where (`shadow[1].color`), its name, the category of tokens that goes there, when it's one
 * category, and the category to find the nearest in.
 */
interface StyleToken {
  name: string
  value: string
  category?: TokenCategory
  nearest?: NearestCategory
}

/** The tokens a style names: under its token keys, and in its shadows' and filters' entries. */
function styleTokens(style: NodeStyle | undefined): StyleToken[] {
  if (!style) {
    return []
  }

  const found: StyleToken[] = []

  for (const name of tokenStyleKeys) {
    const value = style[name]

    if (value && !Array.isArray(value)) {
      found.push({ name, value, category: keyCategories[name], nearest: nearestCategories[name] })
    }
  }

  // A fill's stack names its colors and gradient tokens under `background` (PAR-931).
  if (Array.isArray(style.background)) {
    const { colors, gradients } = fillTokens(style.background)
    found.push(
      ...colors.map((value): StyleToken => ({ name: "background", value, category: "color", nearest: "color" }))
    )
    found.push(...gradients.map((value): StyleToken => ({ name: "background", value })))
  }

  const shadowTokens = (entry: Shadow, at: string) => {
    if ("token" in entry) {
      found.push({ name: `${at}.token`, value: entry.token, category: "shadow" })
    }

    if (entry.color) {
      found.push({ name: `${at}.color`, value: entry.color.color, category: "color", nearest: "color" })
    }
  }

  if (Array.isArray(style.shadow)) {
    style.shadow.forEach((entry, index) => shadowTokens(entry, `shadow[${index}]`))
  }

  for (const key of ["filter", "backdropFilter"] as const) {
    style[key]?.forEach((entry, index) => {
      if (entry.kind === "blur") {
        found.push({ name: `${key}[${index}].value`, value: entry.value })
      } else if (entry.kind === "dropShadow") {
        shadowTokens(entry.shadow, `${key}[${index}].shadow`)
      }
    })
  }

  found.push(...transitionTokens(style).map(([name, value]): StyleToken => ({ name, value })))

  return found
}

/**
 * The token names a style's transitions use, by where they are (`transitions[0].duration`): a duration or delay given
 * as a name, and an easing that's neither Tailwind's own, a curve of its own nor a spring.
 */
function transitionTokens(style: NodeStyle): [string, string][] {
  const found: [string, string][] = []

  for (const [index, transition] of (style.transitions ?? []).entries()) {
    for (const key of ["duration", "delay"] as const) {
      const time = transition[key]

      if (time !== undefined && isTimeToken(time)) {
        found.push([`transitions[${index}].${key}`, time])
      }
    }

    const easing = transition.easing

    if (easing !== undefined && !isSpring(easing) && !isEasingKeyword(easing) && !isEasingFunction(easing)) {
      found.push([`transitions[${index}].easing`, easing])
    }
  }

  return found
}

/** How many of the project's tokens a warning lists by name before it points at `GetTokens` instead. */
const listedTokens = 8

/** A name `SetTokens` could add as a token, rather than a raw value such as `#ff00aa` or `0 1px 2px black`. */
const tokenName = /^[a-z_][\w-]*$/i

/**
 * What to say about a style value that isn't one of the project's tokens: that the project has none of the category
 * that goes there; else, for a raw color or length, the call that lists the tokens nearest it; else the project's
 * tokens of that category, by name while they're few. A value that could be a token's name is one `SetTokens` can add.
 * A place that takes several categories gets the plain hint.
 */
function notAToken({ name, value, category, nearest }: StyleToken, tokens: LintContext["tokens"]): string {
  const said = `${name} "${value}" isn't a token`

  if (!category) {
    return `${said}. Use a name from GetTokens().`
  }

  const names = tokens
    .filter((token) => token.category === category)
    .map((token) => token.name)
    .toSorted(compareNames)

  const named = tokenName.test(value)

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
