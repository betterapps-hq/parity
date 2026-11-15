import type { ComponentEvidence } from "./library.ts"
import type { ComponentSource } from "./project.ts"
import type { ProjectRoute } from "./routes.ts"

/** An export of the app's that isn't listed as a component, and why, so a person or agent looking for it learns why. */
export interface LeftOutExport {
  name: string
  /** Its file, relative to the project root. */
  path: string
  /** Its name in that file: `default` for a default export. */
  export: string
  reason: string
  /** Whether its types couldn't say either way, rather than saying it isn't one. */
  undecided?: true
}

/** What a component was recognised as, in words: "a class component", "made with memo". */
export function describeEvidence(as: ComponentEvidence): string {
  switch (as) {
    case "function":
      return "a function returning something React renders"
    case "forwardRef":
      return "made with forwardRef"
    case "memo":
      return "made with memo"
    case "lazy":
      return "made with lazy"
    case "class":
      return "a class component"
    case "exotic":
      return "a component object, such as a library's primitive under another name"
  }
}

/**
 * Where the Components panel lists one of the project's own components: with its UI kit, which loads with the canvas;
 * with the rest of the app, by folder; or with its pages, the files its routes are made of.
 */
export type ComponentRole = "kit" | "app" | "page"

/**
 * The files an app's routes are made of, from the project root, each with its route: every route's own file, and the
 * files it draws while it loads, fails or matches nothing. Whatever router the project has, its provider gives them, so
 * nothing here knows a router's file names (PAR-1163).
 */
export type RouteFiles = ReadonlyMap<string, ProjectRoute>

/** No routes, as for a project without a router, or the CLI, which reads none. */
const noRoutes: RouteFiles = new Map()

/** The files an app's routes are made of, each with its route. A file that's two routes' is the first's. */
export function routeFiles(routes: readonly ProjectRoute[]): RouteFiles {
  const files = new Map<string, ProjectRoute>()

  for (const route of routes) {
    for (const file of [route.file, ...Object.values(route.stateFiles ?? {})]) {
      if (!files.has(file)) {
        files.set(file, route)
      }
    }
  }

  return files
}

/** The project's own component's role, a page when its file is one of its routes'; unset for a library's. */
export function componentRole(source: ComponentSource, routes: RouteFiles = noRoutes): ComponentRole | undefined {
  if (source.library) {
    return undefined
  }

  if (routes.has(source.path)) {
    return "page"
  }

  return source.lazy ? "app" : "kit"
}

/** Whether a component is the page for `/`: the file of a page route at the root's own URL, not a layout or state. */
export function rendersRoot(source: ComponentSource, routes: RouteFiles): boolean {
  const route = routes.get(source.path)

  return route?.kind === "page" && route.file === source.path && route.segments.length === 0
}

/** Components listed under one heading. */
export interface ComponentGroup {
  /** The file, folder or route they share; empty when there is only one. */
  name: string
  ids: string[]
}

/**
 * Components under headings: by the file that defines them, as shadcn groups Card, CardHeader and CardTitle; by folder,
 * less the folders they all share (so `src/` isn't repeated); or by page route. Headings are in order, and within a
 * folder components stay beside the others from their file.
 */
export function groupComponents(
  entries: readonly (readonly [string, ComponentSource])[],
  by: "file" | "folder" | "route",
  routes: RouteFiles = noRoutes
): ComponentGroup[] {
  const fileOf = (source: ComponentSource) => source.declaration ?? source.path

  const names = entries.map(([, source]) => {
    if (by === "file") {
      return fileOf(source)
        .split("/")
        .at(-1)!
        .replace(/(\.d)?\.[cm]?[jt]sx?$/, "")
    }

    return by === "route" ? (routes.get(source.path)?.path ?? folderOf(source.path)) : folderOf(source.path)
  })

  const shared = by === "folder" ? sharedFolders(names) : 0
  const groups = new Map<string, [string, ComponentSource][]>()
  entries.forEach(([id, source], index) => {
    const name = by === "folder" ? names[index]!.split("/").slice(shared).join("/") : names[index]!
    groups.set(name, [...(groups.get(name) ?? []), [id, source]])
  })

  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([name, members]) => ({
      name,
      ids: (by === "file"
        ? members
        : [...members].sort(
            ([a, one], [b, other]) => fileOf(one).localeCompare(fileOf(other), "en") || a.localeCompare(b, "en")
          )
      ).map(([id]) => id)
    }))
}

function folderOf(path: string): string {
  const slash = path.lastIndexOf("/")

  return slash === -1 ? "" : path.slice(0, slash)
}

/** How many leading folders every path has in common, keeping at least each one's last. */
function sharedFolders(folders: string[]): number {
  if (folders.length === 0) {
    return 0
  }

  const split = folders.map((folder) => folder.split("/"))
  let count = 0

  while (split.every((parts) => parts.length > count + 1 && parts[count] === split[0]![count])) {
    count++
  }

  return count
}
