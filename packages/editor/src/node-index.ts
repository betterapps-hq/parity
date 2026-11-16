import {
  childNodes,
  type ComponentSource,
  type ContainerSpec,
  designOwner,
  type DesignNode,
  type ImportedScreen,
  type JsonValue,
  type NodesChange,
  type NodeEvent,
  type NodeData,
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
 * One part of the index, replaced as a whole: a design and its layers, the components, the routes or the screens. A
 * node's parent is in its own part. Nodes that didn't change are the same objects as before, which is how the index
 * tells which an edit touched without comparing the rest.
 */
export interface NodePart {
  part: string
  nodes: readonly ProjectNode[]
}

/** What changed since the index last caught up: the parts that changed, and every part in order. */
export interface NodeUpdate {
  parts: readonly NodePart[]
  /** Every part's name, in the order their nodes are listed. Parts not named are removed. */
  order?: readonly string[]
  /** Nodes whose owner gave them a new key, old ref to new, so their subscriptions follow them. */
  renames?: readonly { from: NodeRef; to: NodeRef }[]
}

/**
 * The project's nodes, in order: each design, then its layers depth first, keyed `designKey/nodeId`; the components;
 * the routes, each inside its parent route; and the adapters' screens. Layers inside an instance aren't listed yet:
 * they're the component's, reached through it.
 */
export function collectNodes(sources: NodeSources): ProjectNode[] {
  return createNodeCollector()(sources).parts.flatMap(({ nodes }) => nodes)
}

interface DesignCache {
  container: ContainerSpec
  design: ProjectNode
  /** Each layer's node by id, kept while its layer is the same object under the same parent. */
  layers: Map<string, ProjectNode>
  nodes: ProjectNode[]
}

interface ListCache<Source, Item> {
  source: Source
  owner: string
  /** Each item's node by its key, kept while its item is the same object. */
  items: Map<string, { item: Item; node: ProjectNode }>
  nodes: ProjectNode[]
}

/**
 * Gathers the project's nodes as `collectNodes` does, remembering what it gathered last time, and returns only the
 * parts whose sources changed. Designs, layers, components, routes and screens are matched by object: the designs keep
 * a design and a layer the same object until an edit touches it, so an edit to one layer makes one changed node, and
 * every other design isn't looked at.
 */
export function createNodeCollector(): (sources: NodeSources) => NodeUpdate {
  let designs = new Map<string, DesignCache>()
  let components: ListCache<Readonly<Record<string, ComponentSource>>, ComponentSource> | undefined
  let routes: ListCache<readonly ProjectRoute[], ProjectRoute> | undefined
  let screens: ListCache<readonly ImportedScreen[], ImportedScreen> | undefined

  return (sources) => {
    const parts: NodePart[] = []
    const order: string[] = []
    const nextDesigns = new Map<string, DesignCache>()

    for (const { key, container } of sources.designs) {
      const part = `design:${key}`
      const cached = designs.get(key)
      order.push(part)

      if (cached?.container === container) {
        nextDesigns.set(key, cached)
        continue
      }

      const next = collectDesign(key, container, cached)
      nextDesigns.set(key, next)
      parts.push({ part, nodes: next.nodes })
    }

    for (const key of designs.keys()) {
      if (!nextDesigns.has(key)) {
        parts.push({ part: `design:${key}`, nodes: [] })
      }
    }

    designs = nextDesigns

    const componentOwner = sources.components?.owner ?? ""

    const nextComponents = collectList(
      components,
      sources.components?.sources ?? {},
      componentOwner,
      (all) => Object.entries(all),
      ([key, source]) => ({
        ref: { owner: componentOwner, type: "component", key },
        name: key.slice(key.lastIndexOf("/") + 1),
        data: source
      })
    )

    const routeOwner = sources.routes?.owner ?? ""

    const nextRoutes = collectList(
      routes,
      sources.routes?.routes ?? [],
      routeOwner,
      (all) => all.map((route) => [route.id, route] as const),
      ([, route]) => {
        const node: ProjectNode = {
          ref: { owner: routeOwner, type: "route", key: route.id },
          name: route.path,
          data: route
        }

        if (route.parent) {
          node.parent = { owner: routeOwner, type: "route", key: route.parent }
        }

        return node
      }
    )

    const nextScreens = collectList(
      screens,
      sources.screens ?? [],
      "",
      (all) => all.map((screen) => [`${screen.adapter}:${screen.ref}`, screen] as const),
      ([, screen]) => ({
        ref: { owner: screen.adapter, type: "story", key: screen.ref },
        name: screen.screen.name,
        data: { group: screen.group, component: screen.component }
      })
    )

    for (const [part, before, after] of [
      ["components", components, nextComponents],
      ["routes", routes, nextRoutes],
      ["screens", screens, nextScreens]
    ] as const) {
      order.push(part)

      if (before !== after) {
        parts.push({ part, nodes: after.nodes })
      }
    }

    components = nextComponents
    routes = nextRoutes
    screens = nextScreens

    return { parts, order }
  }
}

function collectDesign(key: string, container: ContainerSpec, cached: DesignCache | undefined): DesignCache {
  const ref: NodeRef = { owner: designOwner, type: "design", key }
  const { root, ...rest } = container

  const design =
    cached && cached.design.name === container.name && sameFields(cached.design.data, rest)
      ? cached.design
      : { ref, name: container.name, data: rest }

  const nodes: ProjectNode[] = [design]
  const layers = new Map<string, ProjectNode>()

  const visit = (layer: DesignNode, parent: NodeRef) => {
    const kept = cached?.layers.get(layer.id)

    const node =
      kept && kept.data === layer && kept.parent && nodeRefId(kept.parent) === nodeRefId(parent)
        ? kept
        : {
            ref: { owner: designOwner, type: layer.type, key: `${key}/${layer.id}` },
            name: layer.name ?? layer.id,
            parent,
            data: layer
          }

    nodes.push(node)
    layers.set(layer.id, node)

    for (const child of childNodes(layer)) {
      visit(child, node.ref)
    }
  }

  visit(root, design.ref)

  return { container, design, layers, nodes }
}

/** Gathers a list's nodes, keeping the cache itself when the list is the same object and each node whose item is. */
function collectList<Source, Item>(
  cached: ListCache<Source, Item> | undefined,
  source: Source,
  owner: string,
  entries: (source: Source) => Iterable<readonly [string, Item]>,
  make: (entry: readonly [string, Item]) => ProjectNode
): ListCache<Source, Item> {
  if (cached?.source === source && cached.owner === owner) {
    return cached
  }

  const items = new Map<string, { item: Item; node: ProjectNode }>()
  const nodes: ProjectNode[] = []

  for (const entry of entries(source)) {
    const [key, item] = entry
    const kept = cached?.owner === owner ? cached.items.get(key) : undefined
    const node = kept?.item === item ? kept.node : make(entry)
    items.set(key, { item, node })
    nodes.push(node)
  }

  return { source, owner, items, nodes }
}

/** Whether a design's own fields are the same values as its node's, field by field. */
function sameFields(before: NodeData, after: Omit<ContainerSpec, "root">): boolean {
  const was = new Map(Object.entries(before))
  const now = Object.entries(after)

  return was.size === now.length && now.every(([field, value]) => was.has(field) && was.get(field) === value)
}

/** The index adapters and the app read nodes from, which their owners keep up to date with `update` or `set`. */
export interface NodeIndex extends ProjectNodes {
  /**
   * Replaces the parts an update names, comparing only their nodes that aren't the same objects as before, and tells
   * watches and subscriptions what was added, changed, renamed and removed, once for the whole update.
   */
  update(update: NodeUpdate): void
  /**
   * Replaces every node with these, as one part. A node whose owner gave it a new key is named in `renames`, old ref to
   * new, so its subscriptions follow it.
   */
  set(nodes: readonly ProjectNode[], renames?: readonly { from: NodeRef; to: NodeRef }[]): void
  /** Sends an event a node's type declares, as its owner does: `route:visited`. */
  emit(name: string, ref: NodeRef, data?: JsonValue): void
}

interface Watch {
  query: NodeQuery
  listener: (change: NodesChange) => void
}

interface Part {
  nodes: readonly ProjectNode[]
  children: Map<string, ProjectNode[]>
}

export function createNodeIndex(nodes: readonly ProjectNode[] = []): NodeIndex {
  let parts = new Map<string, Part>()
  const byId = new Map<string, ProjectNode>()
  const partOf = new Map<string, string>()
  const watches = new Set<Watch>()
  const subscriptions = new Map<string, Set<(event: NodeEvent) => void>>()

  const all = function* () {
    for (const part of parts.values()) {
      yield* part.nodes
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

  const update = ({ parts: changed, order, renames = [] }: NodeUpdate) => {
    const replaced = new Map(changed.map((part) => [part.part, part.nodes]))

    // Parts the order leaves out go, as though they'd been emptied.
    if (order) {
      const named = new Set(order)

      for (const part of parts.keys()) {
        if (!named.has(part) && !replaced.has(part)) {
          replaced.set(part, [])
        }
      }
    }

    const change: NodesChange = { added: [], changed: [], renamed: [...renames], removed: [], events: [] }
    const renamedFrom = new Set(renames.map(({ from }) => nodeRefId(from)))
    const renamedTo = new Map(renames.map(({ from, to }) => [nodeRefId(to), nodeRefId(from)]))
    const told: [NodeRef, NodeEvent][] = []
    const gone: string[] = []
    const kept = new Set<string>()

    for (const [part, next] of replaced) {
      for (const node of next) {
        const id = nodeRefId(node.ref)
        const old = byId.get(id) ?? byId.get(renamedTo.get(id) ?? id)
        kept.add(id)

        if (old === node) {
          continue
        }

        if (!old) {
          change.added.push(node)
          told.push([node.ref, { kind: "added", node }])
          continue
        }

        const fields = changedFields(old, node)

        if (fields.length > 0) {
          change.changed.push({ node, fields })
          told.push([node.ref, { kind: "changed", node, fields }])
        }
      }

      for (const node of parts.get(part)?.nodes ?? []) {
        const id = nodeRefId(node.ref)

        if (!kept.has(id) && !renamedFrom.has(id)) {
          gone.push(id)
          change.removed.push(node.ref)
          told.push([node.ref, { kind: "removed", ref: node.ref }])
        }
      }
    }

    for (const id of [...gone, ...renamedFrom]) {
      byId.delete(id)
      partOf.delete(id)
    }

    for (const [part, next] of replaced) {
      for (const node of next) {
        const id = nodeRefId(node.ref)
        byId.set(id, node)
        partOf.set(id, part)
      }

      if (next.length > 0) {
        parts.set(part, { nodes: next, children: childrenIn(next) })
      } else {
        parts.delete(part)
      }
    }

    if (order && !sameOrder(order, parts)) {
      const before = parts
      parts = new Map()

      for (const part of order) {
        const existing = before.get(part)

        if (existing) {
          parts.set(part, existing)
        }
      }
    }

    for (const { from, to } of renames) {
      const listeners = subscriptions.get(nodeRefId(from))

      // Subscriptions follow the node to its new key.
      if (listeners) {
        subscriptions.delete(nodeRefId(from))
        subscriptions.set(nodeRefId(to), new Set([...(subscriptions.get(nodeRefId(to)) ?? []), ...listeners]))
      }

      tell(to, { kind: "renamed", from, to })
    }

    for (const [ref, event] of told) {
      tell(ref, event)
    }

    for (const id of gone) {
      subscriptions.delete(id)
    }

    notify(change)
  }

  update({ parts: [{ part: "", nodes }] })

  return {
    get: (ref) => byId.get(nodeRefId(ref)),
    ofType: (type, options) => [...all()].filter((node) => matches(node.ref, { type, owner: options?.owner })),
    query: (query) => [...all()].filter((node) => matches(node.ref, query)),
    children(ref) {
      const id = nodeRefId(ref)
      const part = partOf.get(id)

      return (part !== undefined && parts.get(part)?.children.get(id)) || []
    },
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
    update,
    set: (next, renames) => update({ parts: [{ part: "", nodes: next }], order: [""], renames }),
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

function childrenIn(nodes: readonly ProjectNode[]): Map<string, ProjectNode[]> {
  const children = new Map<string, ProjectNode[]>()

  for (const node of nodes) {
    if (node.parent) {
      const id = nodeRefId(node.parent)
      const list = children.get(id)

      if (list) {
        list.push(node)
      } else {
        children.set(id, [node])
      }
    }
  }

  return children
}

function sameOrder(order: readonly string[], parts: ReadonlyMap<string, Part>): boolean {
  const present = order.filter((part) => parts.has(part))
  let at = 0

  for (const part of parts.keys()) {
    if (present[at] !== part) {
      return false
    }

    at += 1
  }

  return at === present.length
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
