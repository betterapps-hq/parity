import type { ComponentEvidence } from "./library.ts"
import type { ComponentSource } from "./project.ts"

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
 * with the rest of the app, by folder; or with its pages, until the routes lens can name them.
 */
export type ComponentRole = "kit" | "app" | "page"

/** The project's own component's role; unset for a library's. */
export function componentRole(source: ComponentSource): ComponentRole | undefined {
  if (source.library) return undefined
  if (isPage(source.path)) return "page"
  return source.lazy ? "app" : "kit"
}

/** Next.js's app router makes pages, layouts and their error and loading states from files with these names. */
const nextRouteFile =
  /(?:^|\/)app\/(?:(.+)\/)?(?:page|layout|template|default|loading|error|global-error|not-found)\.[cm]?[jt]sx?$/
/** File-based routers (Next's pages router, React Router, Remix, TanStack Router) make a page of each file here. */
const routesFolder = /(?:^|\/)(?:pages|routes)\/(.+)\.[cm]?[jt]sx?$/

/**
 * Whether a file is a page by its router's naming. In a `pages` or `routes` folder, files whose names start with `_` or
 * `-` are the router's own (`_app`, `__root`) or ones it skips, and `api` holds server routes.
 */
function isPage(path: string): boolean {
  if (nextRouteFile.test(path)) return true
  const route = routesFolder.exec(path)?.[1]
  return route !== undefined && !/(?:^|\/)[-_]/.test(route) && !route.startsWith("api/")
}

/** A page's route, from its file: `src/app/(shop)/orders/[id]/page.tsx` is `/(shop)/orders/[id]`. */
export function pageRoute(path: string): string {
  const next = nextRouteFile.exec(path)
  if (next) return `/${next[1] ?? ""}`
  const route = routesFolder.exec(path)?.[1]
  if (route === undefined) return folderOf(path)
  return `/${route.replace(/(?:^|\/)_?index$/, "")}`
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
  by: "file" | "folder" | "route"
): ComponentGroup[] {
  const fileOf = (source: ComponentSource) => source.declaration ?? source.path
  const names = entries.map(([, source]) => {
    if (by === "file")
      return fileOf(source)
        .split("/")
        .at(-1)!
        .replace(/(\.d)?\.[cm]?[jt]sx?$/, "")
    return by === "route" ? pageRoute(source.path) : folderOf(source.path)
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
  if (folders.length === 0) return 0
  const split = folders.map((folder) => folder.split("/"))
  let count = 0
  while (split.every((parts) => parts.length > count + 1 && parts[count] === split[0]![count])) count++
  return count
}
