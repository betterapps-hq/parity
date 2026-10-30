import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import ts from "typescript"

/**
 * A prop one of the package's components gives a part it renders: one of its own props, a value, an item of a list it
 * maps (`toasts.map((toast) => <Toast toast={toast} />)`), or worked out.
 */
export type PassedProp = { forward: string } | { value: unknown } | { item: true } | { computed: true }

/** How a component of the package renders a part: the owner, the props it passes, and the parts it puts inside. */
export interface RenderCall {
  owner: string
  props: Record<string, PassedProp>
  children?: RenderedChild[]
}

/** A part the package's own code puts inside another, with the parts inside it, by exported name. */
export interface RenderedChild {
  component: string
  children?: RenderedChild[]
}

/**
 * What each of the package's own functions renders, by the names the package exports: read from its compiled files,
 * following `jsx()` and `createElement()` calls and JSX. Only files that mention one of `names` are read. `calls`, when
 * given, collects each render with the props passed, by the part rendered. `made`, when given, collects the values
 * the package exports that a factory makes (`export const toast = createToastManager()`), by their exported names.
 */
export async function readRenders(
  packageDir: string,
  names: string[],
  calls?: Map<string, RenderCall[]>,
  made?: Set<string>
): Promise<Map<string, Set<string>>> {
  const renders = new Map<string, Set<string>>()
  for (const file of await sourceFiles(packageDir)) {
    const text = await readFile(file, "utf8")
    if (!names.some((name) => text.includes(name))) continue
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TSX)
    const exportedAs = new Map<string, string>()
    for (const statement of source.statements) {
      if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) {
        continue
      }
      for (const element of statement.exportClause.elements) {
        exportedAs.set((element.propertyName ?? element.name).getText(source), element.name.getText(source))
      }
    }
    const named = (local: string) => exportedAs.get(local) ?? local
    for (const statement of made ? source.statements : []) {
      if (!ts.isVariableStatement(statement)) continue
      const exported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer
        if (!ts.isIdentifier(declaration.name) || !init || !ts.isCallExpression(init)) continue
        if (!/(?:^|\.)create[A-Z]\w*$/.test(init.expression.getText(source))) continue
        const local = declaration.name.text
        if (exported || exportedAs.has(local)) made!.add(named(local))
      }
    }
    const visit = (node: ts.Node, owner: string | undefined, params: Params) => {
      let here = owner
      let own = params
      if (ts.isFunctionDeclaration(node) && node.name) {
        here = named(node.name.text)
        own = paramsOf(node)
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        if (/^[A-Z]/.test(node.name.text)) {
          here = named(node.name.text)
          own = paramsOf(node.initializer)
        }
      }
      if (here) {
        const rendered = renderedBy(node, source)
        if (rendered) {
          const set = renders.get(here) ?? new Set()
          set.add(named(rendered))
          renders.set(here, set)
          if (calls) {
            const list = calls.get(named(rendered)) ?? []
            const children = renderedChildren(node, source, named)
            list.push({ owner: here, props: passedProps(node, own), ...(children.length > 0 ? { children } : {}) })
            calls.set(named(rendered), list)
          }
        }
      }
      // A list's items, inside the callback that maps them.
      const callback =
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "map"
          ? node.arguments[0]
          : undefined
      const item =
        callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
          ? callback.parameters[0]?.name
          : undefined
      ts.forEachChild(node, (child) =>
        visit(
          child,
          here,
          child === callback && item && ts.isIdentifier(item)
            ? { ...own, items: new Set([...own.items, item.text]) }
            : own
        )
      )
    }
    visit(source, undefined, { locals: new Map(), objects: new Set(), items: new Set() })
  }
  return renders
}

/** The components of the package that render each one, the reverse of `readRenders`. */
export function renderedIn(renders: Map<string, Set<string>>): Map<string, string[]> {
  const owners = new Map<string, string[]>()
  for (const [owner, rendered] of renders) {
    for (const name of rendered) if (name !== owner) owners.set(name, [...(owners.get(name) ?? []), owner])
  }
  return owners
}

/**
 * The parts only a host renders: components the package's own code draws inside a host a decorator adds (`Toaster`
 * mapping the toast manager's list into `Toast`, `ToastTitle` and the rest), and nowhere else. A person never places
 * these, so they're not visual.
 */
export function hostedParts(renders: Map<string, Set<string>>, hosts: string[], names: string[]): string[] {
  // Everything the hosts render, through every function in between.
  const reached = new Set<string>(hosts)
  const queue = [...hosts]
  while (queue.length > 0) {
    for (const next of renders.get(queue.pop()!) ?? []) {
      if (!reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }
  const owners = renderedIn(renders)
  return names.filter(
    (name) =>
      !hosts.includes(name) && reached.has(name) && (owners.get(name) ?? []).every((owner) => reached.has(owner))
  )
}

/** A component function's own props: names destructured from its first parameter, and the parameter's own name. */
interface Params {
  locals: Map<string, string>
  objects: Set<string>
  /** Items of lists being mapped, by the callback's parameter. */
  items: Set<string>
}

/** The expression an attribute gives: `{expression}` or a string. */
function attributeExpression(value: ts.JsxAttributeValue | undefined): ts.Expression | undefined {
  if (value && ts.isJsxExpression(value)) return value.expression
  return value && ts.isStringLiteral(value) ? value : undefined
}

function paramsOf(node: ts.Node): Params {
  const params: Params = { locals: new Map(), objects: new Set(), items: new Set() }
  // The function itself, or the one a call wraps (`forwardRef(function (props, ref) {...})`).
  let fn: ts.Node | undefined = node
  if (ts.isCallExpression(fn)) fn = fn.arguments.find((arg) => ts.isFunctionLike(arg))
  if (!fn || !(ts.isFunctionDeclaration(fn) || ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return params
  const first = fn.parameters[0]?.name
  if (!first) return params
  if (ts.isIdentifier(first)) params.objects.add(first.text)
  else if (ts.isObjectBindingPattern(first)) {
    for (const element of first.elements) {
      if (!ts.isIdentifier(element.name)) continue
      if (element.dotDotDotToken) params.objects.add(element.name.text)
      else {
        const key = element.propertyName ?? element.name
        if (ts.isIdentifier(key) || ts.isStringLiteral(key)) params.locals.set(element.name.text, key.text)
      }
    }
  }
  return params
}

/** The props a render passes: the owner's own props by name, literal values, and the rest as worked out. */
function passedProps(node: ts.Node, params: Params): Record<string, PassedProp> {
  const props: Record<string, PassedProp> = {}
  const object = ts.isCallExpression(node) ? node.arguments[1] : undefined
  const entries: [string, ts.Expression | undefined][] = []
  if (object && ts.isObjectLiteralExpression(object)) {
    for (const property of object.properties) {
      if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        entries.push([property.name.text, property.initializer])
      } else if (ts.isShorthandPropertyAssignment(property)) entries.push([property.name.text, property.name])
    }
  } else if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    for (const attribute of node.attributes.properties) {
      if (!ts.isJsxAttribute(attribute)) continue
      const value = attribute.initializer
      entries.push([attribute.name.getText(), attributeExpression(value)])
    }
  }
  for (const [key, value] of entries) {
    if (key === "children" || key === "className") continue
    if (!value) props[key] = { value: true }
    else if (ts.isIdentifier(value) && params.items.has(value.text)) props[key] = { item: true }
    else if (ts.isIdentifier(value) && params.locals.has(value.text))
      props[key] = { forward: params.locals.get(value.text)! }
    else if (
      ts.isPropertyAccessExpression(value) &&
      ts.isIdentifier(value.expression) &&
      params.objects.has(value.expression.text)
    ) {
      props[key] = { forward: value.name.text }
    } else if (ts.isStringLiteralLike(value)) props[key] = { value: value.text }
    else if (ts.isNumericLiteral(value)) props[key] = { value: Number(value.text) }
    else if (value.kind === ts.SyntaxKind.TrueKeyword || value.kind === ts.SyntaxKind.FalseKeyword) {
      props[key] = { value: value.kind === ts.SyntaxKind.TrueKeyword }
    } else props[key] = { computed: true }
  }
  return props
}

/**
 * The parts a `jsx(X, { children })` call puts inside X, through HTML elements, lists and conditions in between
 * (`_jsxs(ToastContent, { children: [_jsxs("div", { children: [_jsx(ToastTitle, {})] })] })`).
 */
function renderedChildren(node: ts.Node, source: ts.SourceFile, named: (local: string) => string): RenderedChild[] {
  const childrenOf = (call: ts.CallExpression): RenderedChild[] => {
    const object = call.arguments[1]
    if (!object || !ts.isObjectLiteralExpression(object)) return []
    const children = object.properties.find(
      (property): property is ts.PropertyAssignment =>
        ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === "children"
    )
    return children ? walk(children.initializer) : []
  }
  const walk = (expression: ts.Expression): RenderedChild[] => {
    while (ts.isParenthesizedExpression(expression)) expression = expression.expression
    if (ts.isArrayLiteralExpression(expression)) return expression.elements.flatMap(walk)
    if (ts.isConditionalExpression(expression)) return walk(expression.whenTrue)
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return walk(expression.right)
    }
    if (!ts.isCallExpression(expression)) return []
    const first = expression.arguments[0]
    const rendered = renderedBy(expression, source)
    if (rendered) {
      const children = childrenOf(expression)
      return [{ component: named(rendered), ...(children.length > 0 ? { children } : {}) }]
    }
    // An HTML element: what's inside it.
    return first && ts.isStringLiteral(first) && /^[a-z]/.test(first.text) ? childrenOf(expression) : []
  }
  return ts.isCallExpression(node) ? childrenOf(node) : []
}

/** The component a `jsx(X, ...)`, `createElement(X, ...)` or `<X>` renders, when it's a plain name. */
function renderedBy(node: ts.Node, source: ts.SourceFile): string | undefined {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
    return ts.isIdentifier(node.tagName) && /^[A-Z]/.test(node.tagName.text) ? node.tagName.text : undefined
  }
  if (!ts.isCallExpression(node)) return undefined
  let callee: ts.Expression = node.expression
  // `(0, _jsxRuntime.jsx)(...)` in CommonJS builds.
  while (ts.isParenthesizedExpression(callee)) callee = callee.expression
  if (ts.isBinaryExpression(callee) && callee.operatorToken.kind === ts.SyntaxKind.CommaToken) callee = callee.right
  const text = callee.getText(source)
  if (!/(?:^|\.)(?:_?jsxs?|_?jsxDEV|createElement)$/.test(text)) return undefined
  const first = node.arguments[0]
  return first && ts.isIdentifier(first) && /^[A-Z]/.test(first.text) ? first.text : undefined
}

/** The package's own script files, skipping type declarations, source maps and its dependencies. */
async function sourceFiles(dir: string, found: string[] = [], depth = 0): Promise<string[]> {
  if (depth > 8 || found.length >= 4000) return found
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && !entry.name.startsWith(".")) await sourceFiles(path, found, depth + 1)
    } else if (/\.(?:m?js|cjs|jsx)$/.test(entry.name) && (await stat(path)).size < 1_000_000) {
      found.push(path)
    }
  }
  return found
}
