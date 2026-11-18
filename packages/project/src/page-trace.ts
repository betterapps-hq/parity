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
 * Where a router that names routes by folder draws a route from beside its imports: under one of `prefixes`, and
 * directly in one of `folders`. A file added there counts for the route's copies, as no import names it.
 */
export interface RouteFolders {
  prefixes: string[]
  folders: string[]
}

/**
 * A route's page trace as its frozen copies keep it: the files it lists, or `"all"` for the whole project, so a file
 * added anywhere counts too; and, for a router that names routes by folder, the folders where an added file counts.
 */
export interface PageTrace {
  files: string[] | "all"
  folders?: RouteFolders
}

/** The root's `public` folder: a page reaches its files by URL, so one added there, as a missing logo, counts too. */
const publicFolder = "public/"

/**
 * A route's page trace:
 *
 * - Where the builder says what the route's files load (Vite, the webpack-compatible builders): those, the route's and
 *   its parents' files, and Parity's scan of their imports, which reaches the modules a loader or server function reads
 *   that the page never loads.
 * - Where the router names routes by folder (Next.js, which has no `loadedFiles`): every file under the route's folder,
 *   its parents' files (the layouts), what wraps it from the folders above (`routeFolders`), and the scan, with those
 *   folders.
 * - Otherwise, for a route that isn't known, or for a page that didn't land on its own route: the whole project.
 *
 * Each with the stylesheets, the files every page depends on, and the files in the root's `public` folder, which pages
 * reach by URL rather than by import, as an image or a font, so no scan finds which one a page draws, and a file added
 * there counts too. Its files are sorted.
 */
export function pageTrace(input: PageTraceInput): PageTrace {
  const chain = routeChain(input.route, input.routes)

  if (chain.length === 0 || !input.landed || (input.loaded === undefined && !input.folderRoutes)) {
    return { files: "all" }
  }

  const assets = input.files.filter((path) => path.startsWith("public/"))
  const common = [...chain, ...input.scanned, ...input.styles, ...input.shared, ...assets]

  if (input.loaded !== undefined) {
    return { files: sorted([...common, ...input.loaded]), folders: { prefixes: [publicFolder], folders: [] } }
  }

  const folders = routeFolders(chain[0]!)
  const files = sorted([...common, ...input.files.filter((path) => inFolders(folders, path))])

  return { files, folders: { prefixes: [...folders.prefixes, publicFolder], folders: folders.folders } }
}

/** The files a route's page trace lists, sorted (`pageTrace`), every file of the project for the whole project. */
export function pageTraceFiles(input: PageTraceInput): string[] {
  const { files } = pageTrace(input)

  return files === "all" ? sorted(input.files) : files
}

/**
 * Where a router that names routes by folder draws a route from beside its imports: every file under the route's
 * folder, and the files directly in each folder above it, not in their subfolders, where it keeps what wraps every route
 * below, as Next's templates, loading, error and not-found files, which no import reaches; and every file in those
 * folders' parallel slots (`@team/`), which their layouts draw beside the route. The project's root folder's own files
 * are left out, as they're config.
 */
export function routeFolders(route: string): RouteFolders {
  const own = folderOf(route)
  const folders: string[] = []

  for (let folder = folderOf(own); folder !== ""; folder = folderOf(folder)) {
    folders.push(folder)
  }

  return { prefixes: [own === "" ? "" : `${own}/`, ...folders.map((folder) => `${folder}/@`)], folders }
}

/** The files of `files` a router that names routes by folder draws a route from beside its imports (`routeFolders`). */
export function folderRouteFiles(route: string, files: readonly string[]): string[] {
  const folders = routeFolders(route)

  return files.filter((path) => inFolders(folders, path))
}

function inFolders({ prefixes, folders }: RouteFolders, path: string): boolean {
  return (
    !path.startsWith("../") && (folders.includes(folderOf(path)) || prefixes.some((prefix) => path.startsWith(prefix)))
  )
}

function sorted(files: Iterable<string>): string[] {
  return [...new Set(files)].sort((a, b) => a.localeCompare(b, "en"))
}

/** The names an app's entry goes by where no page names it: `main`, `index`, `client` or `entry-client`, in `src/`. */
const entryName = /^(?:src\/)?(?:main|index|client|entry[.-]client)\.m?[jt]sx?$/

/**
 * The files that mount an app, which wrap every page in what they render around the router, such as a theme's provider:
 * the module scripts the root's `index.html` names, and a file named as entries are where it names none. No route's
 * imports reach them, and a builder's `loadedFiles` follows a route's imports, so a page's trace adds them itself.
 */
export function appEntries(files: readonly string[], html: string | undefined): string[] {
  const known = new Set(files)

  const named = [...(html ?? "").matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"'?#]+)/gi)].flatMap(([, src]) => {
    const path = src!.replace(/^\.?\//, "")

    return known.has(path) ? [path] : []
  })

  return named.length > 0 ? named : files.filter((path) => entryName.test(path))
}

function folderOf(path: string): string {
  const slash = path.lastIndexOf("/")

  return slash === -1 ? "" : path.slice(0, slash)
}
