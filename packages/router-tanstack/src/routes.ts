import type { ProjectRoute } from "@parity-app/core"
import { checkData, jsonText } from "@parity-app/core/schema"
import ts from "typescript"
import { z } from "zod"

/** The root route's id, as TanStack Router names it. */
const rootId = "__root__"

/** Where TanStack Router's tooling writes the route tree when `tsr.config.json` doesn't say. */
const defaultTree = "src/routeTree.gen.ts"

/** The extensions an import without one may leave off, tried in this order. */
const scriptExtensions = [".tsx", ".ts", ".jsx", ".js"]

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
const routerConfig = jsonText(z.looseObject({ generatedRouteTree: z.string().optional() }))

/**
 * Every route of a project that uses TanStack Router's file-based routes, each parent before its children (PAR-1073).
 * It reads the route tree the router's tooling generates (`src/routeTree.gen.ts`, or where `tsr.config.json` says),
 * which names each route's id, path, parent and file, then each route's file for what it draws, whether it loads data
 * and whether it guards the page. Empty without a route tree.
 */
export function readRoutes(read: (path: string) => string | undefined): ProjectRoute[] {
  const treeFile = routeTreeFile(read("tsr.config.json"))
  const tree = read(treeFile)

  if (tree === undefined) {
    return []
  }

  const { root, routes } = parseRouteTree(tree, treeFile)

  if (!root) {
    return []
  }

  const found: ProjectRoute[] = []
  const children = Map.groupBy(routes, (route) => route.parent)

  const add = (route: Omit<ProjectRoute, "file" | "params" | "component" | "loads" | "guards">, module: string) => {
    const { file, text } = resolveModule(module, read)
    found.push({ ...route, file, params: paramsOf(route.path), ...routeOptions(text) })
  }

  // Ids and paths in the tree are below the parent's, so each route's full ones are its parent's with its own after.
  const visit = (route: TreeRoute, parent: { id: string; path: string }) => {
    const id = parent.id === rootId ? route.id : joinPath(parent.id, route.id)
    const joined = joinPath(parent.path, route.path)
    const path = joined.length > 1 ? joined.replace(/\/$/, "") : joined

    add({ id, path, parent: parent.id, index: route.path.endsWith("/") }, route.module)

    for (const child of children.get(route.variable) ?? []) {
      visit(child, { id, path })
    }
  }

  add({ id: rootId, path: "/", index: false }, root)

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
  const parsed = checkData(routerConfig, config)
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

/**
 * A relative path resolved against a folder, both from the project root with forward slashes: `./routes/pricing` in
 * `src` is `src/routes/pricing`, and `..` steps up a folder.
 */
function resolvePath(folder: string, relative: string): string {
  const parts: string[] = folder === "" ? [] : folder.split("/")

  for (const part of relative.split("/")) {
    if (part === "..") {
      parts.pop()
    } else if (part !== "." && part !== "") {
      parts.push(part)
    }
  }

  return parts.join("/")
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

/** An expression without the `as any` or parentheses around it. */
function unwrap(expression: ts.Expression): ts.Expression {
  return ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression)
    ? unwrap(expression.expression)
    : expression
}

/** A property's value when it's a string, as `id: '/pricing'`. */
function stringProperty(object: ts.ObjectLiteralExpression, name: string): string | undefined {
  const value = propertyValue(object, name)

  return value && ts.isStringLiteralLike(value) ? value.text : undefined
}

/** The variable `getParentRoute: () => SettingsRoute` names. */
function parentRouteName(object: ts.ObjectLiteralExpression): string | undefined {
  const value = propertyValue(object, "getParentRoute")

  if (!value || !ts.isArrowFunction(value) || ts.isBlock(value.body)) {
    return undefined
  }

  const body = unwrap(value.body)

  return ts.isIdentifier(body) ? body.text : undefined
}

/** A property's value in an object literal, by its name, or the method itself when it's written as one. */
function propertyValue(object: ts.ObjectLiteralExpression, name: string): ts.Node | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === name) {
      return property.initializer
    }

    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      return property.name
    }

    if (ts.isMethodDeclaration(property) && propertyName(property.name) === name) {
      return property
    }
  }

  return undefined
}

/** A property's name when it's written plainly or as a string. */
function propertyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined
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

/** The params a path takes: `$projectId` is `projectId`, and a lone `$`, the rest of the URL, is `_splat`. */
function paramsOf(path: string): string[] {
  return path.split("/").flatMap((segment) => {
    if (segment === "$") {
      return ["_splat"]
    }

    const param = /\$([A-Za-z_]\w*)/.exec(segment)

    return param?.[1] ? [param[1]] : []
  })
}

/**
 * What a route's file says of it, from the options of `export const Route = createFileRoute(…)({…})` or
 * `createRootRoute({…})`: the component it names, and whether it has a `loader` or a `beforeLoad`.
 */
function routeOptions(text: string | undefined): Pick<ProjectRoute, "component" | "loads" | "guards"> {
  const options = text === undefined ? undefined : exportedRouteOptions(text)

  if (!options) {
    return { loads: false, guards: false }
  }

  const said: Pick<ProjectRoute, "component" | "loads" | "guards"> = {
    loads: propertyValue(options, "loader") !== undefined,
    guards: propertyValue(options, "beforeLoad") !== undefined
  }

  const component = propertyValue(options, "component")

  if (component && ts.isIdentifier(component)) {
    said.component = component.text
  }

  return said
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
