import { z } from "zod"
import type { RenderNode } from "./render.ts"

/** How one component's inline style changes: the properties to set, and the ones to take off. */
export interface InlineStyleChange {
  nodeId: string
  set: Record<string, string>
  unset: string[]
}

/**
 * How each component's inline style differs between two renders of a design, such as before and after a style edit, so
 * the edit can be shown on components already drawn without drawing them again. A component's inline style is the one
 * its design sets on its root (`props.style`); an element is drawn from rules, which `previewRules` changes. Components
 * found in only one render are left out: adding or removing nodes isn't a change of style.
 */
export function styleChanges(before: readonly RenderNode[], after: readonly RenderNode[]): InlineStyleChange[] {
  const was = inlineStyles(before)
  const changes: InlineStyleChange[] = []

  for (const [nodeId, style] of inlineStyles(after)) {
    const old = was.get(nodeId)

    if (!old) {
      continue
    }

    const set: Record<string, string> = {}

    for (const [name, value] of Object.entries(style)) {
      if (old[name] !== value) {
        set[name] = value
      }
    }

    const unset = Object.keys(old).filter((name) => !(name in style))

    if (Object.keys(set).length > 0 || unset.length > 0) {
      changes.push({ nodeId, set, unset })
    }
  }

  return changes
}

/** Every component's inline style in a render, by node id. */
export function inlineStyles(nodes: readonly RenderNode[]): Map<string, Record<string, string>> {
  const styles = new Map<string, Record<string, string>>()

  const visit = (node: RenderNode) => {
    if (node.kind === "text") {
      return
    }

    if (node.kind === "element") {
      node.children.forEach(visit)

      return
    }

    styles.set(node.nodeId, componentStyle.parse(node.props.style))

    for (const children of Object.values(node.slots)) {
      children.forEach(visit)
    }
  }

  nodes.forEach(visit)

  return styles
}

/** A style value as inline CSS takes it. Anything else a component's `style` prop holds is left out. */
const cssValue = z.union([z.string(), z.number()]).transform(String)

/** A component's `style` prop as inline CSS, by property. A prop that isn't an object gives none. */
const componentStyle = z
  .record(z.string(), z.unknown())
  .catch({})
  .transform((style) => {
    const css: Record<string, string> = {}

    for (const [name, value] of Object.entries(style)) {
      const parsed = cssValue.safeParse(value)

      if (parsed.success) {
        css[name] = parsed.data
      }
    }

    return css
  })
