import type { Route } from "@parity-app/extension-api"
import ts from "typescript"
import { type ConfigRoute, joinFolder, type ProjectFiles } from "./config.ts"
import { flatRoutes } from "./flat-routes.ts"
import { alwaysRedirects, type LibraryRoute, readLibraryRoutes } from "./library.ts"
import { readRoutesFile } from "./routes-file.ts"

/** How the app declares its routes: framework mode's `routes.ts`, library mode's route objects or elements, or neither. */
export type RouteMode = "framework" | "library" | "none"

/** What reading an app's routes gives: its routes, how it declares them, and what couldn't be read without running it. */
export interface ReadRoutes {
  routes: Route[]
  mode: RouteMode
  /** Each part of the routes left out, as a sentence. */
  unread: string[]
}

/** The root route's id, as React Router names it in framework mode. */
const rootId = "root"

/** Where framework mode's files are when `react-router.config` doesn't say. */
const defaultAppDirectory = "app"

const configNames = [
  "react-router.config.ts",
  "react-router.config.mts",
  "react-router.config.js",
  "react-router.config.mjs"
]

const routesExtensions = [".ts", ".mts", ".js", ".mjs", ".tsx", ".jsx"]
const scriptExtensions = [".tsx", ".ts", ".jsx", ".js", ".mts", ".mjs"]

/** How many files library mode's routes are looked for in, from the app's entry, before giving up. */
const libraryFileLimit = 40

/**
 * Every route of an app that uses React Router, each parent before its children. Framework mode's `routes.ts` comes
 * first, in the folder `react-router.config` names (`app` by default), with the routes `flatRoutes()` makes from file
 * names. Without it, library mode's routes are looked for from the app's entry: its route objects, or its `<Route>`
 * elements. What can only be known by running the app is left out and named in `unread`.
 */
export async function readRoutes(files: ProjectFiles): Promise<ReadRoutes> {
  const appDirectory = appDirectoryOf(await firstOf(files, configNames))

  const routesFile = await firstOf(
    files,
    routesExtensions.map((extension) => `${appDirectory}/routes${extension}`)
  )

  if (routesFile) {
    return frameworkRoutes(files, appDirectory, routesFile)
  }

  return libraryRoutes(files)
}

/** Framework mode's routes: the root route, with what `routes.ts` declares under it. */
async function frameworkRoutes(
  files: ProjectFiles,
  appDirectory: string,
  routesFile: { path: string; text: string }
): Promise<ReadRoutes> {
  const { routes: config, unread } = await readRoutesFile(routesFile.text, routesFile.path, async (rootDirectory) => {
    const folder = joinFolder(appDirectory, rootDirectory)
    const prefix = joinFolder("", rootDirectory)
    const entries = await files.list(folder)

    return flatRoutes(
      await Promise.all(
        entries.map(async (entry) =>
          entry.folder
            ? { ...entry, files: (await files.list(`${folder}/${entry.name}`)).map((each) => each.name) }
            : entry
        )
      ),
      prefix
    )
  })

  const root = await firstOf(
    files,
    scriptExtensions.map((extension) => `${appDirectory}/root${extension}`)
  )

  const rootFile = root?.path ?? `${appDirectory}/root.tsx`

  const routes: Route[] = [
    { id: rootId, path: "/", file: rootFile, params: [], index: false, ...moduleFacts(root?.text) }
  ]

  const visit = async (route: ConfigRoute, parent: { id: string; path: string }) => {
    const path = fullPath(parent.path, route.path)
    const file = joinFolder(appDirectory, route.file)

    routes.push({
      id: route.id,
      path,
      parent: parent.id,
      file,
      params: paramsOf(path),
      index: route.index,
      ...moduleFacts(await files.read(file))
    })

    for (const child of route.children) {
      await visit(child, { id: route.id, path })
    }
  }

  for (const route of config) {
    await visit(route, { id: rootId, path: "/" })
  }

  return { routes, mode: "framework", unread }
}

/**
 * Library mode's routes, from the first file that declares any: the app's entry, which `index.html` names, and the
 * files it imports, nearest first.
 */
async function libraryRoutes(files: ProjectFiles): Promise<ReadRoutes> {
  const queue = await entryFiles(files)
  const visited = new Set<string>()

  while (queue.length > 0 && visited.size < libraryFileLimit) {
    const file = queue.shift()

    if (file === undefined || visited.has(file)) {
      continue
    }

    visited.add(file)
    const text = await files.read(file)

    if (text === undefined) {
      continue
    }

    const found = readLibraryRoutes(text, file)

    if (found.routes) {
      return { routes: await libraryTree(files, file, found.routes), mode: "library", unread: found.unread }
    }

    for (const imported of relativeImports(text)) {
      const resolved = await resolveModule(files, folderOf(file), imported)

      if (resolved) {
        queue.push(resolved)
      }
    }
  }

  return { routes: [], mode: "none", unread: [] }
}

/** Library mode's routes as Parity's: each at its full path, in the file its component comes from. */
async function libraryTree(files: ProjectFiles, declaredIn: string, declared: LibraryRoute[]): Promise<Route[]> {
  const routes: Route[] = []

  const visit = async (route: LibraryRoute, parent?: { id: string; path: string }) => {
    const path = fullPath(parent?.path ?? "/", route.path)

    const file =
      route.module === undefined
        ? declaredIn
        : ((await resolveModule(files, folderOf(declaredIn), route.module)) ?? declaredIn)

    const found: Route = {
      id: route.id,
      path,
      file,
      params: paramsOf(path),
      index: route.index,
      loads: route.loads,
      guards: route.guards
    }

    if (parent) {
      found.parent = parent.id
    }

    if (route.component !== undefined) {
      found.component = route.component
    }

    if (route.redirect !== undefined) {
      found.redirect = route.redirect
    }

    routes.push(found)

    for (const child of route.children) {
      await visit(child, { id: route.id, path })
    }
  }

  for (const route of declared) {
    await visit(route)
  }

  return routes
}

/** A route's full path: its own below its parent's, or its own when it starts with `/`, or its parent's without one. */
export function fullPath(parent: string, own: string | undefined): string {
  if (own === undefined || own === "") {
    return parent
  }

  const joined = own.startsWith("/") ? own : `${parent.replace(/\/$/, "")}/${own}`

  return joined.length > 1 ? joined.replace(/\/$/, "") : joined
}

/** The params a path takes: `:projectId` and `:lang?` by their names, and a splat as `*`, as React Router names it. */
export function paramsOf(path: string): string[] {
  return path.split("/").flatMap((segment) => {
    if (segment === "*") {
      return ["*"]
    }

    return segment.startsWith(":") ? [segment.slice(1).replace(/\?$/, "")] : []
  })
}

/**
 * What a route module says of its route: the component its default export names, whether it exports a `loader` or
 * `clientLoader`, whether it exports `middleware` or `clientMiddleware`, and where its loader always redirects.
 */
export function moduleFacts(text: string | undefined): Pick<Route, "component" | "loads" | "guards" | "redirect"> {
  if (text === undefined) {
    return { loads: false, guards: false }
  }

  const source = ts.createSourceFile("route.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const exported = new Map<string, ts.Node>()
  let component: string | undefined

  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : []
    const isExported = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    const isDefault = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)

    if (ts.isFunctionDeclaration(statement) && isExported) {
      if (isDefault) {
        component = statement.name?.text
      } else if (statement.name) {
        exported.set(statement.name.text, statement)
      }
    } else if (ts.isVariableStatement(statement) && isExported) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          exported.set(declaration.name.text, declaration.initializer)
        }
      }
    } else if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      component = statement.expression.text
    }
  }

  const facts: Pick<Route, "component" | "loads" | "guards" | "redirect"> = {
    loads: exported.has("loader") || exported.has("clientLoader"),
    guards: exported.has("middleware") || exported.has("clientMiddleware")
  }

  if (component !== undefined) {
    facts.component = component
  }

  const redirect = alwaysRedirects(exported.get("loader")) ?? alwaysRedirects(exported.get("clientLoader"))

  if (redirect !== undefined) {
    facts.redirect = redirect
  }

  return facts
}

/** The folder framework mode's files are in: `appDirectory` in `react-router.config`, or `app`. */
export function appDirectoryOf(config: { text: string } | undefined): string {
  if (!config) {
    return defaultAppDirectory
  }

  const source = ts.createSourceFile("react-router.config.ts", config.text, ts.ScriptTarget.Latest, true)
  let found: string | undefined

  const visit = (node: ts.Node): void => {
    if (
      !found &&
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "appDirectory" &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      found = node.initializer.text
    }

    ts.forEachChild(node, visit)
  }

  visit(source)

  return found === undefined ? defaultAppDirectory : joinFolder("", found)
}

/** The first of some files that's there, with its text. */
async function firstOf(files: ProjectFiles, paths: string[]): Promise<{ path: string; text: string } | undefined> {
  for (const path of paths) {
    const text = await files.read(path)

    if (text !== undefined) {
      return { path, text }
    }
  }

  return undefined
}

/** The app's entry: the module script `index.html` loads, else `src/main` or `src/index`. */
async function entryFiles(files: ProjectFiles): Promise<string[]> {
  const html = await files.read("index.html")
  const named = html && /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i.exec(html)?.[1]

  if (named) {
    return [joinFolder("", named)]
  }

  const found: string[] = []

  for (const base of ["src/main", "src/index"]) {
    const file = await firstOf(
      files,
      scriptExtensions.map((extension) => `${base}${extension}`)
    )

    if (file) {
      found.push(file.path)
    }
  }

  return found
}

/** The modules a file imports by a relative path, in the order it imports them. */
function relativeImports(text: string): string[] {
  const source = ts.createSourceFile("module.tsx", text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)

  return source.statements.flatMap((statement) =>
    ts.isImportDeclaration(statement) &&
    ts.isStringLiteral(statement.moduleSpecifier) &&
    statement.moduleSpecifier.text.startsWith(".")
      ? [statement.moduleSpecifier.text]
      : []
  )
}

/** The file a relative import names: as written, with a script's extension, or its folder's `index`. */
async function resolveModule(files: ProjectFiles, folder: string, specifier: string): Promise<string | undefined> {
  if (!specifier.startsWith(".")) {
    return undefined
  }

  const base = joinFolder(folder, specifier)

  const candidates = [
    base,
    ...scriptExtensions.map((extension) => `${base}${extension}`),
    ...scriptExtensions.map((extension) => `${base}/index${extension}`)
  ]

  for (const candidate of candidates) {
    if (
      scriptExtensions.some((extension) => candidate.endsWith(extension)) &&
      (await files.read(candidate)) !== undefined
    ) {
      return candidate
    }
  }

  return undefined
}

function folderOf(file: string): string {
  return file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ""
}
