import { type ConfigRoute, routeModuleExtensions } from "./config.ts"

/** A route module `flatRoutes` found, by its path from the app's folder: `routes/concerts.$city.tsx`. */
type RouteFile = string

/**
 * The routes `flatRoutes()` from `@react-router/fs-routes` makes from file names, as React Router's own does it:
 * `.` nests a route under the one named before it, `$param` is a param, `($optional)` an optional segment, `_index` an
 * index, a name that starts with `_` a layout without a path, a name that ends with `_` leaves its parent's layout, a
 * lone `$` a splat, and `[...]` escapes. `files` are the route modules in `prefix` (`routes`), each from the app's
 * folder; `folders` lists a folder's names, for folders that hold a `route` or `index` module.
 */
export function flatRoutes(
  entries: { name: string; folder: boolean; files?: string[] }[],
  prefix: string
): ConfigRoute[] {
  const modules: RouteFile[] = []

  for (const entry of entries) {
    // Hidden files and folders are left out, as React Router's default `ignoredRouteFiles` does.
    if (entry.name.startsWith(".")) {
      continue
    }

    if (entry.folder) {
      const module = folderModule(entry.files ?? [])

      if (module) {
        modules.push(`${prefix}/${entry.name}/${module}`)
      }
    } else if (routeModuleExtensions.some((extension) => entry.name.endsWith(extension))) {
      modules.push(`${prefix}/${entry.name}`)
    }
  }

  return routeTree(modules, prefix)
}

/** The module a route folder holds: `route.tsx`, else `index.tsx`, with any of a route module's extensions. */
function folderModule(files: string[]): string | undefined {
  for (const base of ["route", "index"]) {
    for (const extension of routeModuleExtensions) {
      if (files.includes(`${base}${extension}`)) {
        return `${base}${extension}`
      }
    }
  }

  return undefined
}

/** A flat route before it's placed under its parent. */
interface FlatRoute {
  id: string
  file: string
  /** Its whole path below the prefix, before its parent's is taken off. */
  path?: string
  index: boolean
  parent?: string
}

/** The flat routes as a tree, each under the route whose id its own starts with, as `flatRoutesUniversal` does. */
function routeTree(modules: RouteFile[], prefix: string): ConfigRoute[] {
  const ids = new Map<string, string>()

  for (const file of modules) {
    const slash = file.lastIndexOf("/")
    const folder = file.slice(0, slash)
    // A module straight in the prefix is named for its file; one in a folder of its own, for the folder.
    const id = folder === prefix ? file.slice(0, file.lastIndexOf(".")) : folder

    // Two modules with one id: the first wins, as React Router keeps it.
    if (!ids.has(id)) {
      ids.set(id, file)
    }
  }

  // Longest first, so each route takes the routes under it before a shorter one whose id also starts theirs can.
  const sorted = [...ids].sort(([a], [b]) => b.length - a.length)
  const routes = new Map<string, FlatRoute>()
  const unplaced = new Set<string>()

  for (const [id, file] of sorted) {
    const index = id.endsWith("_index")
    const [segments, raw] = routeSegments(id.slice(prefix.length + 1))
    const route: FlatRoute = { id, file, index }
    const path = routePath(segments, raw, index)

    if (path !== undefined) {
      route.path = path
    }

    routes.set(id, route)

    for (const child of unplaced) {
      if (child.startsWith(id) && [".", "/"].includes(child.charAt(id.length))) {
        const found = routes.get(child)

        if (found) {
          found.parent = id
        }

        unplaced.delete(child)
      }
    }

    unplaced.add(id)
  }

  // A child's path is below its parent's, so the parent's is taken off the front.
  const tree = new Map<string, ConfigRoute>()

  for (const route of routes.values()) {
    const parentPath = route.parent ? routes.get(route.parent)?.path : undefined
    let path = route.path

    if (parentPath && path) {
      path = path.slice(parentPath.length).replace(/^\//, "").replace(/\/$/, "")
    }

    const node: ConfigRoute = { id: route.id, file: route.file, index: route.index, children: [] }

    if (path) {
      node.path = path
    }

    tree.set(route.id, node)
  }

  const top: ConfigRoute[] = []

  for (const [id] of sorted) {
    const route = routes.get(id)
    const node = tree.get(id)

    if (!route || !node) {
      continue
    }

    const parent = route.parent ? tree.get(route.parent) : undefined

    if (parent) {
      parent.children.push(node)
    } else {
      top.push(node)
    }
  }

  return top
}

/**
 * A flat route's name split into segments at `.` and `/`, each as it goes into the path (`:id`, `*`, `lang?`) and as
 * written (`$id`, `$`, `(lang)`), as React Router's `getRouteSegments` does. `[...]` keeps what's inside as it is.
 */
export function routeSegments(name: string): [string[], string[]] {
  const segments: string[] = []
  const raw: string[] = []
  let segment = ""
  let rawSegment = ""
  let state: "normal" | "escape" | "optional" | "optional-escape" = "normal"

  const push = () => {
    if (segment) {
      segments.push(segment)
      raw.push(rawSegment)
    }

    segment = ""
    rawSegment = ""
  }

  for (let at = 0; at < name.length; at++) {
    const char = name.charAt(at)
    const last = at === name.length - 1

    if (state === "escape" || state === "optional-escape") {
      rawSegment += char

      if (char === "]") {
        state = state === "escape" ? "normal" : "optional"
      } else {
        segment += char
      }

      continue
    }

    if (state === "normal" && (char === "." || char === "/")) {
      push()
      continue
    }

    rawSegment += char

    if (char === "[") {
      state = state === "normal" ? "escape" : "optional-escape"
    } else if (state === "normal" && char === "(") {
      state = "optional"
    } else if (state === "optional" && char === ")") {
      segment += "?"
      state = "normal"
    } else if (!segment && char === "$") {
      segment += last ? "*" : ":"
    } else {
      segment += char
    }
  }

  push()

  return [segments, raw]
}

/**
 * The path a flat route's segments make, as React Router's `createRoutePath` does: an index's last segment and every
 * `_layout` segment add nothing, and a trailing `_` that leaves the parent's layout is dropped. Undefined when nothing's
 * left.
 */
function routePath(segments: string[], raw: string[], index: boolean): string | undefined {
  const parts: string[] = []
  const kept = index ? segments.slice(0, -1) : segments

  for (const [at, part] of kept.entries()) {
    const written = raw[at] ?? ""

    if (part.startsWith("_") && written.startsWith("_")) {
      continue
    }

    parts.push(part.endsWith("_") && written.endsWith("_") ? part.slice(0, -1) : part)
  }

  return parts.length > 0 ? parts.join("/") : undefined
}
