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
  const variantsByFile = new Map<string, Variants>()
  const tsconfig = readTsconfig(root)
  const importOf = (source: ComponentSource) =>
    source.library ? source.path : importAlias(root, tsconfig, source.path)

  for (const [name, source] of Object.entries(components)) {
    const file = program.getSourceFile(fileOf(source))
    if (!file) continue
    let variants = variantsByFile.get(file.fileName)
    if (!variants) {
      variants = cvaVariants(implementationOf(file))
      variantsByFile.set(file.fileName, variants)
    }
    try {
      const read = componentProps(checker, file, source.export, variants)
      const from = importOf(source)
      if (read) {
        const { props, takesStyle } = read
        result[name] = {
          name,
          path: source.path,
          ...(from ? { import: from } : {}),
          props,
          ...(takesStyle === undefined ? {} : { takesStyle })
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
  if (!file.isDeclarationFile) return file
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
    if (!existsSync(path)) continue
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
  variants: Variants
): { props: ComponentProp[]; takesStyle?: boolean } | undefined {
  const moduleSymbol = checker.getSymbolAtLocation(file)
  if (!moduleSymbol) return undefined
  let symbol = checker.getExportsOfModule(moduleSymbol).find((candidate) => candidate.name === exportName)
  if (!symbol) return undefined
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
  const signature = checker.getTypeOfSymbolAtLocation(symbol, file).getCallSignatures()[0]
  const parameter = signature?.parameters[0]
  // A component that takes no props takes no style either.
  if (!parameter) return signature ? { props: [], takesStyle: false } : { props: [] }
  const propsType = checker.getTypeOfSymbolAtLocation(parameter, file)
  const defaults = destructuredDefaults(symbol)
  const takesStyle = declaresStyle(checker, propsType)

  const props: ComponentProp[] = []
  for (const prop of checker.getPropertiesOfType(propsType)) {
    if (skipped.has(prop.name)) continue
    const type = checker.getTypeOfSymbolAtLocation(prop, file)
    const declaration = prop.declarations?.[0]
    const declared = declaration?.getSourceFile().fileName ?? ""
    const classified = classify(checker, type, declaration, prop.name)
    const { kind } = classified
    // cva lists a variant's options in the order its author wrote them; the checker's union order is arbitrary.
    const options = variants.has(prop.name)
      ? (variants.get(prop.name)?.options ?? classified.options)
      : classified.options
    const group: PropGroup = variants.has(prop.name)
      ? "variant"
      : declared && !declared.includes("/node_modules/")
        ? "own"
        : prop.name.startsWith("aria-")
          ? "aria"
          : kind === "function" && /^on[A-Z]/.test(prop.name)
            ? "event"
            : "html"
    const entry: ComponentProp = { name: prop.name, kind, group }
    if (options) entry.options = options
    const fallback = defaults.get(prop.name) ?? variants.get(prop.name)?.default
    if (fallback !== undefined) entry.default = fallback
    if (!(prop.flags & ts.SymbolFlags.Optional)) entry.required = true
    if (group === "variant" || group === "own") {
      entry.type = shorten(checker.typeToString(checker.getNonNullableType(type)))
      const description = ts.displayPartsToString(prop.getDocumentationComment(checker)).trim()
      if (description) entry.description = shorten(description, 240)
    }
    props.push(entry)
  }
  props.sort((a, b) => {
    const byGroup = groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group)
    if (byGroup !== 0) return byGroup
    // Variants and own props keep the source's order; pass-through attributes are easier to find alphabetically.
    return a.group === "variant" || a.group === "own" ? 0 : a.name.localeCompare(b.name)
  })
  return takesStyle === undefined ? { props } : { props, takesStyle }
}

/** Props types that could have any key: `any`, `unknown`, `object` and a type parameter. */
const openTypes = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.NonPrimitive | ts.TypeFlags.TypeParameter

/**
 * Whether a props type has `style`, which is where the canvas puts the sizes and styles a design sets. Unknown for a
 * type that could have any key, such as `any` or one with an index signature.
 */
function declaresStyle(checker: ts.TypeChecker, propsType: ts.Type): boolean | undefined {
  const parts = propsType.isUnion() ? propsType.types : [propsType]
  if (parts.some((part) => part.flags & openTypes)) return undefined
  if (parts.some((part) => checker.getIndexInfosOfType(part).length > 0)) return undefined
  return parts.some((part) => checker.getPropertyOfType(part, "style") !== undefined)
}

function classify(
  checker: ts.TypeChecker,
  type: ts.Type,
  declaration: ts.Declaration | undefined,
  name: string
): { kind: PropKind; options?: (string | number | boolean)[] } {
  const value = checker.getNonNullableType(type)
  const written = declaration && "type" in declaration ? (declaration.type as ts.TypeNode | undefined)?.getText() : ""
  if (name === "children" || /ReactNode|ReactElement|JSX\.Element/.test(written ?? "")) return { kind: "node" }
  if (/ReactNode|ReactElement/.test(checker.typeToString(value))) return { kind: "node" }
  if (value.getCallSignatures().length > 0) return { kind: "function" }

  const parts = value.isUnion() ? value.types : [value]
  if (parts.every((part) => part.flags & ts.TypeFlags.BooleanLike)) return { kind: "boolean" }
  const literals = parts.map(literalOf)
  if (literals.every((literal) => literal !== undefined)) {
    return { kind: "enum", options: literals as (string | number | boolean)[] }
  }
  if (parts.every((part) => part.flags & ts.TypeFlags.StringLike)) return { kind: "string" }
  if (parts.every((part) => part.flags & ts.TypeFlags.NumberLike)) return { kind: "number" }
  if (parts.every((part) => part.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike))) {
    return { kind: "string" }
  }
  if (value.flags & ts.TypeFlags.Object) return { kind: "object" }
  return { kind: "unknown" }
}

function literalOf(type: ts.Type): string | number | boolean | undefined {
  if (type.isStringLiteral() || type.isNumberLiteral()) return type.value
  if (type.flags & ts.TypeFlags.BooleanLiteral) return (type as { intrinsicName?: string }).intrinsicName === "true"
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
            if (!name || found.has(name) || !ts.isPropertyAssignment(entry)) continue
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
            if (variant && value !== undefined) variant.default = value
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

/** Defaults the component gives props as it destructures them: `function Button({ size = "default", ...props })`. */
function destructuredDefaults(symbol: ts.Symbol): Map<string, Literal> {
  const defaults = new Map<string, Literal>()
  let declaration: ts.Node | undefined = symbol.valueDeclaration
  if (declaration && ts.isVariableDeclaration(declaration)) declaration = declaration.initializer
  // forwardRef(...) and memo(...) wrap the function that does the destructuring.
  while (declaration && ts.isCallExpression(declaration)) declaration = declaration.arguments[0]
  if (!declaration || !(ts.isFunctionLike(declaration) && "parameters" in declaration)) return defaults
  const binding = declaration.parameters[0]?.name
  if (!binding || !ts.isObjectBindingPattern(binding)) return defaults
  for (const element of binding.elements) {
    if (!element.initializer || element.dotDotDotToken) continue
    const name = element.propertyName ? propertyName(element.propertyName) : element.name.getText()
    const value = literalValue(element.initializer)
    if (name && value !== undefined) defaults.set(name, value)
  }
  return defaults
}

function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const entry of object.properties) {
    if (ts.isPropertyAssignment(entry) && entry.name && propertyName(entry.name) === name) return entry.initializer
  }
  return undefined
}

function propertyName(name: ts.PropertyName | ts.BindingName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function literalValue(expression: ts.Expression): Literal | undefined {
  if (ts.isStringLiteralLike(expression)) return expression.text
  if (ts.isNumericLiteral(expression)) return Number(expression.text)
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null
  return undefined
}

function shorten(text: string, length = 80): string {
  const flat = text.replaceAll(/\s+/g, " ")
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat
}
