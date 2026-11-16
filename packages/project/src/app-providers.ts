import ts from "typescript"
import { previewFolder } from "./preview-file.ts"

/** Reads a project's file by its path from the root, or gives `undefined` when it isn't there. */
export type ReadProjectFile = (path: string) => Promise<string | undefined>

/** A provider the app's entry renders around the app, as the preview file would put it around every frame. */
export interface OfferedProvider {
  /** Its name as the app writes it, such as `ThemeProvider`. */
  name: string
  /** The file that renders it, from the project's root. */
  file: string
  /** Whether it picks the light or dark value by the frame's theme, as the app picks it by its own state. */
  themed: boolean
}

/** A provider the preview file can't carry, since one of its props comes from something the app makes as it runs. */
export interface LeftOutProvider {
  name: string
  file: string
  /** What the provider needs that only the running app has: a name, such as `queryClient`, or `"spread props"`. */
  needs: string
}

/** A preview file built from the providers the app's entry renders around the app, for Parity to offer to write. */
export interface PreviewOffer {
  /** Where it goes, from the project's root: `.parity/preview.tsx`, or `preview.jsx` for a JavaScript app. */
  file: string
  /** The file's text. */
  text: string
  /** Outermost first. */
  providers: OfferedProvider[]
  leftOut: LeftOutProvider[]
}

const scriptExtensions = [".tsx", ".ts", ".jsx", ".js", ".mjs"]

/** How many files deep the app's components are followed from its entry. */
const fileLimit = 6

/** What wraps an app without being one of its providers, so the reader looks inside it. */
const passedThrough = new Set(["Fragment", "StrictMode", "Suspense", "Profiler"])

/** Routers, which a router's extension already draws frames inside, so the preview file doesn't add another. */
const routers = new Set(["BrowserRouter", "HashRouter", "MemoryRouter", "Router", "RouterProvider", "StaticRouter"])

/** A provider, by the name React's libraries and apps give one: `ThemeProvider`, `Providers`, `IntlProvider`. */
const providerName = /Providers?$/

/** A theme's dark value, and its light one, by their names. */
const darkName = /dark/i
const lightName = /light/i

/** The names a module uses without declaring or importing them, which are the page's own. */
const pageGlobals = new Set(["window", "document", "globalThis", "navigator", "localStorage", "undefined", "process"])

interface Imported {
  /** The module as the importing file names it. */
  specifier: string
  /** `default`, `*` for a namespace, or the export's name. */
  imported: string
}

/** A file the reader is in, parsed, with what it imports and declares at its top level. */
interface Scope {
  path: string
  source: ts.SourceFile
  imports: Map<string, Imported>
  declarations: Map<string, ts.VariableDeclaration | ts.FunctionDeclaration>
}

interface Found {
  name: string
  scope: Scope
  element: ts.JsxElement
}

/**
 * The preview file Parity offers to write from what the app's entry renders around the app (PAR-104), or `undefined`
 * when it renders no providers the file could carry. It starts at the entry's `render` call and follows the app's own
 * components through their files, taking each provider on the way: a component whose name ends in `Provider` or
 * `Providers`, from a package or the app. `StrictMode`, `Suspense` and fragments are looked inside; routers are passed
 * over, since a router's extension draws frames inside one. It stops at anything else, or where an element has several
 * children and not exactly one of them is a provider.
 *
 * A provider's props are carried as the app writes them, with what they import, imported from the preview file, and
 * what the file declares at its top level, such as `const queryClient = new QueryClient()`, copied. A prop that picks a
 * dark or light value, as `isDark ? darkTheme : lightTheme` does, picks it by the frame's `theme` global instead. A
 * provider whose prop needs anything else the app makes, such as its state, is left out, with what it needs.
 */
export async function offerPreviewFile(read: ReadProjectFile): Promise<PreviewOffer | undefined> {
  const entry = await findEntry(read)

  if (!entry) {
    return undefined
  }

  const found: Found[] = []
  const opened = { files: 1 }

  const walk = async (node: ts.Node, scope: Scope): Promise<void> => {
    const element = unwrap(node)

    if (!element || ts.isJsxFragment(element)) {
      return element ? walkChildren(element.children, scope) : undefined
    }

    const name = tagName(element)

    if (passedThrough.has(lastPart(name)) || routers.has(lastPart(name))) {
      return ts.isJsxElement(element) ? walkChildren(element.children, scope) : undefined
    }

    if (providerName.test(lastPart(name)) && ts.isJsxElement(element)) {
      found.push({ name, scope, element })

      return walkChildren(element.children, scope)
    }

    const children = ts.isJsxElement(element) ? elementChildren(element.children) : []

    if (children.length === 0 && opened.files < fileLimit) {
      const inner = await componentScope(read, scope, name)

      if (inner) {
        opened.files += 1

        return walk(inner.returned, inner.scope)
      }
    }
  }

  const walkChildren = async (children: ts.NodeArray<ts.JsxChild>, scope: Scope): Promise<void> => {
    const elements = elementChildren(children)

    const providers = elements.filter((child) => providerName.test(lastPart(tagName(child))))
    // Among several children, only a lone provider leads on: sibling providers wrap different parts of the app, and
    // nesting them would give every frame the last one's value.
    const followed = elements.length === 1 ? elements : providers

    if (followed.length !== 1) {
      return
    }

    for (const child of followed) {
      await walk(child, scope)
    }
  }

  await walk(entry.rendered, entry.scope)

  return found.length === 0 ? undefined : writeOffer(found, entry.scope)
}

/** The app's entry and the element its `render` call draws. */
async function findEntry(read: ReadProjectFile): Promise<{ scope: Scope; rendered: ts.Node } | undefined> {
  for (const path of await entryCandidates(read)) {
    const text = await read(path)

    if (text === undefined) {
      continue
    }

    const scope = parse(path, text)
    const rendered = renderedElement(scope.source)

    if (rendered) {
      return { scope, rendered }
    }
  }

  return undefined
}

/** The module script `index.html` loads, then `src/main` and `src/index` with each script extension. */
async function entryCandidates(read: ReadProjectFile): Promise<string[]> {
  const html = await read("index.html")
  const named = html && /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i.exec(html)?.[1]
  const bases = ["src/main", "src/index", "index"]

  return [
    ...(named ? [named.replace(/^\.?\//, "")] : []),
    ...bases.flatMap((base) => scriptExtensions.map((extension) => `${base}${extension}`))
  ]
}

/** The element given to `root.render(…)`, `ReactDOM.render(…, el)` or `hydrateRoot(el, …)`. */
function renderedElement(source: ts.SourceFile): ts.Node | undefined {
  let rendered: ts.Node | undefined

  const visit = (node: ts.Node) => {
    if (rendered) {
      return
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const called = ts.isPropertyAccessExpression(callee) ? callee.name.text : callee.getText(source)
      const argument = called === "hydrateRoot" ? node.arguments[1] : node.arguments[0]

      if ((called === "render" || called === "hydrateRoot") && argument && unwrap(argument)) {
        rendered = argument

        return
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(source)

  return rendered
}

/** The file a component the scope imports from the app comes from, and the element it returns. */
async function componentScope(
  read: ReadProjectFile,
  scope: Scope,
  name: string
): Promise<{ scope: Scope; returned: ts.Node } | undefined> {
  const imported = scope.imports.get(name)

  if (!imported?.specifier.startsWith(".")) {
    return undefined
  }

  for (const path of moduleCandidates(joinPath(folderOf(scope.path), imported.specifier))) {
    const text = await read(path)

    if (text === undefined) {
      continue
    }

    const inner = parse(path, text)
    const component = exportedFunction(inner, imported.imported)
    const returned = component && returnedElement(component)

    return returned ? { scope: inner, returned } : undefined
  }

  return undefined
}

/** A relative import's file: as written, with a script extension, or its folder's `index`. */
function moduleCandidates(base: string): string[] {
  return [
    base,
    ...scriptExtensions.map((extension) => `${base}${extension}`),
    ...scriptExtensions.map((extension) => `${base}/index${extension}`)
  ]
}

/** The function a module exports by a name, or as its default export. */
function exportedFunction(scope: Scope, exported: string): ts.FunctionLikeDeclaration | undefined {
  let local = exported

  for (const statement of scope.source.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
      const isDefault = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)

      if ((exported === "default" && isDefault) || statement.name?.text === exported) {
        return statement
      }
    }

    if (exported === "default" && ts.isExportAssignment(statement)) {
      const value = statement.expression

      if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
        return value
      }

      if (ts.isIdentifier(value)) {
        local = value.text
      }
    }
  }

  const declared = scope.declarations.get(local)

  if (!declared) {
    return undefined
  }

  if (ts.isFunctionDeclaration(declared)) {
    return declared
  }

  const value = declared.initializer && unwrapParentheses(declared.initializer)

  return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : undefined
}

/** The element a component returns: its arrow's body, or its last top-level `return`. */
function returnedElement(component: ts.FunctionLikeDeclaration): ts.Node | undefined {
  const body = component.body

  if (!body) {
    return undefined
  }

  if (!ts.isBlock(body)) {
    return unwrap(body)
  }

  const returns = body.statements.filter(ts.isReturnStatement)
  const last = returns.at(-1)?.expression

  return last && unwrap(last)
}

function isExported(statement: ts.FunctionDeclaration): boolean {
  return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
}

function parse(path: string, text: string): Scope {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind(path))
  const imports = new Map<string, Imported>()
  const declarations = new Map<string, ts.VariableDeclaration | ts.FunctionDeclaration>()

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text
      const clause = statement.importClause

      if (!clause || clause.isTypeOnly) {
        continue
      }

      if (clause.name) {
        imports.set(clause.name.text, { specifier, imported: "default" })
      }

      const bindings = clause.namedBindings

      if (bindings && ts.isNamespaceImport(bindings)) {
        imports.set(bindings.name.text, { specifier, imported: "*" })
      } else if (bindings) {
        for (const each of bindings.elements) {
          if (!each.isTypeOnly) {
            imports.set(each.name.text, { specifier, imported: (each.propertyName ?? each.name).text })
          }
        }
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          declarations.set(declaration.name.text, declaration)
        }
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      declarations.set(statement.name.text, statement)
    }
  }

  return { path, source, imports, declarations }
}

function scriptKind(path: string): ts.ScriptKind {
  return path.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.TSX
}

/** A JSX element or fragment, with the parentheses around it taken off. */
function unwrap(node: ts.Node): ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment | undefined {
  const inner = unwrapParentheses(node)

  return ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner) || ts.isJsxFragment(inner) ? inner : undefined
}

function unwrapParentheses(node: ts.Node): ts.Node {
  return ts.isParenthesizedExpression(node) ? unwrapParentheses(node.expression) : node
}

function elementChildren(children: ts.NodeArray<ts.JsxChild>): (ts.JsxElement | ts.JsxSelfClosingElement)[] {
  return children.filter((child) => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
}

function tagName(element: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const tag = ts.isJsxElement(element) ? element.openingElement.tagName : element.tagName

  return tag.getText()
}

/** `StrictMode` from `React.StrictMode`. */
function lastPart(name: string): string {
  return name.slice(name.lastIndexOf(".") + 1)
}

/** The first part of a tag's name, which the file imports or declares: `React` from `React.StrictMode`. */
function firstPart(name: string): string {
  const dot = name.indexOf(".")

  return dot === -1 ? name : name.slice(0, dot)
}

function folderOf(path: string): string {
  const slash = path.lastIndexOf("/")

  return slash === -1 ? "" : path.slice(0, slash)
}

/** A relative path from a folder, both from the project's root, without `.` or `..` parts. */
function joinPath(folder: string, relative: string): string {
  const parts = folder === "" ? [] : folder.split("/")

  for (const part of relative.split("/")) {
    if (part === "..") {
      parts.pop()
    } else if (part !== "." && part !== "") {
      parts.push(part)
    }
  }

  return parts.join("/")
}

/** A path from the root as the preview file imports it: `src/theme` as `../src/theme`. */
function fromPreviewFolder(path: string): string {
  return `${previewFolder
    .split("/")
    .map(() => "..")
    .join("/")}/${path}`
}

/** What the preview file needs from a file to carry a provider's props. */
interface Carried {
  imports: { local: string; from: Imported }[]
  /** Top-level declarations copied from the provider's file, by the name each declares. */
  declarations: { name: string; text: string }[]
  /** The names the provider's own component declares, which shadow the file's and only the running app has. */
  locals: ReadonlySet<string>
}

/** The text of the preview file, with the providers it can carry and the ones it leaves out. */
function writeOffer(found: Found[], entry: Scope): PreviewOffer | undefined {
  const providers: OfferedProvider[] = []
  const leftOut: LeftOutProvider[] = []
  const openings: string[] = []
  const imports = new Map<string, Imported>()
  const declarations = new Map<string, string>()
  let themed = false
  const text = entry.source.text
  const quote = (text.match(/'/g)?.length ?? 0) > (text.match(/"/g)?.length ?? 0) ? "'" : '"'

  for (const { name, scope, element } of found) {
    const carried: Carried = { imports: [], declarations: [], locals: localNames(element) }
    const tag = carryName(firstPart(name), scope, carried)
    const props = carryProps(element.openingElement.attributes, scope, carried, quote)

    // Two providers' files can give one name different values; the second is left out rather than clash.
    const clash =
      carried.imports.find(({ local, from }) => {
        const known = imports.get(local)

        return (
          declarations.has(local) || (known && (known.specifier !== from.specifier || known.imported !== from.imported))
        )
      })?.local ??
      carried.declarations.find(({ name: declared, text: copied }) => {
        const known = declarations.get(declared)

        return imports.has(declared) || (known !== undefined && known !== copied)
      })?.name

    if ("needs" in props || tag) {
      leftOut.push({ name, file: scope.path, needs: "needs" in props ? props.needs : (tag ?? "") })
      continue
    }

    if (clash) {
      leftOut.push({ name, file: scope.path, needs: clash })
      continue
    }

    for (const { local, from } of carried.imports) {
      imports.set(local, from)
    }

    for (const { name: declared, text: copied } of carried.declarations) {
      declarations.set(declared, copied)
    }

    themed ||= props.themed
    providers.push({ name, file: scope.path, themed: props.themed })
    openings.push(`<${name}${props.text}>`)
  }

  if (providers.length === 0) {
    return undefined
  }

  const typescript = /\.tsx?$/.test(entry.path)
  const file = `${previewFolder}/preview.${typescript ? "tsx" : "jsx"}`

  return {
    file,
    text: previewText({ providers, openings, imports, declarations, themed, typescript, quote }),
    providers,
    leftOut
  }
}

/** A provider's props as the preview file writes them, or the name of what one needs that the file can't have. */
function carryProps(
  attributes: ts.JsxAttributes,
  scope: Scope,
  carried: Carried,
  quote: string
): { text: string; themed: boolean } | { needs: string } {
  let text = ""
  let themed = false

  for (const attribute of attributes.properties) {
    if (ts.isJsxSpreadAttribute(attribute)) {
      return { needs: "spread props" }
    }

    const name = attribute.name.getText()
    const value = attribute.initializer

    if (!value) {
      text += ` ${name}`
      continue
    }

    if (ts.isStringLiteral(value)) {
      text += ` ${name}=${value.getText()}`
      continue
    }

    // An element given as a prop, as `icon=<Logo />` gives one, is carried as an expression is.
    const expression = ts.isJsxExpression(value) ? value.expression : value

    if (!expression) {
      continue
    }

    const theme = themeChoice(expression)
    const parts = theme ? [theme.dark, theme.light] : [expression]

    for (const part of parts) {
      for (const free of freeNames(part)) {
        const needs = carryName(free, scope, carried)

        if (needs) {
          return { needs }
        }
      }
    }

    if (theme) {
      themed = true
      text += ` ${name}={context.globals.theme === ${quote}dark${quote} ? ${theme.dark.getText()} : ${theme.light.getText()}}`
    } else {
      text += ` ${name}={${expression.getText()}}`
    }
  }

  return { text, themed }
}

/** `isDark ? darkTheme : lightTheme`, either way round, as its dark and light values. */
function themeChoice(expression: ts.Expression): { dark: ts.Expression; light: ts.Expression } | undefined {
  const inner = unwrapParentheses(expression)

  if (!ts.isConditionalExpression(inner)) {
    return undefined
  }

  const yes = inner.whenTrue.getText()
  const no = inner.whenFalse.getText()

  if (darkName.test(yes) && lightName.test(no)) {
    return { dark: inner.whenTrue, light: inner.whenFalse }
  }

  if (lightName.test(yes) && darkName.test(no)) {
    return { dark: inner.whenFalse, light: inner.whenTrue }
  }

  return undefined
}

/**
 * Brings a name a provider uses into the preview file: an import, or a top-level declaration with what it uses in turn.
 * Gives the name back when it's something only the running app has, such as the component's state.
 */
function carryName(
  name: string,
  scope: Scope,
  carried: Carried,
  seen = new Set<string>(),
  inDeclaration = false
): string | undefined {
  // The component's own names come first, as the provider's element sees them.
  if (!inDeclaration && carried.locals.has(name)) {
    return name
  }

  if (seen.has(name)) {
    return undefined
  }

  seen.add(name)
  const imported = scope.imports.get(name)

  if (imported) {
    const specifier = imported.specifier.startsWith(".")
      ? fromPreviewFolder(joinPath(folderOf(scope.path), imported.specifier))
      : imported.specifier

    carried.imports.push({ local: name, from: { specifier, imported: imported.imported } })

    return undefined
  }

  const declared = scope.declarations.get(name)

  if (declared) {
    for (const used of freeNames(declared)) {
      const needs = carryName(used, scope, carried, seen, true)

      if (needs) {
        return name
      }
    }

    const text = ts.isFunctionDeclaration(declared)
      ? declared.getText().replace(/^export\s+(default\s+)?/, "")
      : `${declarationKind(declared)} ${declared.getText()}`

    carried.declarations.push({ name, text })

    return undefined
  }

  return declaredAnywhere(name, scope.source) && !pageGlobals.has(name) ? name : undefined
}

/**
 * The names declared inside the functions around an element, as a component's state, its parameters and the functions
 * it defines are, which shadow the file's own and which the preview file can't have.
 */
function localNames(element: ts.Node): Set<string> {
  const names = new Set<string>()

  const collect = (node: ts.Node) => {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isBindingElement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text)
    }

    ts.forEachChild(node, collect)
  }

  for (let around = element.parent; !ts.isSourceFile(around); around = around.parent) {
    if (ts.isFunctionLike(around)) {
      ts.forEachChild(around, collect)
    }
  }

  return names
}

/** `const`, `let` or `var`, as the file declares it, so a binding the app reassigns can still be reassigned. */
function declarationKind(declaration: ts.VariableDeclaration): string {
  const keyword = declaration.parent.getFirstToken()?.getText()

  return keyword === "let" || keyword === "var" ? keyword : "const"
}

/** Whether a name is declared somewhere in a file, as a component's state or a parameter is. */
function declaredAnywhere(name: string, source: ts.SourceFile): boolean {
  let found = false

  const visit = (node: ts.Node) => {
    if (found) {
      return
    }

    if (
      (ts.isVariableDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isBindingElement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = true

      return
    }

    ts.forEachChild(node, visit)
  }

  visit(source)

  return found
}

/**
 * The names an expression or declaration uses from around it: not property names or keys, and not what a function in
 * it declares, which counts only inside that function, as `user => user.name` binds `user` only for its own body.
 */
function freeNames(node: ts.Node): string[] {
  const names = new Set<string>()

  const mention = (name: string, bound: ReadonlySet<string>) => {
    if (!bound.has(name)) {
      names.add(name)
    }
  }

  const visit = (each: ts.Node, bound: ReadonlySet<string>): void => {
    if (ts.isFunctionLike(each)) {
      const inner = new Set([...bound, ...declaredIn(each)])

      ts.forEachChild(each, (child) => {
        // A function's or method's own name isn't something it uses.
        if (child !== each.name) {
          visit(child, inner)
        }
      })

      return
    }

    if (ts.isParameter(each) || ts.isBindingElement(each) || ts.isVariableDeclaration(each)) {
      // What it declares is counted by the function around it; its default or value is what it uses.
      if (each.initializer) {
        visit(each.initializer, bound)
      }

      if (!ts.isIdentifier(each.name)) {
        visit(each.name, bound)
      }

      return
    }

    if (ts.isPropertyAccessExpression(each)) {
      visit(each.expression, bound)

      return
    }

    if (ts.isPropertyAssignment(each)) {
      if (ts.isComputedPropertyName(each.name)) {
        visit(each.name.expression, bound)
      }

      visit(each.initializer, bound)

      return
    }

    if (ts.isJsxAttribute(each)) {
      if (each.initializer) {
        visit(each.initializer, bound)
      }

      return
    }

    if (ts.isIdentifier(each)) {
      mention(each.text, bound)

      return
    }

    if (ts.isJsxOpeningElement(each) || ts.isJsxSelfClosingElement(each)) {
      const tag = each.tagName.getText()

      if (/^[A-Z]/.test(tag) || tag.includes(".")) {
        mention(firstPart(tag), bound)
      }

      visit(each.attributes, bound)

      return
    }

    if (ts.isJsxClosingElement(each) || ts.isTypeNode(each)) {
      return
    }

    ts.forEachChild(each, (child) => visit(child, bound))
  }

  // A declaration being copied declares its own name, which it may use, as a recursive function does.
  const own =
    (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name)

  visit(node, new Set(own ? [node.name.text] : []))

  return [...names]
}

/**
 * The names a function declares for its own body: its parameters, and the variables, functions and classes in it,
 * leaving those of the functions inside it to them.
 */
function declaredIn(fn: ts.SignatureDeclaration): string[] {
  const names: string[] = []

  const collect = (node: ts.Node) => {
    if (
      (ts.isParameter(node) ||
        ts.isBindingElement(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.push(node.name.text)
    }

    // A function inside declares its name here, and the rest for itself.
    if (!ts.isFunctionLike(node)) {
      ts.forEachChild(node, collect)
    }
  }

  ts.forEachChild(fn, (child) => {
    if (child !== fn.name) {
      collect(child)
    }
  })

  return names
}

/** The preview file: its imports, what it copies from the app, one decorator nesting the providers, and its globals. */
function previewText({
  providers,
  openings,
  imports,
  declarations,
  themed,
  typescript,
  quote
}: {
  providers: OfferedProvider[]
  openings: string[]
  imports: Map<string, Imported>
  declarations: Map<string, string>
  themed: boolean
  typescript: boolean
  quote: string
}): string {
  const lines: string[] = []

  if (typescript) {
    lines.push(`import type { ComponentType } from ${quote}react${quote}`)
  }

  lines.push(...importLines(imports, quote))
  lines.push("")

  for (const declaration of declarations.values()) {
    lines.push(declaration, "")
  }

  const story = typescript ? "Story: ComponentType" : "Story"
  const context = typescript ? "context: { globals: Record<string, unknown> }" : "context"
  const parameters = themed ? `${story}, ${context}` : story
  const names = [...new Set(providers.map((provider) => provider.file))].join(" and ")

  lines.push(`// The providers ${names} renders around the app, around every frame on the canvas.`)
  lines.push(`const withProviders = (${parameters}) => (`)

  openings.forEach((opening, depth) => lines.push(`${"  ".repeat(depth + 1)}${opening}`))
  lines.push(`${"  ".repeat(openings.length + 1)}<Story />`)

  for (let depth = openings.length - 1; depth >= 0; depth -= 1) {
    lines.push(`${"  ".repeat(depth + 1)}</${providers[depth]!.name}>`)
  }

  lines.push(")", "", "export const decorators = [withProviders]", "")

  if (themed) {
    lines.push(
      "export const globalTypes = {",
      `  theme: { description: ${quote}Theme${quote}, defaultValue: ${quote}light${quote} },`,
      "}",
      ""
    )
  }

  return lines.join("\n")
}

/** One import line per module, its default first: the packages first, each in the order the providers need it. */
function importLines(imports: Map<string, Imported>, quote: string): string[] {
  const modules = new Map<string, { defaults: string[]; namespaces: string[]; named: string[] }>()

  for (const [local, { specifier, imported }] of imports) {
    const entry = modules.get(specifier) ?? { defaults: [], namespaces: [], named: [] }

    // Each provider's file can call the same export by its own name, so every name is kept.
    if (imported === "default") {
      entry.defaults.push(local)
    } else if (imported === "*") {
      entry.namespaces.push(local)
    } else {
      entry.named.push(imported === local ? local : `${imported} as ${local}`)
    }

    modules.set(specifier, entry)
  }

  // The packages', then the app's own, as an app's imports usually go.
  const ordered = [...modules].toSorted(([one], [other]) => Number(one.startsWith(".")) - Number(other.startsWith(".")))

  return ordered.flatMap(([specifier, entry]) => {
    const from = `from ${quote}${specifier}${quote}`
    const lines: string[] = []
    const [first, ...others] = entry.defaults
    const named = [...others.map((local) => `default as ${local}`), ...entry.named.toSorted()]
    const bindings = [first, named.length > 0 ? `{ ${named.join(", ")} }` : undefined].filter(Boolean).join(", ")

    if (bindings) {
      lines.push(`import ${bindings} ${from}`)
    }

    for (const namespace of entry.namespaces) {
      lines.push(`import * as ${namespace} ${from}`)
    }

    return lines
  })
}
