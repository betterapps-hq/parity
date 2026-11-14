import type { ProjectRoute } from "./adapters.ts"
import type { ContainerSpec, DesignNode } from "./document.ts"
import type { ComponentSource } from "./project.ts"
import type { JsonValue } from "./schema.ts"

/**
 * Every node Parity knows of, whatever made it, by one address (docs/proposals/adapter-registrations.md, Node
 * identity): a layer in a design, a component, a route, a story. Whoever makes a node owns its key and keeps it across
 * edits; a key need only be unique within its owner and type, since the owner leads.
 */
export interface NodeRef {
  /** Who made it and keeps its key: `design` for the designs' own, or an adapter's id. */
  owner: string
  /** Its kind: `design` and a layer's type for the designs' own, or a type its adapter names, as `route`. */
  type: string
  /** Unique within its owner and type: a route's id, a component's key, `designKey/nodeId` for a layer. */
  key: string
}

/** The designs' own nodes' owner. */
export const designOwner = "design"

/** A ref as one string, for keying maps: owner and type can't hold a colon, so the key may. */
export function nodeRefId({ owner, type, key }: NodeRef): string {
  return `${owner}:${type}:${key}`
}

/** A story or another screen an entities adapter imported: its group, and the component it draws, by key. */
export interface ScreenData {
  group: string
  component?: string
}

/**
 * A node's own data, as its owner keeps it: a design's (without its layers), a layer, a component's source, a route, a
 * screen, or a type an adapter names, as JSON.
 */
export type NodeData =
  | Omit<ContainerSpec, "root">
  | DesignNode
  | ComponentSource
  | ProjectRoute
  | ScreenData
  | { readonly [field: string]: JsonValue }

/** One node, as the index holds it. */
export interface ProjectNode {
  ref: NodeRef
  /** What the editor calls it: a layer's or design's name, a route's path, a component's export. */
  name: string
  /** The node it sits inside: a layer's parent layer or design, a route's parent route. */
  parent?: NodeRef
  data: NodeData
}

/** Which nodes a query or a watch is about. Unset fields match anything. */
export interface NodeQuery {
  owner?: string
  type?: string
  /** Only nodes inside this one, at any depth. */
  within?: NodeRef
}

/** What changed for a node, as a subscription to it is told. */
export type NodeEvent =
  | { kind: "added"; node: ProjectNode }
  /** Its own fields changed, by name: not those of nodes inside it. */
  | { kind: "changed"; node: ProjectNode; fields: string[] }
  /** Its owner gave it a new key, as when an element moves in its file; subscriptions follow it. */
  | { kind: "renamed"; from: NodeRef; to: NodeRef }
  | { kind: "removed"; ref: NodeRef }
  /** One its type declares, sent by its owner, as `route:visited`. */
  | { kind: "type"; name: string; ref: NodeRef; data?: JsonValue }

/** What changed among the nodes a watch matches, once an update lands. */
export interface NodesChange {
  added: ProjectNode[]
  changed: { node: ProjectNode; fields: string[] }[]
  renamed: { from: NodeRef; to: NodeRef }[]
  removed: NodeRef[]
  /** Events nodes' types declare, as their owners sent them. */
  events: Extract<NodeEvent, { kind: "type" }>[]
}

/** How adapters and the app read the project's nodes. Read only: nodes come from their owners. */
export interface ProjectNodes {
  get(ref: NodeRef): ProjectNode | undefined
  /** Every node of a type, from any owner unless one is named, in the order their owners give them. */
  ofType(type: string, options?: { owner?: string }): ProjectNode[]
  /** Every node matching a query, in order. */
  query(query: NodeQuery): ProjectNode[]
  children(ref: NodeRef): ProjectNode[]
  parent(ref: NodeRef): ProjectNode | undefined
  /** Told of what changed among the nodes a query matches, once each update lands. Returns how to stop. */
  watch(query: NodeQuery, listener: (change: NodesChange) => void): () => void
  /** Told when one node changes, gets a new key, goes, or its owner sends one of its type's events. Returns how to stop. */
  subscribe(ref: NodeRef, listener: (event: NodeEvent) => void): () => void
}
