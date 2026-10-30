import { basename, dirname } from "node:path"
import type { ComponentEvidence, ComponentExport, PackageManifest, RendererAdapter } from "@parity/core"
import ts from "typescript"

export const reactRenderer: RendererAdapter = {
  id: "react",
  name: "React",
  detect: (pkg) => hasDependency(pkg, "react") && hasDependency(pkg, "react-dom"),
  guestModule: "@parity/renderer-react/guest",
  runtimePackages: ["react", "react-dom"],
  runtimeImports: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client"],
  // `.ts` too: a component can be made with `createElement`, or be an alias such as `const Select = Primitive.Root`.
  componentExtensions: [".tsx", ".ts", ".jsx", ".js"],
  findComponents
}

/**
 * The components a file exports, read from its syntax alone, as Storybook's react-docgen reads them: fast enough to
 * list a thousand files in a fraction of a second. A component is an exported function that renders JSX and takes at
 * most one props object, a class extending `Component`, or what `forwardRef`, `memo` or `lazy` return, under a
 * capitalised name, as JSX requires. A default export is named after its declaration, else its file.
 *
 * What syntax can't show is left to the type checker: `const Select = SelectPrimitive.Root`, or a component that only
 * returns `children`. Those come back without `as`, as do a declaration file's capitalised exports, which have no
 * bodies to read. Exports that can't be components, such as strings, objects and helpers taking two arguments, aren't
 * listed.
 */
export function findComponents(source: string, file: string): ComponentExport[] {
  if (/\.d\.[cm]?ts$/.test(file)) return declaredNames(source).map((name) => ({ name, export: name }))
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file))
  const locals = new Map<string, ts.Node | undefined>()
  const exported: { name: string; export: string; node?: ts.Node; local?: string }[] = []

  for (const statement of parsed.statements) {
    const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    const isDefault = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      const name = statement.name?.text
      if (name) locals.set(name, statement)
      if (isDefault) exported.push({ name: defaultName(name, file), export: "default", node: statement })
      else if (isExported && name) exported.push({ name, export: name, node: statement })
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue
        const name = declaration.name.text
        locals.set(name, declaration.initializer)
        if (isExported) exported.push({ name, export: name, node: declaration.initializer })
      }
    } else if (ts.isExportDeclaration(statement)) {
      // Re-exports from another module are listed where they're declared, so each component appears once.
      if (statement.moduleSpecifier || statement.isTypeOnly || !statement.exportClause) continue
      if (!ts.isNamedExports(statement.exportClause)) continue
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue
        const local = (element.propertyName ?? element.name).text
        const name = element.name.text
        exported.push(
          name === "default"
            ? { name: defaultName(local, file), export: "default", local }
            : { name, export: name, local }
        )
      }
    } else if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expression = unwrap(statement.expression)
      exported.push(
        ts.isIdentifier(expression)
          ? { name: defaultName(expression.text, file), export: "default", local: expression.text }
          : { name: defaultName(undefined, file), export: "default", node: expression }
      )
    }
  }

  const found: ComponentExport[] = []
  // A component exported by name and as the default is listed once, by its name.
  const named = new Set(
    exported.filter((entry) => entry.export !== "default").map((entry) => entry.local ?? entry.name)
  )
  for (const entry of exported) {
    // JSX treats a lowercase tag as an HTML element, so a component's name starts with a capital.
    if (!/^[A-Z]/.test(entry.name)) continue
    if (entry.export === "default" && entry.local !== undefined && named.has(entry.local)) continue
    const node = entry.local === undefined ? entry.node : locals.get(entry.local)
    // Without a declaration here to read, as in `export { Root as Select }` with `Root` imported, the checker decides.
    const unread = entry.local === undefined || !locals.has(entry.local)
    let verdict: ComponentEvidence | "maybe" | undefined
    if (node) verdict = evidence(node, locals)
    else if (unread) verdict = "maybe"
    if (verdict === "maybe") found.push({ name: entry.name, export: entry.export })
    else if (verdict) found.push({ name: entry.name, export: entry.export, as: verdict })
  }
  return found
}

const wrappers: Record<string, ComponentEvidence> = { forwardRef: "forwardRef", memo: "memo", lazy: "lazy" }

/**
 * Why a declaration is a component; `maybe` when its syntax can't say, as for a value from another module or a
 * function without JSX; or undefined when it can't be one.
 */
function evidence(
  node: ts.Node,
  locals: Map<string, ts.Node | undefined>,
  depth = 0
): ComponentEvidence | "maybe" | undefined {
  const value = ts.isExpression(node) ? unwrap(node) : node
  if (ts.isFunctionDeclaration(value) || ts.isFunctionExpression(value) || ts.isArrowFunction(value)) {
    if (!takesProps(value)) return undefined
    return rendersJsx(value) ? "function" : "maybe"
  }
  if (ts.isClassDeclaration(value) || ts.isClassExpression(value)) {
    const base = value.heritageClauses?.find((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]
    if (!base) return undefined
    return /(^|\.)(Pure)?Component$/.test(base.expression.getText()) ? "class" : "maybe"
  }
  if (ts.isCallExpression(value)) {
    const callee = unwrap(value.expression)
    let name: string | undefined
    if (ts.isIdentifier(callee)) name = callee.text
    else if (ts.isPropertyAccessExpression(callee)) name = callee.name.text
    return (name === undefined ? undefined : wrappers[name]) ?? "maybe"
  }
  if (ts.isIdentifier(value)) {
    // `export const Button = BaseButton`, where `BaseButton` is declared in the same file.
    const target = locals.get(value.text)
    if (target && depth < 3) return evidence(target, locals, depth + 1)
    return locals.has(value.text) ? undefined : "maybe"
  }
  return ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value) ? "maybe" : undefined
}

/**
 * Whether React could call a function as a component: with one props object or none. Helpers that take several
 * arguments, or a string or number, can render JSX too, but React never calls them that way.
 */
function takesProps(fn: ts.FunctionLikeDeclaration): boolean {
  const required = fn.parameters.filter(
    (parameter) => !parameter.questionToken && !parameter.initializer && !parameter.dotDotDotToken
  )
  if (required.length > 1) return false
  const first = fn.parameters[0]?.type
  return !(first && primitiveKeywords.has(first.kind))
}

/** Whether JSX appears anywhere in a function's body. */
function rendersJsx(fn: ts.FunctionLikeDeclaration): boolean {
  if (!fn.body) return false
  let found = false
  const visit = (node: ts.Node) => {
    if (found) return
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) found = true
    else ts.forEachChild(node, visit)
  }
  visit(fn.body)
  return found
}

const primitiveKeywords = new Set([
  ts.SyntaxKind.StringKeyword,
  ts.SyntaxKind.NumberKeyword,
  ts.SyntaxKind.BooleanKeyword,
  ts.SyntaxKind.BigIntKeyword,
  ts.SyntaxKind.SymbolKeyword
])

/** An expression without the parentheses, `as`, `satisfies` and `!` around it. */
function unwrap(node: ts.Expression): ts.Expression {
  let current = node
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression
  }
  return current
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false)
}

/**
 * A default export's name: its declaration's, when that's capitalised, else its file's (`user-card.tsx` is
 * `UserCard`), or for an `index` file, its folder's.
 */
function defaultName(declared: string | undefined, file: string): string {
  if (declared && /^[A-Z]/.test(declared)) return declared
  const base = basename(file).replace(/\.[cm]?[jt]sx?$/, "")
  const name = base === "index" ? basename(dirname(file)) : base
  return name
    .split(/[^A-Za-z0-9_$]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("")
}

function scriptKind(file: string): ts.ScriptKind {
  if (/\.[cm]?tsx$/.test(file)) return ts.ScriptKind.TSX
  if (/\.[cm]?jsx$/.test(file)) return ts.ScriptKind.JSX
  // Plain `.js` files can hold JSX in projects that compile them with a JSX transform.
  if (/\.[cm]?js$/.test(file)) return ts.ScriptKind.JSX
  return ts.ScriptKind.TS
}

/** PascalCase names a declaration file exports: `export function X`, `export const X`, and `export { X, Y as Z }`. */
function declaredNames(source: string): string[] {
  const names = new Set<string>()
  for (const match of source.matchAll(/export\s+(?:default\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]!)
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}(?!\s*from)/g)) {
    for (const specifier of match[1]!.split(",")) {
      const name = specifier
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (name && !name.startsWith("type ")) names.add(name)
    }
  }
  return [...names].filter((name) => /^[A-Z][A-Za-z0-9]*$/.test(name))
}

function hasDependency(pkg: PackageManifest, name: string): boolean {
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name])
}
