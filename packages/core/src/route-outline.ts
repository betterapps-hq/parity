import type { ProjectRoute, RouteSegment } from "./routes.ts"

/**
 * Routes nested by their URLs (PAR-1185): `/api` holds `users`, which holds `/api/users/[id]`. It reads only the routes'
 * `segments`, which every router extension gives, so routes nest the same way whatever router declares them.
 */

/** A route the outline nests: its id, its URL part by part, and its path as its router writes it, for the labels. */
export type OutlineRoute = Pick<ProjectRoute, "id" | "segments" | "path">

/** One item of an outline: a route, or a folder for URL parts routes share. */
export interface RouteOutlineItem<Route extends OutlineRoute = OutlineRoute> {
  /** Unique in the outline, and the same for the same URL parts each time: to keep an item open or closed. */
  key: string
  /**
   * The URL parts it adds to the item it's in, as the router writes them: `users`, `[id]`, or `v1/users` where a folder
   * that would hold only one thing is folded into it. An item at the top starts with a slash: `/api`.
   */
  label: string
  /** The route it is, or undefined for a folder. */
  route?: Route
  /** What it holds, folders and routes together, in order by label. */
  items: RouteOutlineItem<Route>[]
}

/** A part of the URL in progress: the routes at exactly these parts, and the parts after them. */
interface Branch<Route> {
  segments: RouteSegment[]
  routes: Route[]
  next: Map<string, Branch<Route>>
}

/**
 * Routes nested by their URLs: a route under the route or folder for the URL parts it starts with. A route whose URL
 * starts another's holds it, as `/api/users` holds `/api/users/[id]`, and opens. A folder stands for parts that two or
 * more things share but no route ends at; parts only one thing has are folded into that thing's label instead, so no
 * folder holds just one item: `/api/v1/users` alone is one item, not three. Routes at the same URL are each an item.
 */
export function routeOutline<Route extends OutlineRoute>(routes: readonly Route[]): RouteOutlineItem<Route>[] {
  const top: Branch<Route> = { segments: [], routes: [], next: new Map() }

  for (const route of routes) {
    let branch = top
    const segments = urlParts(route)

    for (const [at, segment] of segments.entries()) {
      const key = segmentKey(segment)
      let next = branch.next.get(key)

      if (!next) {
        next = { segments: segments.slice(0, at + 1), routes: [], next: new Map() }
        branch.next.set(key, next)
      }

      branch = next
    }

    branch.routes.push(route)
  }

  // A route with no URL parts, as one at the app's root, is an item at the top with its path.
  const atRoot = top.routes.map((route) => ({ key: `#${route.id}`, label: route.path, route, items: [] }))

  return sortItems([...atRoot, ...itemsIn(top, 0)])
}

/** The items for the branches after `branch`, whose URL has `from` parts. */
function itemsIn<Route extends OutlineRoute>(branch: Branch<Route>, from: number): RouteOutlineItem<Route>[] {
  return [...branch.next.values()].flatMap((next) => itemsFor(next, from))
}

/** The items a branch is: its routes, or a folder, or, with neither of its own and one way on, that way folded in. */
function itemsFor<Route extends OutlineRoute>(branch: Branch<Route>, from: number): RouteOutlineItem<Route>[] {
  let at = branch

  while (at.routes.length === 0 && at.next.size === 1) {
    at = at.next.values().next().value!
  }

  const inside = sortItems(itemsIn(at, at.segments.length))
  const [first, ...more] = at.routes

  if (!first) {
    return [{ key: keyOf(at.segments), label: label(firstRoute(at)!, at, from), items: inside }]
  }

  return [
    { key: keyOf(at.segments), label: label(first, at, from), route: first, items: inside },
    ...more.map((route) => leaf(route, at, from))
  ]
}

/** A route that holds nothing of its own, as the second of two routes at one URL. */
function leaf<Route extends OutlineRoute>(route: Route, at: Branch<Route>, from: number): RouteOutlineItem<Route> {
  return { key: `${keyOf(at.segments)}#${route.id}`, label: label(route, at, from), route, items: [] }
}

/** The first route at or after a branch, which writes its URL parts as the router does. */
function firstRoute<Route>(branch: Branch<Route>): Route | undefined {
  return branch.routes[0] ?? [...branch.next.values()].map(firstRoute).find((route) => route !== undefined)
}

/**
 * The URL parts from `from` to a branch's end, as `route`'s path writes them, since every router writes one part of its
 * path between slashes for each segment. A path that doesn't, which no extension gives, is written from its segments.
 */
function label(route: OutlineRoute, at: Branch<unknown>, from: number): string {
  const parts = route.path.split("/").filter((part) => part !== "")

  const shown =
    parts.length === urlParts(route).length
      ? parts.slice(from, at.segments.length)
      : at.segments.slice(from).map(segmentText)

  const text = shown.join("/")

  return from === 0 ? `/${text}` : text
}

/** A segment written plainly, for a path that doesn't write one part for each. */
function segmentText(segment: RouteSegment): string {
  switch (segment.type) {
    case "static":
      return segment.value
    case "param":
      return `:${segment.name}`
    case "catchAll":
      return `*${segment.name}`
    case "optionalCatchAll":
      return `*${segment.name}?`
  }
}

/** A route's URL parts that add to the URL: all but an empty one, which some routers write for an index. */
function urlParts(route: Pick<ProjectRoute, "segments">): RouteSegment[] {
  return route.segments.filter((segment) => segment.type !== "static" || segment.value !== "")
}

/** A segment as text that's the same for segments that match the same. */
function segmentKey(segment: RouteSegment): string {
  return `${segment.type}:${segment.type === "static" ? segment.value : segment.name}`
}

/** An item's key from its URL parts. */
function keyOf(segments: readonly RouteSegment[]): string {
  return segments.map(segmentKey).join("/")
}

function sortItems<Route extends OutlineRoute>(items: RouteOutlineItem<Route>[]): RouteOutlineItem<Route>[] {
  return items.toSorted((a, b) => a.label.localeCompare(b.label))
}
