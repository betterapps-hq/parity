import type { Route, RouteSegment } from "@parity-app/extension-api"
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

/**
 * Whether a route only answers requests on the server, as a TanStack Start server route does (PAR-1173): its options
 * have `server` and no `component`, and neither spread options nor a lazy part could give it one.
 */
export function serverOnly(options: ts.ObjectLiteralExpression | undefined, lazy: boolean): boolean {
  return (
    !lazy &&
    options !== undefined &&
    propertyValue(options, "server") !== undefined &&
    propertyValue(options, "component") === undefined &&
    // Options spread in, as `{ ...pageOptions, server }`, may give the component.
    !options.properties.some((property) => ts.isSpreadAssignment(property))
  )
}

/**
 * Routes without the server-only ones, which draw nothing (PAR-1173). One with routes still inside it stays, so they
 * keep their parent, and a layout or group left with nothing inside is a page.
 */
export function pagesOnly(routes: readonly Route[], server: ReadonlySet<string>): Route[] {
  const kept = new Set<string>()
  const parents = new Set<string>()

  // Children come after their parents, so going backwards each route's children are decided before it.
  for (const route of routes.toReversed()) {
    if (route.kind === "root" || parents.has(route.id) || !server.has(route.id)) {
      kept.add(route.id)

      if (route.parent !== undefined) {
        parents.add(route.parent)
      }
    }
  }

  return routes.flatMap((route) => {
    if (!kept.has(route.id)) {
      return []
    }

    return route.kind !== "root" && route.kind !== "page" && !parents.has(route.id)
      ? [{ ...route, kind: "page" }]
      : [route]
  })
}
