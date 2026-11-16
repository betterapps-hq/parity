import ts from "typescript"

/** A route library mode declares, as its route object or `<Route>` element says. */
export interface LibraryRoute {
  /** Its `id`, or the one React Router gives it from where it sits: `0-2-1`. */
  id: string
  /** Its path below its parent's, as written. */
  path?: string
  index: boolean
  /** The component it draws: its `Component`, or the element its `element` makes. */
  component?: string
  /**
   * Where that component comes from: the module it's imported from, as the import writes it, or `lazy`'s module. Absent
   * when it's declared in the same file.
   */
  module?: string
  /** Whether it has a `loader`. */
  loads: boolean
  /** Whether it has `middleware`. */
  guards: boolean
  /** Where it always sends the browser: a `<Navigate to>` as its element, or a loader that always redirects. */
  redirect?: string
  children: LibraryRoute[]
}

/** What library mode declares in a file: its routes, when it declares any, and what in them couldn't be read. */
export interface LibraryRoutes {
  routes?: LibraryRoute[]
  unread: string[]
}

/** The calls that take an array of route objects. */
const routerCalls = new Set([
  "createBrowserRouter",
  "createHashRouter",
  "createMemoryRouter",
  "createStaticRouter",
  "useRoutes"
])

/**
 * The routes library mode declares in a file, read without running it: the route objects given to
 * `createBrowserRouter` (or the hash, memory or static router, or `useRoutes`), and `<Route>` elements in `<Routes>` or
 * `createRoutesFromElements`. Routes built at run time, such as an array made elsewhere or with `map`, are named in
 * `unread`. `routes` is absent when the file declares no routes at all.
 */
export function readLibraryRoutes(text: string, fileName: string): LibraryRoutes {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const imports = importsOf(source)
  const constants = new Map<string, ts.Expression>()
  const unread = new Set<string>()
  let routes: LibraryRoute[] | undefined

  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          constants.set(declaration.name.text, declaration.initializer)
        }
      }
    }
  }

  const describe = (node: ts.Node) => node.getText(source).split("\n")[0]?.slice(0, 80) ?? ""

  const componentOf = (element: ts.Node | undefined): Pick<LibraryRoute, "component" | "module" | "redirect"> => {
    const opened = element && jsxTag(unwrap(element))

    if (!opened || !ts.isIdentifier(opened.tagName)) {
      return {}
    }

    const name = opened.tagName.text

    if (name === "Navigate") {
      const to = jsxAttribute(opened, "to")

      return to && ts.isStringLiteralLike(to) ? { redirect: to.text } : {}
    }

    return withModule(name, imports)
  }

  // What a route draws: its Component, else the module lazy loads, else the element it's given.
  const drawn = (
    component: ts.Node | undefined,
    lazy: ts.Node | undefined,
    element: ts.Node | undefined
  ): Pick<LibraryRoute, "component" | "module" | "redirect"> => {
    if (component && ts.isIdentifier(component)) {
      return withModule(component.text, imports)
    }

    return lazy ? lazyModule(lazy) : componentOf(element)
  }

  // Route objects: { path, index, element, Component, lazy, loader, children }.
  const objectRoutes = (node: ts.Node, at: number[], seen: Set<string>): LibraryRoute[] => {
    const expression = unwrap(node)

    if (ts.isIdentifier(expression) && constants.has(expression.text) && !seen.has(expression.text)) {
      // SAFETY: `has` was just checked.
      return objectRoutes(constants.get(expression.text) as ts.Node, at, new Set([...seen, expression.text]))
    }

    if (!ts.isArrayLiteralExpression(expression)) {
      unread.add(`${fileName} makes its routes with ${describe(expression)}`)

      return []
    }

    return expression.elements.flatMap((element, position) => {
      const object = unwrap(element)

      if (!ts.isObjectLiteralExpression(object)) {
        unread.add(`${fileName} has a route made with ${describe(element)}`)

        return []
      }

      const where = [...at, position]

      const route: LibraryRoute = {
        id: stringProperty(object, "id") ?? where.join("-"),
        index: property(object, "index")?.kind === ts.SyntaxKind.TrueKeyword,
        loads: property(object, "loader") !== undefined,
        guards: property(object, "middleware") !== undefined,
        children: []
      }

      const path = stringProperty(object, "path")

      if (path !== undefined) {
        route.path = path
      }

      const component = property(object, "Component")
      const lazy = property(object, "lazy")

      Object.assign(route, drawn(component, lazy, property(object, "element")))

      const redirect = alwaysRedirects(property(object, "loader"))

      if (redirect !== undefined) {
        route.redirect = redirect
      }

      const children = property(object, "children")

      if (children) {
        route.children = objectRoutes(children, where, seen)
      }

      return [route]
    })
  }

  // <Route> elements: the children of <Routes>, or what createRoutesFromElements is given.
  const elementRoutes = (nodes: readonly ts.Node[], at: number[]): LibraryRoute[] => {
    const routes: LibraryRoute[] = []

    for (const node of nodes) {
      if (ts.isJsxText(node) && node.text.trim() === "") {
        continue
      }

      const opened = jsxTag(unwrap(node))

      if (!opened || !ts.isIdentifier(opened.tagName) || opened.tagName.text !== "Route") {
        if (!ts.isJsxText(node)) {
          unread.add(`${fileName} has a route made with ${describe(node)}`)
        }

        continue
      }

      const where = [...at, routes.length]
      const id = jsxAttribute(opened, "id")
      const path = jsxAttribute(opened, "path")
      const index = jsxAttribute(opened, "index", true)
      const component = jsxAttribute(opened, "Component")

      const route: LibraryRoute = {
        id: id && ts.isStringLiteralLike(id) ? id.text : where.join("-"),
        index: index !== undefined && index.kind !== ts.SyntaxKind.FalseKeyword,
        loads: jsxAttribute(opened, "loader") !== undefined,
        guards: jsxAttribute(opened, "middleware") !== undefined,
        children: []
      }

      if (path && ts.isStringLiteralLike(path)) {
        route.path = path.text
      }

      const lazy = jsxAttribute(opened, "lazy")

      Object.assign(route, drawn(component, lazy, jsxAttribute(opened, "element")))

      const redirect = alwaysRedirects(jsxAttribute(opened, "loader"))

      if (redirect !== undefined) {
        route.redirect = redirect
      }

      const element = unwrap(node)

      if (ts.isJsxElement(element)) {
        route.children = elementRoutes(element.children, where)
      }

      routes.push(route)
    }

    return routes
  }

  const visit = (node: ts.Node): void => {
    if (routes) {
      return
    }

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text
      const argument = node.arguments[0]

      if (routerCalls.has(name) && argument) {
        const inner = unwrap(argument)

        // createBrowserRouter(createRoutesFromElements(<Route …>))
        if (
          ts.isCallExpression(inner) &&
          ts.isIdentifier(inner.expression) &&
          ["createRoutesFromElements", "createRoutesFromChildren"].includes(inner.expression.text) &&
          inner.arguments[0]
        ) {
          routes = elementRoutes([inner.arguments[0]], [])

          return
        }

        routes = objectRoutes(argument, [], new Set())

        return
      }
    }

    if (ts.isJsxElement(node) && ts.isIdentifier(node.openingElement.tagName)) {
      if (node.openingElement.tagName.text === "Routes") {
        routes = elementRoutes(node.children, [])

        return
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)

  return routes === undefined ? { unread: [...unread] } : { routes, unread: [...unread] }
}

/** Where each name a file imports comes from: `Projects` from `./routes/projects`. */
function importsOf(source: ts.SourceFile): Map<string, string> {
  const imports = new Map<string, string>()

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue
    }

    const module = statement.moduleSpecifier.text
    const clause = statement.importClause

    if (clause?.name) {
      imports.set(clause.name.text, module)
    }

    const bindings = clause?.namedBindings

    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, module)
      }
    }
  }

  return imports
}

/** A component's name, with the module it's imported from when it's imported. */
function withModule(name: string, imports: Map<string, string>): Pick<LibraryRoute, "component" | "module"> {
  const module = imports.get(name)

  return module === undefined ? { component: name } : { component: name, module }
}

/** The module `lazy: () => import("./routes/project")` loads. */
function lazyModule(lazy: ts.Node): Pick<LibraryRoute, "module"> {
  let found: string | undefined

  const visit = (node: ts.Node): void => {
    if (
      !found &&
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found = node.arguments[0].text
    }

    ts.forEachChild(node, visit)
  }

  visit(lazy)

  return found === undefined ? {} : { module: found }
}

/**
 * Where a loader always sends the browser: a `redirect("/login")` it throws or returns every time, as its body or its
 * first statement that throws or returns. A redirect behind an `if` runs only sometimes, so it doesn't count.
 */
export function alwaysRedirects(loader: ts.Node | undefined): string | undefined {
  const fn =
    loader &&
    (ts.isArrowFunction(loader) ||
      ts.isFunctionExpression(loader) ||
      ts.isFunctionDeclaration(loader) ||
      ts.isMethodDeclaration(loader))
      ? loader
      : undefined

  const body = fn?.body

  if (!body) {
    return undefined
  }

  let returned: ts.Node | undefined

  if (ts.isBlock(body)) {
    const statement = body.statements.find((each) => ts.isThrowStatement(each) || ts.isReturnStatement(each))

    returned =
      statement && (ts.isThrowStatement(statement) || ts.isReturnStatement(statement))
        ? statement.expression
        : undefined
  } else {
    returned = body
  }

  const call = returned && unwrap(returned)

  if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== "redirect") {
    return undefined
  }

  const to = call.arguments[0]

  return to && ts.isStringLiteralLike(to) ? to.text : undefined
}

/** A property's value in an object literal, or the method itself when it's written as one. */
function property(object: ts.ObjectLiteralExpression, name: string): ts.Node | undefined {
  for (const each of object.properties) {
    const named =
      each.name && (ts.isIdentifier(each.name) || ts.isStringLiteral(each.name)) ? each.name.text : undefined

    if (named !== name) {
      continue
    }

    if (ts.isPropertyAssignment(each)) {
      return unwrap(each.initializer)
    }

    if (ts.isShorthandPropertyAssignment(each)) {
      return each.name
    }

    if (ts.isMethodDeclaration(each)) {
      return each
    }
  }

  return undefined
}

function stringProperty(object: ts.ObjectLiteralExpression, name: string): string | undefined {
  const value = property(object, name)

  return value && ts.isStringLiteralLike(value) ? value.text : undefined
}

/** The opening tag of a JSX element, or the element itself when it closes itself. */
function jsxTag(expression: ts.Node): ts.JsxOpeningElement | ts.JsxSelfClosingElement | undefined {
  if (ts.isJsxElement(expression)) {
    return expression.openingElement
  }

  return ts.isJsxSelfClosingElement(expression) ? expression : undefined
}

/**
 * A JSX attribute's value: the expression inside `{…}`, or the string. An attribute written without a value, as
 * `index`, gives `true` when `bare` is set.
 */
function jsxAttribute(
  tag: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  name: string,
  bare = false
): ts.Node | undefined {
  for (const attribute of tag.attributes.properties) {
    if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name) || attribute.name.text !== name) {
      continue
    }

    const value = attribute.initializer

    if (!value) {
      return bare ? ts.factory.createTrue() : undefined
    }

    if (ts.isStringLiteral(value)) {
      return value
    }

    return ts.isJsxExpression(value) && value.expression ? unwrap(value.expression) : undefined
  }

  return undefined
}

/** An expression without what only TypeScript reads around it: `satisfies`, `as`, `!` and parentheses. */
function unwrap(node: ts.Node): ts.Node {
  if (
    ts.isSatisfiesExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isParenthesizedExpression(node)
  ) {
    return unwrap(node.expression)
  }

  return node
}
