/*
 * A route's page trace (docs/proposals/route-frames.md, "A page's trace"): the project files a route's frozen copy and
 * its picture were made from, chosen by what the project's builder and router can say. A file listed that the page
 * doesn't read costs a capture at most, where one left out could show a picture of old code as current, so a builder
 * that can't say for a route gives it the whole project: slower, never wrong. Whether a kept picture still holds is the
 * same digest as a frame's (`traceDigest`); which copies a change makes stale is the window's.
 */

/** A route as its trace finds it: its id, its file from the root, and the route it draws inside. */
export interface TracedRoute {
  id: string
  file: string
  parent?: string
}

/** What a route's trace is chosen from. Every path is relative to the project's root, with forward slashes. */
export interface PageTraceInput {
  /** The route's id. */
  route: string
  /**
   * The copy is of the route's own page. One it redirected to, or its not-found or error page, draws files the route's
   * chain doesn't lead to, such as another route's or a framework's special files, so it takes the whole project.
   */
  landed: boolean
  routes: readonly TracedRoute[]
  /** Its router names routes by folder, as Next's App and Pages Routers do. */
  folderRoutes: boolean
  /** What the builder says the route's files load (`BuilderSession.loadedFiles`), or undefined when it can't say. */
  loaded: readonly string[] | undefined
  /** Parity's own scan of the route's files' imports, server code's included. */
  scanned: readonly string[]
  /** The project's stylesheets and what they import. */
  styles: readonly string[]
  /** Every file every page depends on: the root's package.json, configs and lockfiles (`sharedPreviewFiles`). */
  shared: readonly string[]
  /** Every file of the project, lockfiles included, for a route its builder can't say for. */
  files: readonly string[]
}

/** The files of a route and the routes it draws inside, its own first. Empty for a route that isn't known. */
export function routeChain(route: string, routes: readonly TracedRoute[]): string[] {
  const byId = new Map(routes.map((each) => [each.id, each]))
  const chain: string[] = []
  const seen = new Set<string>()

  for (
    let at = byId.get(route);
    at && !seen.has(at.id);
    at = at.parent === undefined ? undefined : byId.get(at.parent)
  ) {
    seen.add(at.id)
    chain.push(at.file)
  }

  return chain
}

/**
 * The files a route's page trace lists, sorted:
 *
 * - Where the builder says what the route's files load (Vite, the webpack-compatible builders): those, the route's and
 *   its parents' files, and Parity's scan of their imports, which reaches the modules a loader or server function reads
 *   that the page never loads.
 * - Where the router names routes by folder (Next.js, which has no `loadedFiles`): every file under the route's folder,
 *   its parents' files (the layouts), and the scan.
 * - Otherwise, for a route that isn't known, or for a page that didn't land on its own route: the whole project.
 *
 * Each with the stylesheets and the files every page depends on.
 */
export function pageTraceFiles(input: PageTraceInput): string[] {
  const chain = routeChain(input.route, input.routes)
  const sorted = (files: Iterable<string>) => [...new Set(files)].sort((a, b) => a.localeCompare(b, "en"))

  if (chain.length === 0 || !input.landed || (input.loaded === undefined && !input.folderRoutes)) {
    return sorted(input.files)
  }

  const common = [...chain, ...input.scanned, ...input.styles, ...input.shared]

  if (input.loaded !== undefined) {
    return sorted([...common, ...input.loaded])
  }

  const folder = folderOf(chain[0]!)
  const under = input.files.filter((path) => (folder === "" ? !path.startsWith("../") : path.startsWith(`${folder}/`)))

  return sorted([...common, ...under])
}

function folderOf(path: string): string {
  const slash = path.lastIndexOf("/")

  return slash === -1 ? "" : path.slice(0, slash)
}
