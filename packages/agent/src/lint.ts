import {
  type CanvasDocument,
  childEntries,
  type ComponentInfo,
  type ComponentLibrary,
  type DesignNode,
  type NodeStyle,
  type PropValues,
  radiusKeywords
} from "@parity-app/core"
import { readNearValue } from "@parity-app/tokens"
import { z } from "zod"
import type { Warning } from "./warnings.ts"

/** What a design is checked against: the project's components, tokens and icon sets, and what this call inserted. */
export interface LintContext {
  components: readonly string[]
  tokens: readonly { name: string }[]
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
        for (const name of tokenStyleKeys) {
          const value = style?.[name]

          if (value && !known(name, value)) {
            warn("not_a_token", `${name} "${value}" isn't a token. ${nearestHint(name, value) ?? anyToken}`, where)
          }
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
        for (const name of tokenStyleKeys) {
          const value = patch.style?.[name]

          if (value && !known(name, value)) {
            const hint = nearestHint(name, value)
            const message = `${name} "${value}" isn't a token${hint ? `. ${hint}` : ""}`
            warn("not_a_token", message, `${container.id} state ${state.id}/${nodeId}`)
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

/** The category of tokens a color or length under each key is compared with, to find the nearest. */
const nearestCategories: Partial<Record<(typeof tokenStyleKeys)[number], string>> = {
  background: "color",
  foreground: "color",
  border: "color",
  radius: "radius",
  size: "font-size",
  tracking: "tracking"
}

const anyToken = "Use a name from GetTokens()."

/**
 * For a value that isn't a token but a color under a color's key or a length under a length's, the call that lists
 * the tokens nearest it, as `GetTokens({ nearest: "#2f6fed", category: "color" })`.
 */
function nearestHint(name: (typeof tokenStyleKeys)[number], value: string): string | undefined {
  const category = nearestCategories[name]
  const read = readNearValue(value)

  if (!category || !read || "color" in read !== (category === "color")) {
    return undefined
  }

  return `Use a name from GetTokens({ nearest: ${JSON.stringify(value)}, category: "${category}" }), which lists the nearest first.`
}
