import type { Route, RouteSegment } from "@parity-app/extension"
import ts from "typescript"

/** The extensions an import without one may leave off, tried in this order. */
export const scriptExtensions = [".tsx", ".ts", ".jsx", ".js"]

/**
 * A path's parts in Parity's terms: `$projectId` is a param named `projectId`, and a lone `$`, the rest of the URL, is a
 * catch-all named `_splat`, as the router names it among a route's params. Anything else matches itself.
 */
export function segmentsOf(path: string): RouteSegment[] {
  return path
    .split("/")
    .filter((part) => part !== "")
    .map((part): RouteSegment => {
      if (part === "$") {
        return { type: "catchAll", name: "_splat" }
      }

      const param = /^\$([A-Za-z_]\w*)$/.exec(part)

      return param?.[1] ? { type: "param", name: param[1] } : { type: "static", value: part }
    })
}

/**
 * A relative path resolved against a folder, both from the project root with forward slashes: `./routes/pricing` in
 * `src` is `src/routes/pricing`, and `..` steps up a folder.
 */
export function resolvePath(folder: string, relative: string): string {
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

/** The folder a file is in, from the project root. */
export function folderOf(file: string): string {
  return file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : ""
}

/** An expression without the `as`, `satisfies`, `!` or parentheses around it. */
export function unwrap(expression: ts.Expression): ts.Expression {
  return ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression)
    ? unwrap(expression.expression)
    : expression
}

/** A property's value when it's a string, as `id: '/pricing'`. */
export function stringProperty(object: ts.ObjectLiteralExpression, name: string): string | undefined {
  const value = propertyValue(object, name)

  return value && ts.isStringLiteralLike(value) ? value.text : undefined
}

/** The variable `getParentRoute: () => SettingsRoute` names. */
export function parentRouteName(object: ts.ObjectLiteralExpression): string | undefined {
  const value = propertyValue(object, "getParentRoute")

  if (!value || !ts.isArrowFunction(value) || ts.isBlock(value.body)) {
    return undefined
  }

  const body = unwrap(value.body)

  return ts.isIdentifier(body) ? body.text : undefined
}

/** A property's value in an object literal, by its name, or the method itself when it's written as one. */
export function propertyValue(object: ts.ObjectLiteralExpression, name: string): ts.Node | undefined {
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

/** The call that makes a route, and what's chained after it. */
export interface RouteChain {
  /** `createRoute(…)`, `createRootRoute(…)`, `createFileRoute("/x")(…)` and the like. */
  call: ts.CallExpression
  /** The options given to it, then to each `.update(…)` chained after it. */
  parts: ts.Expression[]
  /** Whether anything else is chained after it, as `.lazy(…)`, which may give the route what its options don't. */
  opaque: boolean
}

/**
 * The call that makes a route, through what's chained after it, as `createRoute({…}).update({…}).lazy(…)`. Nothing for
 * `addChildren`, which makes a tree of routes declared elsewhere.
 */
export function routeChain(expression: ts.Expression): RouteChain | undefined {
  const call = unwrap(expression)

  if (!ts.isCallExpression(call)) {
    return undefined
  }

  const callee = unwrap(call.expression)

  if (!ts.isPropertyAccessExpression(callee)) {
    return { call, parts: call.arguments[0] ? [call.arguments[0]] : [], opaque: false }
  }

  const inner = callee.name.text === "addChildren" ? undefined : routeChain(callee.expression)

  if (!inner) {
    return undefined
  }

  if (callee.name.text !== "update") {
    return { ...inner, opaque: true }
  }

  return call.arguments[0] ? { ...inner, parts: [...inner.parts, call.arguments[0]] } : inner
}

/** A file's top-level constants by name, as `const pageOptions = {…}`, so an option spread or passed by name is read. */
export function constantsOf(source: ts.SourceFile): Map<string, ts.Expression> {
  const constants = new Map<string, ts.Expression>()

  for (const statement of source.statements) {
    // oxlint-disable-next-line no-bitwise -- TypeScript keeps `const` as a flag; a `let` may be changed later
    if (!ts.isVariableStatement(statement) || (statement.declarationList.flags & ts.NodeFlags.Const) === 0) {
      continue
    }

    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        constants.set(declaration.name.text, declaration.initializer)
      }
    }
  }

  return constants
}

/**
 * Whether a route only answers requests on the server, as a TanStack Start server route does (PAR-1173): its options,
 * with any `.update(…)` after, give `server` and no `component`. Options are followed through the file's constants and
 * spreads; when any part can't be read, as options imported or made by a function, or something like `.lazy(…)` is
 * chained after, the route may draw, so it isn't.
 */
export function serverOnly(chain: RouteChain, constants: ReadonlyMap<string, ts.Expression>): boolean {
  if (chain.opaque) {
    return false
  }

  const names = new Set<string>()

  for (const part of chain.parts) {
    const read = optionNames(part, constants, new Set())

    if (!read) {
      return false
    }

    for (const name of read) {
      names.add(name)
    }
  }

  return names.has("server") && !names.has("component")
}

/** The names some options give, through constants and spreads, or nothing when any of them can't be known. */
function optionNames(
  expression: ts.Expression,
  constants: ReadonlyMap<string, ts.Expression>,
  seen: ReadonlySet<string>
): Set<string> | undefined {
  const value = unwrap(expression)

  if (ts.isIdentifier(value)) {
    const constant = constants.get(value.text)

    return constant === undefined || seen.has(value.text)
      ? undefined
      : optionNames(constant, constants, new Set([...seen, value.text]))
  }

  if (!ts.isObjectLiteralExpression(value)) {
    return undefined
  }

  const names = new Set<string>()

  for (const property of value.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = optionNames(property.expression, constants, seen)

      if (!spread) {
        return undefined
      }

      for (const name of spread) {
        names.add(name)
      }
    } else if (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name)) {
      names.add(property.name.text)
    } else {
      // A computed name, as `[key]: …`, could be any.
      return undefined
    }
  }

  return names
}

/**
 * Routes with the server-only ones given as API routes, which draw nothing (PAR-1173, PAR-1174). One with pages still
 * inside it stays their layout or group, so they keep their parent, and a layout or group left with no page inside is a
 * page.
 */
export function withApiRoutes(routes: readonly Route[], api: ReadonlySet<string>): Route[] {
  const drawn = new Set<string>()
  const holders = new Set<string>()

  // Children come after their parents, so going backwards each route's children are decided before it.
  for (const route of routes.toReversed()) {
    if (route.kind === "root" || holders.has(route.id) || !api.has(route.id)) {
      drawn.add(route.id)

      if (route.parent !== undefined) {
        holders.add(route.parent)
      }
    }
  }

  return routes.map((route) => {
    if (!drawn.has(route.id)) {
      return { ...route, kind: "api" }
    }

    return route.kind !== "root" && route.kind !== "page" && !holders.has(route.id) ? { ...route, kind: "page" } : route
  })
}
