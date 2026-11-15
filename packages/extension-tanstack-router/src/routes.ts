import type { Route } from "@parity-app/extension-api"
import ts from "typescript"
import { z } from "zod"
import { codeRouteTree, readCodeRoutes } from "./code-routes.ts"
import {
  parentRouteName,
  propertyValue,
  resolvePath,
  scriptExtensions,
  segmentsOf,
  stringProperty,
  unwrap
} from "./syntax.ts"

/** The root route's id, as TanStack Router names it. */
const rootId = "__root__"

/** Where TanStack Router's tooling writes the route tree when `tsr.config.json` doesn't say. */
const defaultTree = "src/routeTree.gen.ts"

/** A route as the generated tree declares it, before its full id and path are known. */
interface TreeRoute {
  /** The variable the tree keeps it in, which its children's `getParentRoute` names. */
  variable: string
  /** Its id below its parent's, as the tree writes it: `/billing`, or `/` for an index. */
  id: string
  /** Its path below its parent's: `/billing`, `/` for an index, empty for a layout without a path of its own. */
  path: string
  /** Its parent's variable, or undefined for a route at the top, inside the root route. */
  parent?: string
  /** The module its `Route` is imported from, from the project root, without an extension. */
  module: string
}

/** What a generated route tree declares: the root route's module, and every other route. */
interface RouteTree {
  root?: string
  routes: TreeRoute[]
}

/** A route's module, as the file found for it and that file's text, which is missing when no file was found. */
interface RouteModule {
  file: string
  text?: string
}

/** The part of `tsr.config.json` read here: where the route tree is generated. Other settings pass through. */
const routerConfig = z.looseObject({ generatedRouteTree: z.string().optional() })

/**
 * Every route of a project that uses TanStack Router's file-based routes, each parent before its children (PAR-1073).
 * It reads the route tree the router's tooling generates (`src/routeTree.gen.ts`, or where `tsr.config.json` says),
 * which names each route's id, path, parent and file, then each route's file for what it draws, whether it loads data
 * and whether it guards the page. Without a route tree, the routes the app declares in code with `createRootRoute` and
 * `createRoute` (PAR-1156). Empty when it has neither.
 */
export function readRoutes(read: (path: string) => string | undefined): Route[] {
  const treeFile = routeTreeFile(read("tsr.config.json"))
  const tree = read(treeFile)

  if (tree === undefined) {
    return codeRouteTree(readCodeRoutes(read), (route) => optionsSaid(route.options))
  }

  const { root, routes } = parseRouteTree(tree, treeFile)

  if (!root) {
    return []
  }

  const found: Route[] = []
  const children = Map.groupBy(routes, (route) => route.parent)

  const add = (route: Pick<Route, "id" | "kind" | "path" | "parent" | "index">, module: string) => {
    const { file, text } = resolveModule(module, read)
    found.push({ ...route, segments: segmentsOf(route.path), file, ...routeOptions(text) })
  }

  // Ids and paths in the tree are below the parent's, so each route's full ones are its parent's with its own after.
  const visit = (route: TreeRoute, parent: { id: string; path: string }) => {
    const id = parent.id === rootId ? route.id : joinPath(parent.id, route.id)
    const joined = joinPath(parent.path, route.path)
    const path = joined.length > 1 ? joined.replace(/\/$/, "") : joined
    const inside = children.get(route.variable) ?? []

    add({ id, kind: kindOf(route, inside), path, parent: parent.id, index: route.path.endsWith("/") }, route.module)

    for (const child of inside) {
      visit(child, { id, path })
    }
  }

  add({ id: rootId, kind: "root", path: "/", index: false }, root)

  for (const route of children.get(undefined) ?? []) {
    visit(route, { id: rootId, path: "/" })
  }

  return found
}

/** The route tree's path from the project root, as `tsr.config.json` names it or the router's default. */
function routeTreeFile(config: string | undefined): string {
  if (config === undefined) {
    return defaultTree
  }

  // A config that isn't JSON, or names no route tree, leaves the router at its default too.
  const parsed = routerConfig.safeParse(jsonOf(config))
  const named = parsed.success ? parsed.data.generatedRouteTree : undefined

  return named === undefined ? defaultTree : resolvePath("", named)
}

/**
 * The routes a generated tree declares: each `const …Route = …RouteImport.update({ id, path, getParentRoute })`, with
 * the module its `Route` is imported from, and the root route's module, the import the tree never updates.
 */
function parseRouteTree(text: string, treeFile: string): RouteTree {
  const source = ts.createSourceFile(treeFile, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
  const folder = treeFile.includes("/") ? treeFile.slice(0, treeFile.lastIndexOf("/")) : ""
  const modules = new Map<string, string>()
  const declared: { route: Omit<TreeRoute, "parent">; parentName: string }[] = []

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      for (const name of importedNames(statement)) {
        modules.set(name, resolvePath(folder, statement.moduleSpecifier.text))
      }
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const update = declaration.initializer && updateCall(declaration.initializer)

        if (!update || !ts.isIdentifier(declaration.name)) {
          continue
        }

        const module = modules.get(update.imported)
        const options = update.options
        const id = stringProperty(options, "id")
        const parentName = parentRouteName(options)

        if (module === undefined || id === undefined || parentName === undefined) {
          continue
        }

        declared.push({
          route: { variable: declaration.name.text, id, path: stringProperty(options, "path") ?? "", module },
          parentName
        })
      }
    }
  }

  // A route's parent is another route's variable, or for the routes at the top, the root route's import.
  const variables = new Set(declared.map((each) => each.route.variable))
  const rootName = declared.find((each) => !variables.has(each.parentName))?.parentName
  const root = rootName === undefined ? undefined : modules.get(rootName)

  const tree: RouteTree = {
    routes: declared.map(({ route, parentName }) =>
      variables.has(parentName) ? { ...route, parent: parentName } : route
    )
  }

  if (root !== undefined) {
    tree.root = root
  }

  return tree
}

/** The names an import binds, such as `PricingRouteImport` in `import { Route as PricingRouteImport } from …`. */
function importedNames(statement: ts.ImportDeclaration): string[] {
  const bindings = statement.importClause?.namedBindings

  return bindings && ts.isNamedImports(bindings) ? bindings.elements.map((element) => element.name.text) : []
}

/** The `X.update({…})` call an initializer is or starts with, as `.update({…}).lazy(…)` does for a lazy route. */
function updateCall(expression: ts.Expression): { imported: string; options: ts.ObjectLiteralExpression } | undefined {
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return undefined
  }

  const callee = expression.expression
  const argument = expression.arguments[0] && unwrap(expression.arguments[0])

  if (callee.name.text === "update" && ts.isIdentifier(callee.expression) && argument) {
    return ts.isObjectLiteralExpression(argument) ? { imported: callee.expression.text, options: argument } : undefined
  }

  return updateCall(callee.expression)
}

/** A module's file and text: the first of its extensions that's there, else `.tsx`, with no text. */
function resolveModule(module: string, read: (path: string) => string | undefined): RouteModule {
  for (const extension of scriptExtensions) {
    const file = `${module}${extension}`
    const text = read(file)

    if (text !== undefined) {
      return { file, text }
    }
  }

  return { file: `${module}.tsx` }
}

/** Two paths joined with one slash between them, keeping the second's trailing slash. */
function joinPath(parent: string, own: string): string {
  if (own === "") {
    return parent
  }

  return `${parent.replace(/\/$/, "")}/${own.replace(/^\//, "")}`
}

/**
 * A route's kind in Parity's terms: a route with routes inside it is a layout, or a group when it has no path of its
 * own, as a pathless `_auth` layout; one without is a page.
 */
function kindOf(route: TreeRoute, inside: readonly TreeRoute[]): Route["kind"] {
  if (inside.length === 0) {
    return "page"
  }

  return route.path === "" ? "group" : "layout"
}

/**
 * What a route's file says of it, from the options of `export const Route = createFileRoute(…)({…})` or
 * `createRootRoute({…})`: the component it names, whether it has a `loader` or a `beforeLoad`, and where it always
 * redirects (see `alwaysRedirects`).
 */
function routeOptions(text: string | undefined): Pick<Route, "component" | "loads" | "guards" | "redirect"> {
  const options = text === undefined ? undefined : exportedRouteOptions(text)
  const said: Pick<Route, "component" | "loads" | "guards" | "redirect"> = optionsSaid(options)
  const component = options && propertyValue(options, "component")

  if (component && ts.isIdentifier(component)) {
    said.component = component.text
  }

  return said
}

/**
 * What a route's options say of it, as `createFileRoute(…)({…})` or `createRoute({…})` take them: whether it has a
 * `loader` or a `beforeLoad`, and where it always redirects (see `alwaysRedirects`).
 */
function optionsSaid(options: ts.ObjectLiteralExpression | undefined): Pick<Route, "loads" | "guards" | "redirect"> {
  if (!options) {
    return { loads: false, guards: false }
  }

  const said: Pick<Route, "loads" | "guards" | "redirect"> = {
    loads: propertyValue(options, "loader") !== undefined,
    guards: propertyValue(options, "beforeLoad") !== undefined
  }

  const redirect =
    alwaysRedirects(propertyValue(options, "beforeLoad")) ?? alwaysRedirects(propertyValue(options, "loader"))

  if (redirect !== undefined) {
    said.redirect = redirect
  }

  return said
}

/**
 * Where a `beforeLoad` or `loader` always sends the browser: the path of a `throw redirect({ to: "/settings/profile" })`
 * that runs every time, as the function's body or one of its own statements, not inside an `if` or a callback. A
 * redirect that runs only sometimes, as a sign-in guard's does, can only be seen by opening the page.
 */
function alwaysRedirects(option: ts.Node | undefined): string | undefined {
  const body =
    option && (ts.isArrowFunction(option) || ts.isFunctionExpression(option) || ts.isMethodDeclaration(option))
      ? option.body
      : undefined

  if (!body) {
    return undefined
  }

  const statements = ts.isBlock(body) ? body.statements : []
  const thrown = statements.find((statement) => ts.isThrowStatement(statement) || ts.isReturnStatement(statement))

  if (!thrown || !ts.isThrowStatement(thrown)) {
    return undefined
  }

  const call = unwrap(thrown.expression)
  const argument = ts.isCallExpression(call) && call.arguments[0] ? unwrap(call.arguments[0]) : undefined

  return ts.isCallExpression(call) &&
    ts.isIdentifier(call.expression) &&
    call.expression.text === "redirect" &&
    argument &&
    ts.isObjectLiteralExpression(argument)
    ? stringProperty(argument, "to")
    : undefined
}

/** The options object of the call `export const Route = …` ends with. */
function exportedRouteOptions(text: string): ts.ObjectLiteralExpression | undefined {
  const source = ts.createSourceFile("route.tsx", text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)

  for (const statement of source.statements) {
    const exported = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      : false

    if (!exported || !ts.isVariableStatement(statement)) {
      continue
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "Route" || !declaration.initializer) {
        continue
      }

      const call = unwrap(declaration.initializer)
      const argument = ts.isCallExpression(call) && call.arguments[0] ? unwrap(call.arguments[0]) : undefined

      return argument && ts.isObjectLiteralExpression(argument) ? argument : undefined
    }
  }

  return undefined
}

/** A file's text as JSON, or nothing when it isn't JSON. */
// oxlint-disable-next-line anti-slop/no-unknown-returns -- a config file can hold anything; its schema reads it
function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
