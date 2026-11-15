import type { Route, RouteSegment } from "@parity-app/extension-api"

/*
 * Next.js's file conventions in Parity's terms (PAR-1162). Next.js has no route tree to read: its routes are its
 * files, under `app/` for the App Router and `pages/` for the Pages Router, either at the project's root or in `src/`,
 * and one app can use both. This turns those files into Parity's router-neutral routes (PAR-1132), from data to data:
 * the files' paths in, and the texts of the files that draw, as a page's or a layout's.
 */

/** The folders Next.js reads routes from, from the project's root: each where Next.js looks, root first. */
export const routerFolders = { app: ["app", "src/app"], pages: ["pages", "src/pages"] } as const

/** The folders a project's routes come from, as Next.js picks them. */
export interface NextFolders {
  /** The App Router's folder: `app` or `src/app`. */
  app?: string
  /** The Pages Router's folder: `pages` or `src/pages`. */
  pages?: string
}

/** Files Next.js reads as routes, with its default `pageExtensions`, plus MDX, which projects add for content pages. */
const routeFile = /^(.*)\.(?:tsx|ts|jsx|js|mdx)$/

/** Files beside routes that aren't routes: types, tests and stories. */
const notRoute = /\.(?:d|test|spec|stories)\.[^.]+$/

/**
 * The folders the project's routes come from, given every file found under each of `routerFolders`, from the project's
 * root. Next.js reads `src/app` and `src/pages` only when neither `app` nor `pages` is at the root.
 */
export function pickFolders(files: readonly string[]): NextFolders {
  const has = (folder: string) => files.some((file) => file.startsWith(`${folder}/`) && routeFile.test(file))
  const atRoot = has("app") || has("pages")
  const folders: NextFolders = {}

  for (const router of ["app", "pages"] as const) {
    const folder = atRoot ? router : `src/${router}`

    if (has(folder)) {
      folders[router] = folder
    }
  }

  return folders
}

/**
 * The files whose text says what a route draws and loads: every page and layout, and the Pages Router's `_app`. The
 * rest, as `loading` or `not-found`, are only named.
 */
export function sourceFiles(files: readonly string[], folders: NextFolders): string[] {
  return files.filter((file) => {
    const app = folders.app === undefined ? false : inFolder(file, folders.app)

    if (app !== false) {
      const name = appFile(app)?.name

      return name === "page" || name === "layout"
    }

    const pages = folders.pages === undefined ? false : inFolder(file, folders.pages)

    return pages !== false && pagesFile(pages) !== undefined
  })
}

/**
 * The app's routes, each parent before its children, from the files under its router folders and the texts of
 * `sourceFiles`. Empty without a page in either folder.
 *
 * With one router, its root is the app's root: the App Router's root layout, or the Pages Router's `_app`. With both,
 * the App Router's root layout is the root and `_app` a group inside it holding the Pages Router's pages, as each draws
 * in its own; without an `_app`, those pages sit under the root itself. A root Next.js would write for itself, as an
 * `app/` without a root layout, is named by its folder.
 */
export function readRoutes(
  files: readonly string[],
  folders: NextFolders,
  texts: Readonly<Record<string, string>>
): Route[] {
  const app = folders.app ? appRoutes(files, folders.app, texts) : undefined
  const pages = folders.pages ? pagesRoutes(files, folders.pages, texts) : undefined
  const found = [app, pages].filter((router) => router !== undefined && router.routes.length > 0)
  const [first, second] = found

  if (!first) {
    return []
  }

  if (!second) {
    return resolveInterceptions([first.root, ...first.routes])
  }

  // Both: the App Router's root holds the Pages Router's routes, inside `_app` when the project has one.
  const root = first.root
  const holder: Route | undefined = second.ownRoot ? { ...second.root, kind: "group", parent: root.id } : undefined
  const parent = holder?.id ?? root.id

  if (!holder && second.root.stateFiles) {
    root.stateFiles = { ...second.root.stateFiles, ...root.stateFiles }
  }

  const held = second.routes.map((route) => (route.parent === second.root.id ? { ...route, parent } : route))

  return resolveInterceptions([root, ...first.routes, ...(holder ? [holder] : []), ...held])
}

/** One router's routes below its root, and its root: the project's own file, or one named by its folder. */
interface RouterRoutes {
  root: Route
  ownRoot: boolean
  routes: Route[]
}

/** What a file under `app/` is, by its name: `page`, `layout`, `loading` and so on. */
function appFile(path: string): { folder: string; name: string } | undefined {
  const match = routeFile.exec(path)

  if (!match?.[1] || notRoute.test(path)) {
    return undefined
  }

  const slash = match[1].lastIndexOf("/")

  return { folder: slash < 0 ? "" : match[1].slice(0, slash), name: match[1].slice(slash + 1) }
}

/** The files that make up one folder of the App Router: one route segment. */
interface AppFolder {
  page?: string
  layout?: string
  loading?: string
  error?: string
  notFound?: string
}

/** The App Router's special files Parity reads, by their names. */
const appNames = new Map<string, keyof AppFolder>([
  ["page", "page"],
  ["layout", "layout"],
  ["loading", "loading"],
  ["error", "error"],
  ["global-error", "error"],
  ["not-found", "notFound"]
])

/** A folder's place in the App Router's tree, worked out from its parts. */
interface Place {
  segments: RouteSegment[]
  /** The id of the route a page here draws inside: the nearest layout's. */
  parent: string
  slot?: string
  /** Whether the folder, or one it's in, intercepts another route. */
  intercepting: boolean
  /** Whether a private `_folder` or one it's in keeps it out of routing. */
  private: boolean
}

/**
 * The App Router's routes: a folder with a `layout` is a layout, or a group for a `(group)` folder, and a folder's
 * `page` is a page inside the nearest layout. `loading`, `error` and `not-found` belong to their folder's layout, else
 * its page. A `@slot` folder's routes are that slot's, and a `(.)`, `(..)` or `(...)` folder's intercept the route at
 * the URL they match.
 */
function appRoutes(files: readonly string[], folder: string, texts: Readonly<Record<string, string>>): RouterRoutes {
  const folders = new Map<string, AppFolder>()

  for (const file of files) {
    const path = inFolder(file, folder)
    const found = path === false ? undefined : appFile(path)
    const key = found && appNames.get(found.name)

    if (found && key) {
      const entry = folders.get(found.folder) ?? {}
      // `error` wins over `global-error` at the root, as the root layout's own boundary is what draws first.
      entry[key] = key === "error" && entry.error && found.name === "global-error" ? entry.error : file
      folders.set(found.folder, entry)
    }
  }

  const rootFiles = folders.get("") ?? {}

  const root: Route = {
    id: rootFiles.layout ? withoutExtension(rootFiles.layout) : folder,
    kind: "root",
    segments: [],
    path: "/",
    file: rootFiles.layout ?? folder,
    index: false,
    ...fileFacts(rootFiles.layout, texts, "app")
  }

  const places = new Map<string, Place>([["", { segments: [], parent: root.id, intercepting: false, private: false }]])
  const routes: Route[] = []

  // Parents before children, the root's own folder first: a folder's parts are one more than its parent's.
  const ordered = [...folders.keys()].toSorted((a, b) => depth(a) - depth(b) || a.localeCompare(b))

  for (const key of ordered) {
    const place = placeOf(key, places)
    const entry = folders.get(key) ?? {}

    if (place.private) {
      continue
    }

    const base = { segments: place.segments, path: nextPath(place.segments) }

    // The root's own layout is the root.
    let layout: Route | undefined = key === "" ? root : undefined

    if (entry.layout && key !== "") {
      const last = key.slice(key.lastIndexOf("/") + 1)

      layout = {
        id: withoutExtension(entry.layout),
        kind: groupName(last) === undefined ? "layout" : "group",
        ...base,
        parent: place.parent,
        file: entry.layout,
        index: false,
        ...fileFacts(entry.layout, texts, "app")
      }
      routes.push(placed(layout, place))
      places.set(key, { ...place, parent: layout.id })
    }

    let page: Route | undefined

    if (entry.page) {
      const parent = layout ?? routes.find((route) => route.id === place.parent) ?? root

      page = {
        id: withoutExtension(entry.page),
        kind: "page",
        ...base,
        parent: parent.id,
        file: entry.page,
        index: sameSegments(parent.segments, place.segments),
        ...fileFacts(entry.page, texts, "app")
      }
      routes.push(placed(page, place))
    }

    const states = stateFiles(entry)
    const owner = layout ?? page

    if (states && owner) {
      owner.stateFiles = states
    }
  }

  return { root, ownRoot: rootFiles.layout !== undefined, routes }
}

/** A route with the slot it fills and whether it intercepts, as its folder's place says. */
function placed(route: Route, place: Place): Route {
  if (place.slot !== undefined) {
    route.slot = place.slot
  }

  // Which route it intercepts is found once every route is read.
  if (place.intercepting) {
    route.intercepts = ""
  }

  return route
}

/** How deep a folder is in `app/`: none for `app/` itself. */
function depth(key: string): number {
  return key === "" ? 0 : key.split("/").length
}

/** A folder's place, from its parent's and its own last part. */
function placeOf(key: string, places: Map<string, Place>): Place {
  const known = places.get(key)

  if (known) {
    return known
  }

  const slash = key.lastIndexOf("/")
  const parentKey = slash < 0 ? "" : key.slice(0, slash)
  const parent = placeOf(parentKey, places)
  const part = key.slice(slash + 1)
  const place: Place = { ...parent, segments: [...parent.segments] }

  if (part.startsWith("_")) {
    place.private = true
  } else if (part.startsWith("@")) {
    const slot = part.slice(1)

    // `@children` is the layout's own children, not a slot beside them.
    if (slot !== "children") {
      place.slot = slot
    }
  } else if (groupName(part) === undefined) {
    const intercept = interceptionOf(part)

    if (intercept) {
      place.intercepting = true
      place.segments =
        intercept.levels === "root" ? [] : place.segments.slice(0, place.segments.length - intercept.levels)
      place.segments.push(segmentOf(intercept.rest))
    } else {
      place.segments.push(segmentOf(part))
    }
  }

  places.set(key, place)

  return place
}

/** A `(group)` folder's name, or nothing for any other folder, an intercepting one included. */
function groupName(part: string): string | undefined {
  return /^\(([^.)][^)]*)\)$/.exec(part)?.[1]
}

/**
 * An intercepting folder's reach and the part after its marker: `(.)photo` matches beside it, `(..)photo` a segment up,
 * `(..)(..)photo` two, and `(...)photo` from the app's root.
 */
function interceptionOf(part: string): { levels: number | "root"; rest: string } | undefined {
  if (part.startsWith("(...)")) {
    return { levels: "root", rest: part.slice(5) }
  }

  if (part.startsWith("(.)")) {
    return { levels: 0, rest: part.slice(3) }
  }

  const ups = /^((?:\(\.\.\))+)(.+)$/.exec(part)

  return ups?.[1] && ups[2] ? { levels: ups[1].length / 4, rest: ups[2] } : undefined
}

/**
 * The Pages Router's routes: each file a page under `_app`, its path its own with `index` left off. `404`, `500` and
 * `_error` are what `_app` draws when nothing matches or a page fails, and `_document` and `api/` draw no page.
 */
function pagesRoutes(files: readonly string[], folder: string, texts: Readonly<Record<string, string>>): RouterRoutes {
  const named = new Map<string, string>()
  const pages: string[] = []

  for (const file of files) {
    const path = inFolder(file, folder)
    const name = path === false ? undefined : pagesFile(path)

    if (name === undefined) {
      continue
    }

    if (["_app", "404", "500", "_error"].includes(name)) {
      named.set(name, file)
    } else {
      pages.push(file)
    }
  }

  const app = named.get("_app")

  const root: Route = {
    id: app ? withoutExtension(app) : folder,
    kind: "root",
    segments: [],
    path: "/",
    file: app ?? folder,
    index: false,
    ...fileFacts(app, texts, "pages")
  }

  const notFound = named.get("404")
  const error = named.get("500") ?? named.get("_error")

  const states = stateFiles({ error, notFound })

  if (states) {
    root.stateFiles = states
  }

  const routes = pages
    .map((file): Route => {
      const name = pagesFile(inFolder(file, folder) || "") ?? ""
      const parts = name.split("/")
      const segments = (parts.at(-1) === "index" ? parts.slice(0, -1) : parts).map(segmentOf)

      return {
        id: withoutExtension(file),
        kind: "page",
        segments,
        path: nextPath(segments),
        parent: root.id,
        file,
        index: segments.length === 0,
        ...fileFacts(file, texts, "pages")
      }
    })
    .toSorted((a, b) => a.path.localeCompare(b.path))

  return { root, ownRoot: app !== undefined, routes }
}

/**
 * A Pages Router file's route name, its path in the folder without its extension, or nothing for a file that draws no
 * page here: one under `api/`, `_document`, or a type, test or story.
 */
function pagesFile(path: string): string | undefined {
  const name = routeFile.exec(path)?.[1]

  if (!name || notRoute.test(path) || name === "_document" || name === "api" || name.startsWith("api/")) {
    return undefined
  }

  return name
}

/** A folder or file name's segment: `[id]` a param, `[...slug]` a catch-all, `[[...slug]]` an optional one. */
function segmentOf(part: string): RouteSegment {
  const optional = /^\[\[\.\.\.([^\]]+)\]\]$/.exec(part)?.[1]

  if (optional) {
    return { type: "optionalCatchAll", name: optional }
  }

  const catchAll = /^\[\.\.\.([^\]]+)\]$/.exec(part)?.[1]

  if (catchAll) {
    return { type: "catchAll", name: catchAll }
  }

  const param = /^\[([^\]]+)\]$/.exec(part)?.[1]

  return param ? { type: "param", name: param } : { type: "static", value: part }
}

/** Segments as Next.js writes them in a URL: `/blog/[slug]`, `/docs/[...slug]`. */
function nextPath(segments: readonly RouteSegment[]): string {
  const parts = segments.map((segment) => {
    switch (segment.type) {
      case "static":
        return segment.value
      case "param":
        return `[${segment.name}]`
      case "catchAll":
        return `[...${segment.name}]`
      case "optionalCatchAll":
        return `[[...${segment.name}]]`
    }
  })

  return `/${parts.join("/")}`
}

/** Whether two routes match the same URLs. */
function sameSegments(a: readonly RouteSegment[], b: readonly RouteSegment[]): boolean {
  return a.length === b.length && a.every((segment, index) => nextPath([segment]) === nextPath([b[index]!]))
}

/**
 * Points each intercepting route at the route it shows in place of: the page, not itself intercepting, that matches
 * the same URLs. One whose page isn't in the app says its own path instead.
 */
function resolveInterceptions(routes: Route[]): Route[] {
  return routes.map((route) => {
    if (route.intercepts === undefined) {
      return route
    }

    const shown = routes.find(
      (other) =>
        other.kind === "page" &&
        other.intercepts === undefined &&
        other.slot === undefined &&
        sameSegments(other.segments, route.segments)
    )

    return { ...route, intercepts: shown?.id ?? route.path }
  })
}

/** A folder's `loading`, `error` and `not-found` files, or nothing when it has none. */
function stateFiles(entry: AppFolder): Route["stateFiles"] {
  const states: NonNullable<Route["stateFiles"]> = {}

  for (const key of ["loading", "error", "notFound"] as const) {
    const file = entry[key]

    if (file) {
      states[key] = file
    }
  }

  return Object.keys(states).length > 0 ? states : undefined
}

/**
 * What a route's file says of it: the component it exports by default, by its name; whether it loads data before it
 * draws, as an App Router `async` component or a Pages Router `getServerSideProps`, `getStaticProps` or
 * `getInitialProps`; and whether it can redirect or refuse first, with `redirect` or `notFound`.
 */
function fileFacts(
  file: string | undefined,
  texts: Readonly<Record<string, string>>,
  router: "app" | "pages"
): Pick<Route, "component" | "loads" | "guards"> {
  const text = file === undefined ? undefined : texts[file]

  if (text === undefined) {
    return { loads: false, guards: false }
  }

  const component = defaultName(text)

  const said: Pick<Route, "component" | "loads" | "guards"> = {
    loads:
      router === "app"
        ? isAsyncDefault(text, component)
        : /\b(?:getServerSideProps|getStaticProps|getInitialProps)\b/.test(text),
    guards:
      router === "app"
        ? /\b(?:redirect|permanentRedirect|notFound)\s*\(/.test(text)
        : /\bgetServerSideProps\b/.test(text) && /\b(?:redirect|notFound)\s*:/.test(text)
  }

  if (component !== undefined) {
    said.component = component
  }

  return said
}

/** The name of the component a file exports by default, when it names one. */
function defaultName(text: string): string | undefined {
  const declared = /export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/.exec(text)?.[1]

  if (declared) {
    return declared
  }

  const named = /export\s+default\s+([A-Za-z_$][\w$]*)\s*(?:;|$)/m.exec(text)?.[1]

  if (named && !["async", "function", "class"].includes(named)) {
    return named
  }

  return /export\s*\{[^}]*\b([A-Za-z_$][\w$]*)\s+as\s+default\b/.exec(text)?.[1]
}

/** Whether the default export is an `async` function, as a server component that awaits its data is. */
function isAsyncDefault(text: string, name: string | undefined): boolean {
  if (/export\s+default\s+async\b/.test(text)) {
    return true
  }

  if (name === undefined) {
    return false
  }

  const escaped = name.replaceAll("$", "\\$")

  return new RegExp(
    `(?:async\\s+function\\s+${escaped}\\b|(?:const|let)\\s+${escaped}\\s*(?::[^=]+)?=\\s*async\\b)`
  ).test(text)
}

/** A file's path in `folder`, or false when it's outside it. */
function inFolder(file: string, folder: string): string | false {
  return file.startsWith(`${folder}/`) ? file.slice(folder.length + 1) : false
}

function withoutExtension(file: string): string {
  return file.replace(/\.[^./]+$/, "")
}
