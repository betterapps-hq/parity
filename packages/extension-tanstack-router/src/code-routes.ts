import type { Route } from "@parity-app/extension-api"
import ts from "typescript"
import {
  constantsOf,
  folderOf,
  parentRouteName,
  propertyValue,
  resolvePath,
  routeChain,
  scriptExtensions,
  segmentsOf,
  serverOnly,
  stringProperty,
  unwrap
} from "./syntax.ts"

/*
 * TanStack Router's code-based routes (PAR-1156): routes the app declares itself with `createRootRoute` and
 * `createRoute`, each naming its parent with `getParentRoute`, rather than in files its tooling turns into a route tree.
 * They're read without running the app, from its entry and the files that imports by relative paths.
 */

/** The root route's id, as TanStack Router names it. */
const rootId = "__root__"

/** How many files are read looking for routes, so an app that imports a great deal stops somewhere. */
const fileLimit = 400

/** A route as its file declares it, before its full id and path are known. */
export interface CodeRoute {
  /** The file and variable it's kept in, as `src/router.tsx#homeRoute`. */
  key: string
  /** Its parent's key, or undefined for the root route. */
  parent?: string
  root: boolean
  /** Its `path` as written, below its parent's. */
  path?: string
  /** Its `id`, for a route without a path: a layout that adds nothing to the URL. */
  id?: string
  /** The file it's declared in. */
  file: string
  /** The component its `component` names, and the file that's imported from, when it's imported. */
  component?: { name: string; file?: string }
  options: ts.ObjectLiteralExpression | undefined
  /** Whether it only answers requests on the server, as a TanStack Start server route does (PAR-1173). */
  serverOnly: boolean
}

/** A name a file imports from a relative path: the specifier, and the export's name, `default` for a default. */
interface Imported {
  specifier: string
  name: string
}

/**
 * The routes an app declares in code, in the order its files are read and declare them, from its entry: the module script
 * `index.html` loads, else `src/main` or `src/index`, and the files they import by relative paths, nearest first. Empty
 * when none of them makes a root route.
 */
export function readCodeRoutes(read: (path: string) => string | undefined): CodeRoute[] {
  const queue = entryFiles(read)
  const visited = new Set<string>()
  const routes: CodeRoute[] = []

  while (queue.length > 0 && visited.size < fileLimit) {
    const file = queue.shift()

    if (file === undefined || visited.has(file)) {
      continue
    }

    visited.add(file)
    const text = read(file)

    if (text === undefined) {
      continue
    }

    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
    const imports = importsOf(source)
    const constants = constantsOf(source)
    const resolve = (specifier: string) => resolveModule(read, folderOf(file), specifier)

    // The route a name in this file stands for, by its key: one of the file's own, or one it imports.
    const keyOf = (name: string) => {
      const imported = imports.get(name)

      if (!imported) {
        return `${file}#${name}`
      }

      const from = resolve(imported.specifier)

      return from === undefined ? undefined : `${from}#${imported.name}`
    }

    for (const declaration of variableDeclarations(source)) {
      const made = routeCall(declaration.initializer, constants)

      if (made) {
        const route = codeRoute(made, `${file}#${declaration.name}`, file, keyOf, (name) => {
          const imported = imports.get(name)

          return imported && resolve(imported.specifier)
        })

        if (route) {
          routes.push(route)
        }
      }
    }

    for (const { specifier } of imports.values()) {
      const resolved = resolve(specifier)

      if (resolved !== undefined && !visited.has(resolved) && !queue.includes(resolved)) {
        queue.push(resolved)
      }
    }
  }

  return routes.some((route) => route.root) ? routes : []
}

/** A route a call makes, with its parent's key and its component's file, or nothing when its parent can't be found. */
function codeRoute(
  made: { root: boolean; options: ts.ObjectLiteralExpression | undefined; serverOnly: boolean },
  key: string,
  file: string,
  keyOf: (name: string) => string | undefined,
  fileOf: (name: string) => string | undefined
): CodeRoute | undefined {
  const { options } = made
  const route: CodeRoute = { key, root: made.root, file, options, serverOnly: made.serverOnly }

  if (!made.root) {
    const parent = options && parentRouteName(options)
    const parentKey = parent === undefined ? undefined : keyOf(parent)

    if (parentKey === undefined) {
      return undefined
    }

    route.parent = parentKey
  }

  const path = options && stringProperty(options, "path")
  const id = options && stringProperty(options, "id")

  if (path !== undefined) {
    route.path = path
  } else if (id !== undefined) {
    route.id = id
  }

  const component = options && propertyValue(options, "component")

  if (component && ts.isIdentifier(component)) {
    const from = fileOf(component.text)
    route.component = from === undefined ? { name: component.text } : { name: component.text, file: from }
  }

  return route
}

/**
 * Code-based routes in Parity's terms, each parent before its children: the root first, then each route at its full
 * path below its parent's, with TanStack Router's ids (its full path, an index's with a slash after, and a pathless
 * route's its own `id` below its parent's). A route's file is the one its component comes from, else its own.
 */
export function codeRouteTree(
  declared: readonly CodeRoute[],
  said: (route: CodeRoute) => Pick<Route, "loads" | "guards" | "redirect">,
  placed?: (route: CodeRoute, id: string) => void
): Route[] {
  const root = declared.find((route) => route.root)

  if (!root) {
    return []
  }

  const children = Map.groupBy(
    declared.filter((route) => !route.root),
    (route) => route.parent
  )

  const found: Route[] = []
  const added = new Set<string>()

  const add = (route: CodeRoute, fields: Pick<Route, "id" | "kind" | "path" | "index"> & { parent?: string }) => {
    const made: Route = {
      ...fields,
      segments: segmentsOf(fields.path),
      file: route.component?.file ?? route.file,
      ...said(route)
    }

    if (route.component) {
      made.component = route.component.name
    }

    found.push(made)
    added.add(route.key)
    placed?.(route, made.id)
  }

  const visit = (route: CodeRoute, parent: { id: string; path: string }) => {
    // A route whose parent is itself, through others, is placed once.
    if (added.has(route.key)) {
      return
    }

    const inside = children.get(route.key) ?? []
    const own = route.path?.replace(/^\//, "")
    const path = own === undefined ? parent.path : fullPath(parent.path, own)
    const index = own === ""
    const id = routeId(parent.id, own === undefined ? (route.id ?? route.key) : undefined, index, path)
    add(route, { id, kind: kindOf(own, inside.length > 0), path, parent: parent.id, index })

    for (const child of inside) {
      visit(child, { id, path })
    }
  }

  add(root, { id: rootId, kind: "root", path: "/", index: false })

  for (const route of children.get(root.key) ?? []) {
    visit(route, { id: rootId, path: "/" })
  }

  return found
}

/**
 * A route's id, as TanStack Router gives it: a pathless route's own `id` below its parent's, an index's its parent's
 * with a slash after, and any other route's its full path.
 */
function routeId(parent: string, pathless: string | undefined, index: boolean, path: string): string {
  const base = parent === rootId ? "" : parent.replace(/\/$/, "")

  if (pathless !== undefined) {
    return `${base}/${pathless.replace(/^\//, "")}`
  }

  return index ? `${base}/` : path
}

/** A route with routes inside is a layout, or a group when it has no path; one without is a page. */
function kindOf(own: string | undefined, parent: boolean): Route["kind"] {
  if (!parent) {
    return "page"
  }

  return own === undefined ? "group" : "layout"
}

/** A route's full path: its own below its parent's, without a slash at the end unless it's the root's. */
function fullPath(parent: string, own: string): string {
  const joined = own === "" ? parent : `${parent.replace(/\/$/, "")}/${own}`

  return joined.length > 1 ? joined.replace(/\/$/, "") : joined
}

/**
 * The calls that make a route: the root's, with or without context, and every other's, through what's chained after,
 * as `.update(…)` or `.lazy(…)`, with whether it only answers requests on the server.
 */
function routeCall(
  expression: ts.Expression,
  constants: ReadonlyMap<string, ts.Expression>
): { root: boolean; options: ts.ObjectLiteralExpression | undefined; serverOnly: boolean } | undefined {
  const chain = routeChain(expression)

  if (!chain) {
    return undefined
  }

  const callee = unwrap(chain.call.expression)
  const argument = chain.call.arguments[0] && unwrap(chain.call.arguments[0])
  const options = argument && ts.isObjectLiteralExpression(argument) ? argument : undefined
  const made = { options, serverOnly: serverOnly(chain, constants) }

  if (ts.isIdentifier(callee) && (callee.text === "createRootRoute" || callee.text === "createRoute")) {
    return { ...made, root: callee.text === "createRootRoute" }
  }

  // `createRootRouteWithContext<Context>()({…})`.
  if (
    ts.isCallExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "createRootRouteWithContext"
  ) {
    return { ...made, root: true }
  }

  return undefined
}

/** Every variable a file declares at its top with a value, by name. */
function variableDeclarations(source: ts.SourceFile): { name: string; initializer: ts.Expression }[] {
  return source.statements.flatMap((statement) =>
    ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.flatMap((declaration) =>
          ts.isIdentifier(declaration.name) && declaration.initializer
            ? [{ name: declaration.name.text, initializer: declaration.initializer }]
            : []
        )
      : []
  )
}

/**
 * The names a file imports from relative paths, as `homeRoute` in `import { homeRoute } from "./home"`, and the files
 * it imports only for what they do, under their specifier in parentheses, so they're read too.
 */
function importsOf(source: ts.SourceFile): Map<string, Imported> {
  const imports = new Map<string, Imported>()

  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !statement.moduleSpecifier.text.startsWith(".")
    ) {
      continue
    }

    const specifier = statement.moduleSpecifier.text
    const clause = statement.importClause

    if (!clause) {
      imports.set(`(${specifier})`, { specifier, name: "" })
      continue
    }

    if (clause.name) {
      imports.set(clause.name.text, { specifier, name: "default" })
    }

    const bindings = clause.namedBindings

    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, { specifier, name: (element.propertyName ?? element.name).text })
      }
    }
  }

  return imports
}

/** The app's entry: the module script `index.html` loads, else `src/main` or `src/index`. */
function entryFiles(read: (path: string) => string | undefined): string[] {
  const html = read("index.html")
  const named = html && /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i.exec(html)?.[1]

  if (named) {
    return [resolvePath("", named)]
  }

  return ["src/main", "src/index"].flatMap((base) => {
    const file = scriptExtensions.map((extension) => `${base}${extension}`).find((each) => read(each) !== undefined)

    return file === undefined ? [] : [file]
  })
}

/** The file a relative import names: as written, with a script's extension, or its folder's `index`. */
function resolveModule(
  read: (path: string) => string | undefined,
  folder: string,
  specifier: string
): string | undefined {
  const base = resolvePath(folder, specifier)

  const candidates = [
    base,
    ...scriptExtensions.map((extension) => `${base}${extension}`),
    ...scriptExtensions.map((extension) => `${base}/index${extension}`)
  ]

  return candidates.find(
    (candidate) => scriptExtensions.some((extension) => candidate.endsWith(extension)) && read(candidate) !== undefined
  )
}
