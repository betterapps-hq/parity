/**
 * An app's routes as Parity reads them, whatever router declares them (PAR-1132). A router extension's provider
 * translates its own conventions, as TanStack Router's `$projectId` or Next.js's `[projectId]`, into this shape, so
 * nothing outside the extension reads a router's syntax.
 */

/** One part of a route's URL, between slashes. */
export type RouteSegment =
  /** Matches itself: `settings`. */
  | { type: "static"; value: string }
  /** Matches any one part, given to the route by `name`: TanStack Router's `$projectId`, Next.js's `[projectId]`. */
  | { type: "param"; name: string }
  /** Matches the rest of the URL, one part or more, by `name`: TanStack Router's `$`, Next.js's `[...slug]`. */
  | { type: "catchAll"; name: string }
  /** Matches the rest of the URL or nothing at all, by `name`: Next.js's `[[...slug]]`. */
  | { type: "optionalCatchAll"; name: string }

/**
 * What a route is in the app's tree: the root, which holds every other route; a layout, which adds to the URL and draws
 * the routes inside it at its outlet; a group, which gathers routes without adding to the URL, as Next.js's
 * `(marketing)` or TanStack Router's pathless `_auth`; or a page, with no routes inside it.
 */
export type RouteKind = "root" | "layout" | "group" | "page"

/** One route of an app, as its router declares it: what a router extension's provider gives (PAR-1095). */
export interface ProjectRoute {
  /** The router's id for it, unique in the app. Parity only compares ids, never reads them. */
  id: string
  kind: RouteKind
  /** The URL it matches, from the root, part by part. The root's, and a group's at the top, are empty. */
  segments: RouteSegment[]
  /** Its URL as the router writes it, as people see it in the project: `/projects/$projectId`. Shown, never parsed. */
  path: string
  /** The id of the route it draws inside, at that route's outlet. The root has none. */
  parent?: string
  /** Its file, from the project root, with forward slashes. */
  file: string
  /** Whether it's its parent's index, drawn at its parent's own URL. */
  index: boolean
  /** The component it draws, by its name in its file, when it names one. */
  component?: string
  /** Whether it loads data before it draws. */
  loads: boolean
  /** Whether it can redirect or refuse before it draws. */
  guards: boolean
  /**
   * Where it always sends the browser instead of drawing, from the root, as a layout's index that only redirects to one
   * of the layout's pages: `/settings/profile`. Undefined when it draws, or redirects only sometimes, as a guard does.
   */
  redirect?: string
  /**
   * The slot a parallel route fills, as Next.js's `@modal`: it draws in its layout beside the layout's other routes,
   * rather than at a URL of its own. The canvas doesn't draw slots yet and leaves the route out.
   */
  slot?: string
  /**
   * The route an intercepting route shows in place of, by id, as Next.js's `(.)photo/[id]` does while the app navigates
   * to it. The canvas doesn't draw interceptions yet and leaves the route out.
   */
  intercepts?: string
  /**
   * Files the router draws in its place while it loads, when it fails, or when nothing matches, from the project root
   * with forward slashes, as Next.js's `loading`, `error` and `not-found` files. The canvas doesn't draw them yet.
   */
  stateFiles?: { loading?: string; error?: string; notFound?: string }
}

/** The names of the params a route's URL takes, in order: `["projectId"]` for `/projects/$projectId`. */
export function routeParams(route: Pick<ProjectRoute, "segments">): string[] {
  return route.segments.flatMap((segment) => (segment.type === "static" ? [] : [segment.name]))
}

/** Whether two routes match the same URLs, as a layout and its own index do. */
export function sameSegments(a: Pick<ProjectRoute, "segments">, b: Pick<ProjectRoute, "segments">): boolean {
  return (
    a.segments.length === b.segments.length &&
    a.segments.every((segment, index) => {
      const other = b.segments[index]

      return other !== undefined && segmentKey(other) === segmentKey(segment)
    })
  )
}

/** A segment as text that's the same for segments that match the same: its type and its value or name. */
function segmentKey(segment: RouteSegment): string {
  return `${segment.type}:${segment.type === "static" ? segment.value : segment.name}`
}

/** The last fixed part of a route's URL, which names it when nothing else does: `settings` for `/settings/$tab`. */
export function lastStaticSegment(route: Pick<ProjectRoute, "segments">): string | undefined {
  for (const segment of route.segments.toReversed()) {
    if (segment.type === "static" && segment.value !== "") {
      return segment.value
    }
  }

  return undefined
}

/** Whether the canvas draws a route: every route but a parallel route's slot and an intercepting route, for now. */
export function drawnRoute(route: Pick<ProjectRoute, "slot" | "intercepts">): boolean {
  return route.slot === undefined && route.intercepts === undefined
}
