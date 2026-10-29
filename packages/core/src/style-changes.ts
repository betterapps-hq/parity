import type { RenderNode } from "./render.ts"

/** How one rendered node's inline style changes: the properties to set, and the ones to take off. */
export interface InlineStyleChange {
  nodeId: string
  set: Record<string, string>
  unset: string[]
}

/**
 * How each node's inline style differs between two renders of a design, such as before and after a style edit, so the
 * edit can be shown on elements already drawn without drawing them again. A component's inline style is the one its
 * design sets on its root (`props.style`). Nodes found in only one render are left out: adding or removing nodes isn't
 * a change of style.
 */
export function styleChanges(before: readonly RenderNode[], after: readonly RenderNode[]): InlineStyleChange[] {
  const was = inlineStyles(before)
  const changes: InlineStyleChange[] = []
  for (const [nodeId, style] of inlineStyles(after)) {
    const old = was.get(nodeId)
    if (!old) continue
    const set: Record<string, string> = {}
    for (const [name, value] of Object.entries(style)) if (old[name] !== value) set[name] = value
    const unset = Object.keys(old).filter((name) => !(name in style))
    if (Object.keys(set).length > 0 || unset.length > 0) changes.push({ nodeId, set, unset })
  }
  return changes
}

/** Every node's inline style in a render, by node id. */
export function inlineStyles(nodes: readonly RenderNode[]): Map<string, Record<string, string>> {
  const styles = new Map<string, Record<string, string>>()
  const visit = (node: RenderNode) => {
    if (node.kind === "text") return
    if (node.kind === "element") {
      styles.set(node.nodeId, node.style)
      node.children.forEach(visit)
      return
    }
    styles.set(node.nodeId, stringStyle(node.props.style))
    for (const children of Object.values(node.slots)) children.forEach(visit)
  }
  nodes.forEach(visit)
  return styles
}

function stringStyle(style: unknown): Record<string, string> {
  if (typeof style !== "object" || style === null) return {}
  return Object.fromEntries(
    Object.entries(style).flatMap(([name, value]) =>
      typeof value === "string" || typeof value === "number" ? [[name, String(value)]] : []
    )
  )
}
