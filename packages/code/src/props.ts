import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import type { ComponentInfo, ComponentProp, ComponentSource, PropGroup, PropKind } from "@parity-app/core"
import ts from "typescript"
import { importAlias, readTsconfig } from "./tsconfig.ts"

type Literal = string | number | boolean | null

/** Props that are plumbing, not design: the canvas sets classes and styles itself, and never refs or keys. */
const skipped = new Set(["className", "style", "ref", "key", "dangerouslySetInnerHTML"])
const groupOrder: PropGroup[] = ["variant", "own", "html", "aria", "event"]

/**
 * Reads each component's props from its source with the TypeScript checker: what kind of value each takes, the options
 * of literal unions and cva variants, and defaults from cva's `defaultVariants` and the component's own destructuring.
 * Uses its own TypeScript, so it works whatever version the project builds with. A `program` that already holds every
 * component's file is read instead of building one, as the desktop app keeps one per project.
 */
export function inferProps(
  root: string,
  components: Record<string, ComponentSource>,
  program: ts.Program = ts.createProgram({ rootNames: propsFiles(root, components), options: compilerOptions(root) })
): Record<string, ComponentInfo> {
  const fileOf = (source: ComponentSource) => resolve(root, source.declaration ?? source.path)
  const checker = program.getTypeChecker()
  const result: Record<string, ComponentInfo> = {}
  const variantsByFile = new Map<string, { variants: Variants; implementation: ts.SourceFile }>()
  const tsconfig = readTsconfig(root)

  const importOf = (source: ComponentSource) =>
    source.library ? source.path : importAlias(root, tsconfig, source.path)

  for (const [name, source] of Object.entries(components)) {
    const file = program.getSourceFile(fileOf(source))

    if (!file) {
      continue
    }

    let parsed = variantsByFile.get(file.fileName)

    if (!parsed) {
      const implementation = implementationOf(file)
      parsed = { variants: cvaVariants(implementation), implementation }
      variantsByFile.set(file.fileName, parsed)
    }

    const { variants, implementation } = parsed

    try {
      const read = componentProps(checker, file, source.export, variants, implementation)
      const from = importOf(source)

      if (read) {
        const { props, takesStyle } = read
        result[name] = {
          name,
          path: source.path,
          ...(from ? { import: from } : {}),
          props,
          ...(takesStyle === undefined ? {} : { takesStyle }),
          ...(setsOwnSize(implementation, source.export) ? { fixedSize: true as const } : {})
        }
      }
    } catch (error) {
      // One component the checker can't follow shouldn't cost the others their props.
      console.warn(`[props] ${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return result
}

/** The files props are read from: each component's declarations, else its source. */
export function propsFiles(root: string, components: Record<string, ComponentSource>): string[] {
  return [...new Set(Object.values(components).map((source) => resolve(root, source.declaration ?? source.path)))]
}

/**
 * Where a component's cva call is: its own source, or for a library's declaration file the compiled JavaScript beside
 * it, since declarations keep the variant types but not their order or defaults.
 */
function implementationOf(file: ts.SourceFile): ts.SourceFile {
  if (!file.isDeclarationFile) {
    return file
  }

  const script = file.fileName.replace(/\.d\.ts$/, ".js")
  const text = existsSync(script) ? ts.sys.readFile(script) : undefined

  return text ? ts.createSourceFile(script, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS) : file
}

function compilerOptions(root: string): ts.CompilerOptions {
  const fallback: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    noEmit: true
  }

  // Vite projects keep the app's settings (paths, jsx) in tsconfig.app.json, referenced from tsconfig.json.
  for (const name of ["tsconfig.app.json", "tsconfig.json"]) {
    const path = join(root, name)

    if (!existsSync(path)) {
      continue
    }

    const parsed = ts.getParsedCommandLineOfConfigFile(
      path,
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: () => undefined
      }
    )

    if (parsed?.options.jsx !== undefined || parsed?.options.paths) {
      return { ...fallback, ...parsed.options, noEmit: true, incremental: false, tsBuildInfoFile: undefined }
    }
  }

  return fallback
}

function componentProps(
  checker: ts.TypeChecker,
  file: ts.SourceFile,
  exportName: string,
  variants: Variants,
  implementation: ts.SourceFile
): { props: ComponentProp[]; takesStyle?: boolean } | undefined {
  const moduleSymbol = checker.getSymbolAtLocation(file)

  if (!moduleSymbol) {
    return undefined
  }

  let symbol = checker.getExportsOfModule(moduleSymbol).find((candidate) => candidate.name === exportName)

  if (!symbol) {
    return undefined
  }

  if (symbol.flags & ts.SymbolFlags.Alias) {
    symbol = checker.getAliasedSymbol(symbol)
  }

  const signature = checker.getTypeOfSymbolAtLocation(symbol, file).getCallSignatures()[0]
  const parameter = signature?.parameters[0]

  // A component that takes no props takes no style either.
  if (!parameter) {
    return signature ? { props: [], takesStyle: false } : { props: [] }
  }

  const propsType = checker.getTypeOfSymbolAtLocation(parameter, file)

  // A library's declarations drop the defaults its compiled JavaScript destructures, so they're read from there.
  const defaults = file.isDeclarationFile
    ? destructuredDefaults(functionNamed(implementation, symbol.name))
    : destructuredDefaults(symbol.valueDeclaration)

  const takesStyle = declaresStyle(checker, propsType)
  const toVoidElement = passesToVoidElement(checker, propsType, file)

  const props: ComponentProp[] = []

  for (const prop of checker.getPropertiesOfType(propsType)) {
    if (skipped.has(prop.name)) {
      continue
    }

    const declaration = prop.declarations?.[0]
    // React declares `children` for every element, but an `<input>` given any throws (React error 137), so a component
    // passing its props to one takes none, unless it declares its own.
    const fromReact = prop.declarations?.every((declared) => declaredBy(declared, "DOMAttributes"))

    if (prop.name === "children" && toVoidElement && fromReact) {
      continue
    }

    const type = checker.getTypeOfSymbolAtLocation(prop, file)
    const declared = declaration?.getSourceFile().fileName ?? ""
    const classified = classify(checker, type, declaration, prop.name)
    const { kind } = classified
    // A cva variant of the same name is this prop's only when its options are the prop's: one file can hold a
    // `variant` for each of its components, as Nova's sidebar.js does for the menu button but not the Sidebar.
    const variant = variants.get(prop.name)
    const isVariant = !!variant && sameOptions(variant.options, classified)
    // cva lists a variant's options in the order its author wrote them; the checker's union order is arbitrary.
    const options = isVariant ? variant.options : classified.options
    let group: PropGroup = "html"

    if (isVariant) {
      group = "variant"
    } else if (declared && !declared.includes("/node_modules/")) {
      group = "own"
    }
    // What the file declaring a library's component adds to the props it passes on, as Nova's `isActive` on a button's
    // attributes. A slot keeps its own rule below: `root` is the component itself.
    else if (declared === file.fileName && !classified.slot) {
      group = "own"
    }
    // A slot that takes content is one of the component's own parts, wherever it's declared; its root is the component.
    else if (classified.slot && kind === "node" && prop.name !== "root") {
      group = "own"
    } else if (prop.name.startsWith("aria-")) {
      group = "aria"
    } else if (kind === "function" && /^on[A-Z]/.test(prop.name)) {
      group = "event"
    }

    const entry: ComponentProp = { name: prop.name, kind, group }

    if (options) {
      entry.options = options
    }

    const fallback = defaults.get(prop.name) ?? (isVariant ? variant.default : undefined)

    if (fallback !== undefined) {
      entry.default = fallback
    }

    if (!(prop.flags & ts.SymbolFlags.Optional)) {
      entry.required = true
    }

    if (group === "variant" || group === "own") {
      // A slot's type spelled out is a long union of what it takes; it's written as the source names it.
      entry.type = classified.slot
        ? shorten(classified.slot)
        : shorten(checker.typeToString(checker.getNonNullableType(type)))
      const description = ts.displayPartsToString(prop.getDocumentationComment(checker)).trim()

      if (description) {
        entry.description = shorten(description, 240)
      }
    }

    props.push(entry)
  }

  props.sort((a, b) => {
    const byGroup = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group)

    if (byGroup !== 0) {
      return byGroup
    }

    // Variants and own props keep the source's order; pass-through attributes are easier to find alphabetically.
    return a.group === "variant" || a.group === "own" ? 0 : a.name.localeCompare(b.name)
  })

  return takesStyle === undefined ? { props } : { props, takesStyle }
}

/** The interfaces React declares a void element's own attributes in: `InputHTMLAttributes` is an `<input>`'s. */
const voidAttributes = new Set([
  "AreaHTMLAttributes",
  "BaseHTMLAttributes",
  "ColHTMLAttributes",
  "EmbedHTMLAttributes",
  "ImgHTMLAttributes",
  "InputHTMLAttributes",
  "LinkHTMLAttributes",
  "MetaHTMLAttributes",
  "SourceHTMLAttributes",
  "TrackHTMLAttributes"
])

/** The DOM interfaces of void elements, which a ref to one names: `<hr>` and `<br>` have no attributes of their own. */
const voidElement = /\bHTML(Area|Base|BR|Embed|HR|Image|Input|Link|Meta|Source|Track)Element\b/

/**
 * Whether props go to a void element, which can't have children: they include attributes only one takes, as
 * `ComponentProps<"input">` does, or a ref to one.
 */
function passesToVoidElement(checker: ts.TypeChecker, propsType: ts.Type, file: ts.SourceFile): boolean {
  const props = checker.getPropertiesOfType(propsType)

  if (props.some((prop) => prop.declarations?.some((declaration) => declaredBy(declaration, voidAttributes)))) {
    return true
  }

  const ref = props.find((prop) => prop.name === "ref")

  return !!ref && voidElement.test(checker.typeToString(checker.getTypeOfSymbolAtLocation(ref, file)))
}

/** Whether a property is declared in an interface of one of these names. */
function declaredBy(declaration: ts.Declaration | undefined, names: string | Set<string>): boolean {
  const parent = declaration?.parent

  if (!parent || !ts.isInterfaceDeclaration(parent)) {
    return false
  }

  return typeof names === "string" ? parent.name.text === names : names.has(parent.name.text)
}

/** Props types that could have any key: `any`, `unknown`, `object` and a type parameter. */
const openTypes = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.NonPrimitive | ts.TypeFlags.TypeParameter

/**
 * Whether a props type has `style`, which is where the canvas puts the sizes and styles a design sets. Unknown for a
 * type that could have any key, such as `any` or one with an index signature.
 */
function declaresStyle(checker: ts.TypeChecker, propsType: ts.Type): boolean | undefined {
  const parts = propsType.isUnion() ? propsType.types : [propsType]

  if (parts.some((part) => part.flags & openTypes)) {
    return undefined
  }

  if (parts.some((part) => checker.getIndexInfosOfType(part).length > 0)) {
    return undefined
  }

  return parts.some((part) => checker.getPropertyOfType(part, "style") !== undefined)
}

function classify(
  checker: ts.TypeChecker,
  type: ts.Type,
  declaration: ts.Declaration | undefined,
  name: string
): { kind: PropKind; options?: (string | number | boolean)[]; slot?: string } {
  const value = checker.getNonNullableType(type)
  const written = declaration && "type" in declaration ? (declaration.type as ts.TypeNode | undefined)?.getText() : ""
  const parts = value.isUnion() ? value.types : [value]
  const slot = name === "children" ? undefined : slotKind(checker, parts)

  if (slot) {
    return { kind: slot, slot: written?.startsWith("Slot<") ? written : "Slot" }
  }

  if (name === "children" || /ReactNode|ReactElement|JSX\.Element/.test(written ?? "")) {
    return { kind: "node" }
  }

  if (/ReactNode|ReactElement/.test(checker.typeToString(value))) {
    return { kind: "node" }
  }

  if (value.getCallSignatures().length > 0) {
    return { kind: "function" }
  }

  if (parts.every((part) => part.flags & ts.TypeFlags.BooleanLike)) {
    return { kind: "boolean" }
  }

  const literals = parts.map(literalOf)

  if (literals.every((literal) => literal !== undefined)) {
    return { kind: "enum", options: literals as (string | number | boolean)[] }
  }

  if (parts.every((part) => part.flags & ts.TypeFlags.StringLike)) {
    return { kind: "string" }
  }

  if (parts.every((part) => part.flags & ts.TypeFlags.NumberLike)) {
    return { kind: "number" }
  }

  if (parts.every((part) => part.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike))) {
    return { kind: "string" }
  }

  if (value.flags & ts.TypeFlags.Object) {
    return { kind: "object" }
  }

  return { kind: "unknown" }
}

/**
 * A Fluent slot (`Slot<'span'>`, `Slot<typeof Label>`): a union of the part's props, an object with `as`, and, when the
 * part takes children, shorthand content for it (text, a number, elements). One that takes content is a `node`, shown
 * as children is; one that takes only props, such as a Checkbox's `input`, is an `object`. Anything else isn't a slot.
 */
function slotKind(checker: ts.TypeChecker, parts: readonly ts.Type[]): "node" | "object" | undefined {
  const partProps = (part: ts.Type) =>
    part.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection) &&
    part.getCallSignatures().length === 0 &&
    checker.getPropertyOfType(part, "as") !== undefined

  if (!parts.some(partProps)) {
    return undefined
  }

  const content = parts.some(
    (part) =>
      !partProps(part) &&
      (part.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike) ||
        /ReactElement|ReactNode|ReactPortal|Iterable/.test(checker.typeToString(part)))
  )

  return content ? "node" : "object"
}

function literalOf(type: ts.Type): string | number | boolean | undefined {
  if (type.isStringLiteral() || type.isNumberLiteral()) {
    return type.value
  }

  if (type.flags & ts.TypeFlags.BooleanLiteral) {
    return (type as { intrinsicName?: string }).intrinsicName === "true"
  }

  return undefined
}

/** cva variants by name: their options in source order, and their defaults. */
type Variants = Map<string, { options: string[]; default?: Literal }>

/**
 * Variants declared by cva calls in a file, with their options and defaults: `cva(base, { variants: {...},
 * defaultVariants: {...} })`.
 */
function cvaVariants(file: ts.SourceFile): Variants {
  const found: Variants = new Map()

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === "cva") {
      const config = node.arguments[1]

      if (config && ts.isObjectLiteralExpression(config)) {
        const variants = property(config, "variants")

        if (variants && ts.isObjectLiteralExpression(variants)) {
          for (const entry of variants.properties) {
            const name = entry.name && propertyName(entry.name)

            if (!name || found.has(name) || !ts.isPropertyAssignment(entry)) {
              continue
            }

            const values = entry.initializer

            const options = ts.isObjectLiteralExpression(values)
              ? values.properties.flatMap((option) => {
                  const key = option.name && propertyName(option.name)

                  return key ? [key] : []
                })
              : []

            found.set(name, { options })
          }
        }

        const defaults = property(config, "defaultVariants")

        if (defaults && ts.isObjectLiteralExpression(defaults)) {
          for (const entry of defaults.properties) {
            const name = entry.name && propertyName(entry.name)
            const variant = name ? found.get(name) : undefined
            const value = ts.isPropertyAssignment(entry) ? literalValue(entry.initializer) : undefined

            if (variant && value !== undefined) {
              variant.default = value
            }
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(file)

  return found
}

/** Whether a cva variant's options are a prop's: always, unless the prop's type is a set of other values. */
function sameOptions(options: string[], prop: { kind: PropKind; options?: (string | number | boolean)[] }): boolean {
  if (prop.kind !== "enum" || !prop.options) {
    return true
  }

  const own = new Set(prop.options.map(String))

  return own.size === options.length && options.every((option) => own.has(option))
}

/** A function or a variable holding one, declared at the top of a file under this name. */
function functionNamed(file: ts.SourceFile, name: string): ts.Node | undefined {
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement
    }

    if (ts.isVariableStatement(statement)) {
      const found = statement.declarationList.declarations.find(
        (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name
      )

      if (found) {
        return found
      }
    }
  }

  return undefined
}

/** Defaults the component gives props as it destructures them: `function Button({ size = "default", ...props })`. */
function destructuredDefaults(found: ts.Node | undefined): Map<string, Literal> {
  const defaults = new Map<string, Literal>()
  let declaration: ts.Node | undefined = found

  if (declaration && ts.isVariableDeclaration(declaration)) {
    declaration = declaration.initializer
  }

  // forwardRef(...) and memo(...) wrap the function that does the destructuring.
  while (declaration && ts.isCallExpression(declaration)) {
    declaration = declaration.arguments[0]
  }

  if (!declaration || !(ts.isFunctionLike(declaration) && "parameters" in declaration)) {
    return defaults
  }

  const binding = declaration.parameters[0]?.name

  if (!binding || !ts.isObjectBindingPattern(binding)) {
    return defaults
  }

  for (const element of binding.elements) {
    if (!element.initializer || element.dotDotDotToken) {
      continue
    }

    const name = element.propertyName ? propertyName(element.propertyName) : element.name.getText()
    const value = literalValue(element.initializer)

    if (name && value !== undefined) {
      defaults.set(name, value)
    }
  }

  return defaults
}

/**
 * Whether a component's own element sets its size, so text put inside is cut off or spills out rather than sizing it
 * (PAR-518). It's read from the classes the component writes on the outermost element it returns, in its source or a
 * library's compiled JavaScript, by Tailwind's names: a width (`size-8`, `w-10`, `w-(--sidebar-width)`), a height under
 * a line of text (`h-px`), or `@container`, whose width doesn't come from what's inside. Classes for its own states
 * (`data-horizontal:h-px`) count; ones it takes from elsewhere (`group-data-[size=sm]/avatar:size-6`) or that style what's
 * inside it (`[&_svg]:size-4`) don't.
 */
function setsOwnSize(file: ts.SourceFile, name: string): boolean {
  const root = returnedElement(declaredFunction(file, name))

  if (!root) {
    return false
  }

  const classes = classNameOf(root)

  if (!classes) {
    return false
  }

  const texts: string[] = []

  const collect = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node)) {
      texts.push(node.text)
    }

    node.forEachChild(collect)
  }

  collect(classes)

  return texts.join(" ").split(/\s+/).some(sizingClass)
}

/** The function a file declares under a name: `function Avatar(...)`, or a const holding one, through `forwardRef(...)`. */
function declaredFunction(file: ts.SourceFile, name: string): ts.FunctionLikeDeclaration | undefined {
  for (const statement of file.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
      return statement
    }

    if (!ts.isVariableStatement(statement)) {
      continue
    }

    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) {
        continue
      }

      let value = declaration.initializer

      while (value && ts.isCallExpression(value)) {
        value = value.arguments[0]
      }

      if (value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
        return value
      }
    }
  }

  return undefined
}

/** The element a function returns at its top level, as JSX or a compiled `jsx(...)` call. */
function returnedElement(fn: ts.FunctionLikeDeclaration | undefined): ts.Expression | undefined {
  const body = fn?.body

  if (!body) {
    return undefined
  }

  let returned: ts.Expression | undefined = ts.isBlock(body)
    ? body.statements.find((statement): statement is ts.ReturnStatement => ts.isReturnStatement(statement))?.expression
    : body

  while (returned && ts.isParenthesizedExpression(returned)) {
    returned = returned.expression
  }

  return returned
}

/** The expression an element's `className` is given, in JSX or in a compiled `jsx(tag, { className })` call. */
function classNameOf(element: ts.Expression): ts.Node | undefined {
  if (ts.isJsxElement(element) || ts.isJsxSelfClosingElement(element)) {
    const opening = ts.isJsxElement(element) ? element.openingElement : element

    const attribute = opening.attributes.properties.find(
      (entry): entry is ts.JsxAttribute =>
        ts.isJsxAttribute(entry) && ts.isIdentifier(entry.name) && entry.name.text === "className"
    )

    return attribute?.initializer
  }

  const callee = ts.isCallExpression(element) ? element.expression : undefined

  if (ts.isCallExpression(element) && callee && ts.isIdentifier(callee) && /^_?jsxs?$|^jsxDEV$/.test(callee.text)) {
    const props = element.arguments[1]

    return props && ts.isObjectLiteralExpression(props) ? property(props, "className") : undefined
  }

  return undefined
}

/** A length a width can be set to: a step of the scale, `px`, a bracketed length that isn't a percentage, or a variable. */
const fixedLength = /^(\d+(\.\d+)?|px|\[[^\]%]+\]|\(--[\w-]+\))$/

/** Whether a Tailwind class sets the element's own size, as `setsOwnSize` describes. */
function sizingClass(token: string): boolean {
  // Variants are split at colons outside brackets: `data-[size=lg]:size-10`.
  const parts = token.replace(/^!/, "").split(/:(?![^[]*\])/)
  const utility = parts.pop() ?? ""

  if (!parts.every((variant) => /^(data|aria)-/.test(variant))) {
    return false
  }

  if (/^@container(\/|$)/.test(utility)) {
    return true
  }

  const [, axis, value] = /^(size|w|h)-(.+)$/.exec(utility) ?? []

  if (!axis || !value || !fixedLength.test(value)) {
    return false
  }

  // A height holds text unless it's under a line: 16px, step 4.
  return axis !== "h" || value === "px" || Number(value) < 4
}

function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const entry of object.properties) {
    if (ts.isPropertyAssignment(entry) && entry.name && propertyName(entry.name) === name) {
      return entry.initializer
    }
  }

  return undefined
}

function propertyName(name: ts.PropertyName | ts.BindingName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }

  return undefined
}

function literalValue(expression: ts.Expression): Literal | undefined {
  if (ts.isStringLiteralLike(expression)) {
    return expression.text
  }

  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text)
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null
  }

  return undefined
}

function shorten(text: string, length = 80): string {
  const flat = text.replaceAll(/\s+/g, " ")

  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat
}
