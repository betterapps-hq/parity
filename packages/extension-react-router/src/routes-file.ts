import ts from "typescript"
import { type ConfigRoute, routeIdOf } from "./config.ts"

/** A route config entry as `route()`, `index()` and `layout()` make it, before ids are given. */
interface Entry {
  id?: string
  file: string
  path?: string
  index?: boolean
  children?: Entry[]
}

/** What reading `routes.ts` gives: its routes, and what in it couldn't be read without running it. */
export interface RoutesFile {
  routes: ConfigRoute[]
  /** Each part left out, as a sentence: "routes.ts builds its routes with remixRoutesOptionAdapter". */
  unread: string[]
}

/** Makes the routes `flatRoutes({ rootDirectory, ignoredRouteFiles })` gives, from the app's folder. */
export type FlatRoutesReader = (rootDirectory: string) => Promise<ConfigRoute[]>

/** The helpers `@react-router/dev/routes` exports that make route config entries. */
type Helper = "route" | "index" | "layout" | "prefix" | "flatRoutes"

/** The value of an expression while it's read: entries, a string, an options object, or nothing that can be read. */
type Value =
  | { kind: "entries"; entries: Entry[] }
  | { kind: "entry"; entry: Entry }
  | { kind: "string"; text: string }
  | { kind: "options"; id?: string; rootDirectory?: string }
  | { kind: "null" }
  | { kind: "unknown" }

/**
 * The routes framework mode's `app/routes.ts` declares, read from its code without running it: arrays of `route`,
 * `index`, `layout` and `prefix` calls, spread arrays, constants declared in the file, and `flatRoutes()` from
 * `@react-router/fs-routes`, which `flatRoutesOf` lists the files for. Anything else is left out and named in
 * `unread`.
 */
export async function readRoutesFile(
  text: string,
  fileName: string,
  flatRoutesOf: FlatRoutesReader
): Promise<RoutesFile> {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const helpers = new Map<string, Helper>()
  const namespaces = new Map<string, "dev" | "fs">()
  const constants = new Map<string, ts.Expression>()
  const unread = new Set<string>()
  let exported: ts.Expression | undefined

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      readImport(statement, statement.moduleSpecifier.text, helpers, namespaces)
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          constants.set(declaration.name.text, declaration.initializer)
        }
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      exported = statement.expression
    }
  }

  if (!exported) {
    return { routes: [], unread: [`${fileName} has no default export of routes`] }
  }

  const helperOf = (callee: ts.Expression): Helper | undefined => {
    if (ts.isIdentifier(callee)) {
      return helpers.get(callee.text)
    }

    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
      const namespace = namespaces.get(callee.expression.text)
      const name = callee.name.text

      if (namespace === "dev" && isDevHelper(name)) {
        return name
      }

      if (namespace === "fs" && name === "flatRoutes") {
        return "flatRoutes"
      }
    }

    return undefined
  }

  const describe = (node: ts.Node) => node.getText(source).split("\n")[0]?.slice(0, 80) ?? ""

  const evaluate = async (node: ts.Expression, seen: Set<string>): Promise<Value> => {
    const expression = unwrap(node)

    if (ts.isStringLiteralLike(expression)) {
      return { kind: "string", text: expression.text }
    }

    if (expression.kind === ts.SyntaxKind.NullKeyword) {
      return { kind: "null" }
    }

    if (ts.isIdentifier(expression)) {
      const constant = constants.get(expression.text)

      if (constant && !seen.has(expression.text)) {
        return evaluate(constant, new Set([...seen, expression.text]))
      }

      unread.add(`${fileName} uses ${expression.text}, which isn't declared in it`)

      return { kind: "unknown" }
    }

    if (ts.isArrayLiteralExpression(expression)) {
      const entries: Entry[] = []

      for (const element of expression.elements) {
        const value = ts.isSpreadElement(element)
          ? await evaluate(element.expression, seen)
          : await evaluate(element, seen)

        if (value.kind === "entries") {
          entries.push(...value.entries)
        } else if (value.kind === "entry") {
          entries.push(value.entry)
        }
      }

      return { kind: "entries", entries }
    }

    if (ts.isObjectLiteralExpression(expression)) {
      return objectValue(expression)
    }

    if (ts.isCallExpression(expression)) {
      const helper = helperOf(expression.expression)

      if (!helper) {
        unread.add(`${fileName} builds routes with ${describe(expression.expression)}`)

        return { kind: "unknown" }
      }

      const args = await Promise.all(expression.arguments.map((argument) => evaluate(argument, seen)))

      return callHelper(helper, args, flatRoutesOf, () => unread.add(`${fileName} calls ${describe(expression)}`))
    }

    unread.add(`${fileName} builds routes with ${describe(expression)}`)

    return { kind: "unknown" }
  }

  const value = await evaluate(exported, new Set())

  return { routes: entriesOf(value).map(withIds), unread: [...unread] }
}

/** The modules React Router's route helpers come from. */
const helperModules = new Map<string, "dev" | "fs">([
  ["@react-router/dev/routes", "dev"],
  ["@react-router/fs-routes", "fs"]
])

/** The names an import of React Router's route helpers binds, plain or as a namespace. */
function readImport(
  statement: ts.ImportDeclaration,
  module: string,
  helpers: Map<string, Helper>,
  namespaces: Map<string, "dev" | "fs">
): void {
  const from = helperModules.get(module)
  const bindings = statement.importClause?.namedBindings

  if (!from || !bindings) {
    return
  }

  if (ts.isNamespaceImport(bindings)) {
    namespaces.set(bindings.name.text, from)

    return
  }

  for (const element of bindings.elements) {
    const imported = (element.propertyName ?? element.name).text

    if (from === "dev" && isDevHelper(imported)) {
      helpers.set(element.name.text, imported)
    } else if (from === "fs" && imported === "flatRoutes") {
      helpers.set(element.name.text, "flatRoutes")
    }
  }
}

function isDevHelper(name: string): name is "route" | "index" | "layout" | "prefix" {
  return name === "route" || name === "index" || name === "layout" || name === "prefix"
}

/** What a call to one of React Router's helpers gives, as the helper itself would. */
async function callHelper(
  helper: Helper,
  args: Value[],
  flatRoutesOf: FlatRoutesReader,
  cantRead: () => void
): Promise<Value> {
  const [first, second, third] = args

  if (helper === "flatRoutes") {
    const rootDirectory = first?.kind === "options" ? (first.rootDirectory ?? "routes") : "routes"

    return { kind: "entries", entries: (await flatRoutesOf(rootDirectory)).map(fromConfig) }
  }

  if (helper === "index") {
    if (first?.kind !== "string") {
      cantRead()

      return { kind: "unknown" }
    }

    return { kind: "entry", entry: withId({ file: first.text, index: true }, second) }
  }

  if (helper === "layout") {
    if (first?.kind !== "string") {
      cantRead()

      return { kind: "unknown" }
    }

    const children = childrenOf(second, third)
    const entry = withId({ file: first.text }, second)

    return { kind: "entry", entry: children ? { ...entry, children } : entry }
  }

  if (helper === "prefix") {
    if (first?.kind !== "string" || second?.kind !== "entries") {
      cantRead()

      return { kind: "unknown" }
    }

    return { kind: "entries", entries: prefixed(first.text, second.entries) }
  }

  // route(path, file, options or children, children)
  const path = first?.kind === "string" ? first.text : undefined

  if ((path === undefined && first?.kind !== "null") || second?.kind !== "string") {
    cantRead()

    return { kind: "unknown" }
  }

  const children = childrenOf(third, args[3])
  const entry = withId(path === undefined ? { file: second.text } : { file: second.text, path }, third)

  return { kind: "entry", entry: children ? { ...entry, children } : entry }
}

/** The entries a value holds: an array's, or one entry's. */
function entriesOf(value: Value): Entry[] {
  if (value.kind === "entries") {
    return value.entries
  }

  return value.kind === "entry" ? [value.entry] : []
}

/** The children a helper is given: its options-or-children argument when that's an array, else the one after it. */
function childrenOf(optionsOrChildren: Value | undefined, children: Value | undefined): Entry[] | undefined {
  if (optionsOrChildren?.kind === "entries") {
    return optionsOrChildren.entries
  }

  return children?.kind === "entries" ? children.entries : undefined
}

/** An entry with the `id` its options give. */
function withId(entry: Entry, options: Value | undefined): Entry {
  return options?.kind === "options" && options.id !== undefined ? { ...entry, id: options.id } : entry
}

/** The options of `route`, `index`, `layout` or `flatRoutes`, from an object literal. */
function objectValue(object: ts.ObjectLiteralExpression): Value {
  const options: Value = { kind: "options" }

  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) {
      continue
    }

    const value = unwrap(property.initializer)

    if (!ts.isStringLiteralLike(value)) {
      continue
    }

    if (property.name.text === "id") {
      options.id = value.text
    } else if (property.name.text === "rootDirectory") {
      options.rootDirectory = value.text
    }
  }

  return options
}

/** Entries under a path, as `prefix` puts them: each with a path, or an index, gets the prefix before it. */
function prefixed(prefix: string, entries: Entry[]): Entry[] {
  return entries.map((entry) => {
    if (entry.index || entry.path !== undefined) {
      return { ...entry, path: entry.path ? joinRoutePaths(prefix, entry.path) : prefix }
    }

    return entry.children ? { ...entry, children: prefixed(prefix, entry.children) } : entry
  })
}

/** Two route paths joined with one slash, as React Router's `joinRoutePaths` does. */
function joinRoutePaths(first: string, second: string): string {
  return `${first.replace(/\/+$/, "")}/${second.replace(/^\/+/, "")}`
}

/** An entry with its id, and its children's: the one its options gave, or its file's without the extension. */
function withIds(entry: Entry): ConfigRoute {
  const route: ConfigRoute = {
    id: entry.id ?? routeIdOf(entry.file),
    file: entry.file,
    index: entry.index ?? false,
    children: (entry.children ?? []).map(withIds)
  }

  if (entry.path !== undefined) {
    route.path = entry.path
  }

  return route
}

/** A route `flatRoutes` gave, as an entry, so `prefix` can take it. */
function fromConfig(route: ConfigRoute): Entry {
  const entry: Entry = { id: route.id, file: route.file, children: route.children.map(fromConfig) }

  if (route.index) {
    entry.index = true
  }

  if (route.path !== undefined) {
    entry.path = route.path
  }

  return entry
}

/** An expression without what only TypeScript reads around it: `satisfies`, `as`, `!`, parentheses and `await`. */
function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isSatisfiesExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isAwaitExpression(expression)
  ) {
    return unwrap(expression.expression)
  }

  return expression
}
