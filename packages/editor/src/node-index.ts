import {
  childNodes,
  type ComponentSource,
  type ContainerSpec,
  designOwner,
  type ImportedScreen,
  type JsonValue,
  type NodesChange,
  type NodeEvent,
  type NodeQuery,
  type NodeRef,
  nodeRefId,
  type ProjectNode,
  type ProjectNodes,
  type ProjectRoute
} from "@parity-app/core"

/** What the project's nodes are gathered from: its designs, and what its adapters made. */
export interface NodeSources {
  designs: readonly { key: string; container: ContainerSpec }[]
  /** The project's components, by key, and the renderer adapter that draws them, their owner. */
  components?: { owner: string; sources: Readonly<Record<string, ComponentSource>> }
  /** The app's routes, and the router adapter that read them, their owner. */
  routes?: { owner: string; routes: readonly ProjectRoute[] }
  /** Stories and other screens an entities adapter imported; each names its adapter, its owner. */
  screens?: readonly ImportedScreen[]
}

/**
 * The project's nodes, in order: each design, then its layers depth first, keyed `designKey/nodeId`; the components;
 * the routes, each inside its parent route; and the adapters' screens. Layers inside an instance aren't listed yet:
 * they're the component's, reached through it.
 */
export function collectNodes({ designs, components, routes, screens = [] }: NodeSources): ProjectNode[] {
  const nodes: ProjectNode[] = []

  for (const { key, container } of designs) {
    const design: NodeRef = { owner: designOwner, type: "design", key }
    const { root, ...rest } = container
    nodes.push({ ref: design, name: container.name, data: rest })

    const visit = (node: ContainerSpec["root"], parent: NodeRef) => {
      const ref: NodeRef = { owner: designOwner, type: node.type, key: `${key}/${node.id}` }
      nodes.push({ ref, name: node.name ?? node.id, parent, data: node })

      for (const child of childNodes(node)) {
        visit(child, ref)
      }
    }

    visit(root, design)
  }

  for (const [key, source] of Object.entries(components?.sources ?? {})) {
    const owner = components?.owner ?? ""
    nodes.push({ ref: { owner, type: "component", key }, name: key.slice(key.lastIndexOf("/") + 1), data: source })
  }

  for (const route of routes?.routes ?? []) {
    const owner = routes?.owner ?? ""
    const node: ProjectNode = { ref: { owner, type: "route", key: route.id }, name: route.path, data: route }

    if (route.parent) {
      node.parent = { owner, type: "route", key: route.parent }
    }

    nodes.push(node)
  }

  for (const screen of screens) {
    nodes.push({
      ref: { owner: screen.adapter, type: "story", key: screen.ref },
      name: screen.screen.name,
      data: { group: screen.group, component: screen.component }
    })
  }

  return nodes
}

/** The index adapters and the app read nodes from, which their owners keep up to date with `set`. */
export interface NodeIndex extends ProjectNodes {
  /**
   * Replaces every node with these, telling watches and subscriptions what was added, changed and removed. A node whose
   * owner gave it a new key is named in `renames`, old ref to new, so its subscriptions follow it.
   */
  set(nodes: readonly ProjectNode[], renames?: readonly { from: NodeRef; to: NodeRef }[]): void
  /** Sends an event a node's type declares, as its owner does: `route:visited`. */
  emit(name: string, ref: NodeRef, data?: JsonValue): void
}

interface Watch {
  query: NodeQuery
  listener: (change: NodesChange) => void
}

export function createNodeIndex(nodes: readonly ProjectNode[] = []): NodeIndex {
  let byId = new Map<string, ProjectNode>()
  let childrenOf = new Map<string, ProjectNode[]>()
  const watches = new Set<Watch>()
  const subscriptions = new Map<string, Set<(event: NodeEvent) => void>>()

  const load = (next: readonly ProjectNode[]) => {
    byId = new Map(next.map((node) => [nodeRefId(node.ref), node]))
    childrenOf = new Map()

    for (const node of next) {
      if (node.parent) {
        const id = nodeRefId(node.parent)
        childrenOf.set(id, [...(childrenOf.get(id) ?? []), node])
      }
    }
  }

  const parentOf = (ref: NodeRef) => {
    const parent = byId.get(nodeRefId(ref))?.parent

    return parent && byId.get(nodeRefId(parent))
  }

  const isWithin = (ref: NodeRef, outer: NodeRef) => {
    const target = nodeRefId(outer)

    for (let at = parentOf(ref); at; at = parentOf(at.ref)) {
      if (nodeRefId(at.ref) === target) {
        return true
      }
    }

    return false
  }

  const matches = (ref: NodeRef, query: NodeQuery) =>
    (query.owner === undefined || ref.owner === query.owner) &&
    (query.type === undefined || ref.type === query.type) &&
    (query.within === undefined || isWithin(ref, query.within))

  const tell = (ref: NodeRef, event: NodeEvent) => {
    for (const listener of subscriptions.get(nodeRefId(ref)) ?? []) {
      listener(event)
    }
  }

  const notify = (change: NodesChange) => {
    for (const { query, listener } of watches) {
      const mine: NodesChange = {
        added: change.added.filter((node) => matches(node.ref, query)),
        changed: change.changed.filter(({ node }) => matches(node.ref, query)),
        renamed: change.renamed.filter(({ to }) => matches(to, query)),
        // A removed node can't be looked up any more, so only its own owner and type are asked.
        removed: change.removed.filter((ref) => matches(ref, { owner: query.owner, type: query.type })),
        events: change.events.filter((event) => matches(event.ref, query))
      }

      if (Object.values(mine).some((list) => list.length > 0)) {
        listener(mine)
      }
    }
  }

  load(nodes)

  return {
    get: (ref) => byId.get(nodeRefId(ref)),
    ofType: (type, options) => [...byId.values()].filter((node) => matches(node.ref, { type, owner: options?.owner })),
    query: (query) => [...byId.values()].filter((node) => matches(node.ref, query)),
    children: (ref) => childrenOf.get(nodeRefId(ref)) ?? [],
    parent: parentOf,
    watch(query, listener) {
      const watch = { query, listener }
      watches.add(watch)

      return () => watches.delete(watch)
    },
    subscribe(ref, listener) {
      const id = nodeRefId(ref)
      const listeners = subscriptions.get(id) ?? new Set()
      listeners.add(listener)
      subscriptions.set(id, listeners)

      return () => listeners.delete(listener)
    },
    set(next, renames = []) {
      const before = byId
      load(next)

      const change: NodesChange = { added: [], changed: [], renamed: [...renames], removed: [], events: [] }
      const renamedFrom = new Set(renames.map(({ from }) => nodeRefId(from)))
      const renamedTo = new Map(renames.map(({ from, to }) => [nodeRefId(to), from]))

      for (const { from, to } of renames) {
        const listeners = subscriptions.get(nodeRefId(from))

        // Subscriptions follow the node to its new key.
        if (listeners) {
          subscriptions.delete(nodeRefId(from))
          subscriptions.set(nodeRefId(to), new Set([...(subscriptions.get(nodeRefId(to)) ?? []), ...listeners]))
        }

        tell(to, { kind: "renamed", from, to })
      }

      for (const [id, node] of byId) {
        const old = before.get(id) ?? before.get(nodeRefId(renamedTo.get(id) ?? node.ref))

        if (!old) {
          change.added.push(node)
          tell(node.ref, { kind: "added", node })
          continue
        }

        const fields = changedFields(old, node)

        if (fields.length > 0) {
          change.changed.push({ node, fields })
          tell(node.ref, { kind: "changed", node, fields })
        }
      }

      for (const [id, node] of before) {
        if (!byId.has(id) && !renamedFrom.has(id)) {
          change.removed.push(node.ref)
          tell(node.ref, { kind: "removed", ref: node.ref })
          subscriptions.delete(id)
        }
      }

      notify(change)
    },
    emit(name, ref, data) {
      const event: Extract<NodeEvent, { kind: "type" }> = { kind: "type", name, ref }

      if (data !== undefined) {
        event.data = data
      }

      tell(ref, event)
      notify({ added: [], changed: [], renamed: [], removed: [], events: [event] })
    }
  }
}

/** The fields nodes inside it don't hold, which a layer's change is told by: not its children or slots. */
const nested = new Set(["children", "slots"])

/**
 * Which of a node's own fields changed: its name, its parent, and its data's fields but those holding the nodes inside
 * it, so editing a layer doesn't tell its design and every layer around it that they changed.
 */
function changedFields(old: ProjectNode, next: ProjectNode): string[] {
  const fields: string[] = []

  if (old.name !== next.name) {
    fields.push("name")
  }

  if (JSON.stringify(old.parent) !== JSON.stringify(next.parent)) {
    fields.push("parent")
  }

  if (old.data === next.data) {
    return fields
  }

  const before = new Map(Object.entries(old.data))
  const after = new Map(Object.entries(next.data))

  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(key)
    const now = after.get(key)

    if (!nested.has(key) && was !== now && JSON.stringify(was) !== JSON.stringify(now)) {
      fields.push(key)
    }
  }

  return fields
}
