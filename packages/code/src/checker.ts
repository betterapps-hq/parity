import { createHash } from "node:crypto"
import { basename, dirname, join, relative } from "node:path"
import type { ComponentEvidence } from "@parity/core"
import ts from "typescript"

/** A component the type checker found, and why it counts as one. */
export interface FoundComponent {
  /** What it's imported by: an export, or `Namespace.Member`. */
  name: string
  as: ComponentEvidence
  /** The file that declares it. */
  file: string
  /** Its family in the Components panel: its namespace, else its file or package. */
  group: string
  /** Props it can't render without. Icons have none. */
  requiredProps: string[]
  /** Its type as written, which an icon set's icons share. */
  type: string
  /** The scanned file it's exported from, which can differ from the one that declares it. */
  entry: string
  /** The export it's imported by from `entry`: its name, `default`, or `Namespace.Member`. */
  export: string
  /** Its own props, each with a short hash of its type and `?` after an optional one's name. */
  props: Record<string, string>
  /** A hash of what it was found as and its own props: a change in either changes it. */
  fingerprint: string
  /** Values for the props it can't render without, where the type says what one looks like. */
  samples: Record<string, unknown>
}

export interface ComponentReport {
  components: FoundComponent[]
  /** Exports that may be components, but whose types can't say, with why; in an app, the file exporting them. */
  ambiguous: { name: string; reason: string; entry?: string }[]
  /** Capitalised values that aren't components, with why. Types and lowercase helpers aren't listed. */
  rejected: { name: string; reason: string; entry?: string }[]
  /** Whether React's types were found. Without them, return types are judged by their names. */
  reactTypes: boolean
}

export interface ComponentScan {
  /** Files whose exports are read: a package's type entry, or an app's source files. */
  entries: string[]
  /** Where module resolution starts, for React's types. */
  root: string
  /** Settings for reading an app's source; a package's declarations need none. */
  compilerOptions?: ts.CompilerOptions
  /** Whether a default export counts, named after its declaration or its file. Apps say yes; packages, no. */
  defaultExports?: boolean
  /**
   * A program to read them from instead of building one, as the desktop app keeps one per project. Made with
   * `componentOptions` and a host from `withReactProbe`, it holds `entries` and `reactProbe(root)`.
   */
  program?: ts.Program
}

const probeName = "__parity_probe__.ts"
const probeText = 'import type { ReactNode } from "react"\nexport type ParityNode = ReactNode\n'

/** The settings components are read with: the scan's own over ones that read JSX, JavaScript and modern modules. */
export function componentOptions(compilerOptions?: ts.CompilerOptions): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    allowJs: true,
    types: [],
    ...compilerOptions,
    incremental: false
  }
}

/** A file only the checker sees, naming React's `ReactNode` so it can tell what React renders. */
export function reactProbe(root: string): string {
  return slashes(join(root, probeName))
}

/** A compiler host that also serves `reactProbe(root)`. */
export function withReactProbe(host: ts.CompilerHost, root: string): ts.CompilerHost {
  const probe = reactProbe(root)
  const { getSourceFile, fileExists, readFile } = host
  host.getSourceFile = (fileName, language, onError, create) =>
    slashes(fileName) === probe
      ? ts.createSourceFile(fileName, probeText, language, true)
      : getSourceFile.call(host, fileName, language, onError, create)
  host.fileExists = (fileName) => slashes(fileName) === probe || fileExists.call(host, fileName)
  host.readFile = (fileName) => (slashes(fileName) === probe ? probeText : readFile.call(host, fileName))
  return host
}

/**
 * Finds the components a package or an app exports, by asking TypeScript what each export is, as
 * `proposals/component-detection.md` describes: a capitalised function taking one props object (or nothing) and
 * returning something React renders, or a `forwardRef`, `memo` or `lazy` result, or a class with `render` and `props`.
 * Members of namespace exports count too, as `Dialog.Root`.
 */
export function findComponents(scan: ComponentScan): ComponentReport {
  const probe = reactProbe(scan.root)
  const program =
    scan.program ??
    (() => {
      const options = componentOptions(scan.compilerOptions)
      const host = withReactProbe(ts.createCompilerHost(options, true), scan.root)
      return ts.createProgram({ rootNames: [...scan.entries, probe], options, host })
    })()
  const checker = program.getTypeChecker()
  const node = reactNodeType(checker, program.getSourceFile(probe))
  const report: ComponentReport = { components: [], ambiguous: [], rejected: [], reactTypes: node !== undefined }
  const verdicts = new Map<ts.Type, Verdict>()
  const seen = new Map<ts.Symbol, FoundComponent>()

  const visit = (name: string, symbol: ts.Symbol, from: { entry: string; export: string }, namespace?: string) => {
    const short = name.slice(name.lastIndexOf(".") + 1)
    if (!/^[A-Z]/.test(short) || !(symbol.flags & ts.SymbolFlags.Value)) return
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0]
    if (!declaration) return
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)
    let verdict = verdicts.get(type)
    if (!verdict) {
      verdict = judge(checker, type, node)
      // Icon sets give thousands of exports one shared type; judging it once keeps them fast.
      if (!(type.flags & ts.TypeFlags.Any)) verdicts.set(type, verdict)
    }
    // An app's left-out exports say which file they're in, so each file's can be looked up.
    const where = scan.defaultExports ? { entry: from.entry } : {}
    if ("ambiguous" in verdict) return void report.ambiguous.push({ name, reason: verdict.ambiguous, ...where })
    if ("not" in verdict) return void report.rejected.push({ name, reason: verdict.not, ...where })
    const existing = seen.get(symbol)
    // One component exported under several names (Lucide's `Heart`, `HeartIcon` and `LucideHeart`) is listed once. Of
    // an app's files, the one declaring it wins over an index that re-exports it, as the parse lists it there too.
    if (existing) {
      const declaredIn = (entry: string) => slashes(entry) === slashes(declaration.getSourceFile().fileName)
      const switches =
        scan.defaultExports && declaredIn(from.entry) !== declaredIn(existing.entry)
          ? declaredIn(from.entry)
          : preferred(name, existing.name, namespace)
      if (switches) Object.assign(existing, { name, ...from })
      return
    }
    const file = declaration.getSourceFile().fileName
    const props = verdict.props ? ownProps(checker, verdict.props) : {}
    const found: FoundComponent = {
      name,
      as: verdict.as,
      file,
      group: namespace ?? groupOf(file, short),
      requiredProps: verdict.requiredProps,
      type: checker.typeToString(type),
      ...from,
      props,
      fingerprint: hash(
        [
          verdict.as,
          ...Object.entries(props)
            .map(([prop, kind]) => `${prop}:${kind}`)
            .sort()
        ].join("|")
      ),
      samples: verdict.props ? samplesFor(checker, verdict.props, verdict.requiredProps) : {}
    }
    seen.set(symbol, found)
    report.components.push(found)
  }

  for (const entry of scan.entries) {
    const file = program.getSourceFile(entry)
    const moduleSymbol = file && checker.getSymbolAtLocation(file)
    if (!moduleSymbol) continue
    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      let name = exported.name
      if (name === "default") {
        if (!scan.defaultExports) continue
        name = defaultExportName(target, entry)
      }
      if (isNamespace(target)) {
        if (!/^[A-Z]/.test(name)) continue
        for (const member of checker.getExportsOfModule(target)) {
          const resolved = member.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(member) : member
          visit(`${name}.${member.name}`, resolved, { entry, export: `${exported.name}.${member.name}` }, name)
        }
      } else visit(name, target, { entry, export: exported.name })
    }
  }
  // Older Radix types declare `Accordion.AccordionItem` apart from `Accordion.Item`, so they aren't one symbol; the
  // part keeps its short name, as it does when they are.
  const names = new Set(report.components.map((component) => component.name))
  report.components = report.components.filter((component) => {
    const dot = component.name.lastIndexOf(".")
    if (dot === -1) return true
    const namespace = component.name.slice(0, dot).split(".").at(-1)!
    const member = component.name.slice(dot + 1)
    if (!member.startsWith(namespace)) return true
    // `Accordion.Accordion` is its Root.
    return !names.has(`${component.name.slice(0, dot)}.${member.slice(namespace.length) || "Root"}`)
  })
  report.components.sort((a, b) => a.name.localeCompare(b.name, "en"))
  return report
}

type Verdict =
  | { as: ComponentEvidence; requiredProps: string[]; props?: ts.Type }
  | { ambiguous: string }
  | { not: string }

function judge(checker: ts.TypeChecker, type: ts.Type, node: ts.Type | undefined): Verdict {
  if (type.flags & ts.TypeFlags.Any) return { ambiguous: "its type is any, so it can't be told apart from a helper" }
  const written = checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation)
  // A context renders as its own provider in React 19, but it holds a value; it isn't something to place.
  if (type.getProperty("Provider") && type.getProperty("Consumer")) {
    return { not: "a context, which passes a value down rather than drawing anything" }
  }
  // forwardRef, memo and lazy return objects React recognises by `$$typeof`.
  if (type.getProperty("$$typeof")) {
    const as: ComponentEvidence = /ForwardRef/.test(written)
      ? "forwardRef"
      : /Memo|NamedExotic/.test(written)
        ? "memo"
        : /Lazy/.test(written)
          ? "lazy"
          : "exotic"
    return { as, ...propsOf(checker, type.getCallSignatures()[0]) }
  }
  const constructs = type.getConstructSignatures()
  if (constructs.length > 0) {
    const instance = constructs[0]!.getReturnType()
    if (instance.getProperty("render") && instance.getProperty("props")) {
      const props = instance.getProperty("props")!
      const propsType = checker.getTypeOfSymbol(props)
      return { as: "class", requiredProps: required(checker, propsType), props: propsType }
    }
    return { not: "a class without React's `render` and `props`" }
  }
  const calls = type.getCallSignatures()
  if (calls.length === 0) return { not: "not a function" }
  for (const signature of calls) {
    const parameters = signature.getParameters()
    const needed = parameters.filter((parameter) => isRequired(parameter))
    if (needed.length > 1) return { not: `takes ${needed.length} arguments, not one props object` }
    const first = parameters[0]
    if (first) {
      const propsType = checker.getTypeOfSymbol(first)
      if (isPrimitive(propsType)) return { not: `takes ${checker.typeToString(propsType)}, not props` }
    }
    const returned = signature.getReturnType()
    if (returned.flags & ts.TypeFlags.Any) {
      return { ambiguous: "returns any, so whether React can render it isn't known" }
    }
    if (node) {
      // `React.FC` returns `ReactNode | Promise<ReactNode>`, for async components; what it resolves to is what counts.
      const awaited = checker.getAwaitedType(returned) ?? returned
      if (!checker.isTypeAssignableTo(awaited, node)) {
        return { not: `returns ${shorten(checker.typeToString(returned))}, which React doesn't render` }
      }
      if (isPrimitive(returned)) return { not: `returns ${checker.typeToString(returned)} only` }
    } else if (!/Element|ReactNode|ReactPortal|null/.test(checker.typeToString(returned))) {
      return { ambiguous: "React's types aren't installed, and its return type doesn't look like an element" }
    }
  }
  return { as: "function", ...propsOf(checker, calls[0]) }
}

function propsOf(
  checker: ts.TypeChecker,
  signature: ts.Signature | undefined
): { requiredProps: string[]; props?: ts.Type } {
  const first = signature?.getParameters()[0]
  if (!first) return { requiredProps: [] }
  const props = checker.getTypeOfSymbol(first)
  return { requiredProps: required(checker, props), props }
}

function required(checker: ts.TypeChecker, type: ts.Type): string[] {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return []
  // A union of prop shapes (one per variant) needs only what every shape needs.
  const shapes = type.isUnion() ? type.types : [type]
  const per = shapes.map((shape) =>
    checker
      .getPropertiesOfType(shape)
      .filter((property) => !(property.flags & ts.SymbolFlags.Optional))
      .map((property) => property.name)
  )
  return per.reduce((all, names) => all.filter((name) => names.includes(name)))
}

function isRequired(parameter: ts.Symbol): boolean {
  const declaration = parameter.valueDeclaration
  if (!declaration || !ts.isParameter(declaration)) return true
  return !declaration.questionToken && !declaration.initializer && !declaration.dotDotDotToken
}

const primitive =
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.ESSymbolLike |
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Void

function isPrimitive(type: ts.Type): boolean {
  const parts = type.isUnion() ? type.types : [type]
  return parts.every((part) => (part.flags & primitive) !== 0)
}

function isNamespace(symbol: ts.Symbol): boolean {
  const valueKinds = ts.SymbolFlags.Function | ts.SymbolFlags.Variable | ts.SymbolFlags.Class
  return (symbol.flags & ts.SymbolFlags.ValueModule) !== 0 && (symbol.flags & valueKinds) === 0
}

function reactNodeType(checker: ts.TypeChecker, probe: ts.SourceFile | undefined): ts.Type | undefined {
  const moduleSymbol = probe && checker.getSymbolAtLocation(probe)
  const alias = moduleSymbol && checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === "ParityNode")
  if (!alias) return undefined
  const type = checker.getDeclaredTypeOfSymbol(alias)
  // Without React's types the alias is an error type, which is any.
  return type.flags & ts.TypeFlags.Any ? undefined : type
}

/**
 * Which of two names for one component to keep: a namespace's member over its flat twin (`Dialog.Root`, not
 * `DialogRoot`); inside a namespace, the one that doesn't repeat it (`Dialog.Root`, not `Dialog.Dialog`); otherwise
 * the shorter (`Heart`, not `LucideHeart`).
 */
function preferred(candidate: string, current: string, namespace: string | undefined): boolean {
  // Chakra exports both `Dialog.Root` and `DialogRoot`; its docs, like Base UI's, use the namespace.
  if (candidate.replace(".", "") === current.replace(".", "")) return candidate.includes(".")
  if (namespace) {
    const repeats = (name: string) => name.slice(namespace.length + 1).startsWith(namespace)
    if (repeats(current) !== repeats(candidate)) return repeats(current)
  }
  return candidate.length < current.length || (candidate.length === current.length && candidate < current)
}

const buildFolders = new Set(["dist", "lib", "esm", "cjs", "types", "src", "build", "es", "node", "browser"])

/**
 * A component's family, from where it's declared: its file (`Button/Button.d.ts` is Button), or for a file named
 * `index`, its package or folder, as Fluent's `@fluentui/react-button` is Button.
 */
export function groupOf(file: string, fallback: string): string {
  const name = basename(file).replace(/(\.d)?\.[cm]?[jt]sx?$/, "")
  if (name !== "index") return pascal(name)
  let folder = dirname(file)
  while (buildFolders.has(basename(folder)) && dirname(folder) !== folder) folder = dirname(folder)
  const base = basename(folder).replace(/^react-/, "")
  return base ? pascal(base) : fallback
}

function pascal(name: string): string {
  return name
    .split(/[-_.]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("")
}

function defaultExportName(symbol: ts.Symbol, entry: string): string {
  const declared = symbol.valueDeclaration && ts.getNameOfDeclaration(symbol.valueDeclaration)
  if (declared && ts.isIdentifier(declared) && /^[A-Z]/.test(declared.text)) return declared.text
  return pascal(basename(entry).replace(/\.[cm]?[jt]sx?$/, ""))
}

function shorten(text: string, length = 60): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

function slashes(path: string): string {
  return path.replaceAll("\\", "/")
}

/** A path relative to a folder, with forward slashes. */
export function relativePath(from: string, to: string): string {
  return slashes(relative(from, to))
}

/**
 * A component's own props: those its package declares, not the HTML attributes and React props it passes on, which
 * every component shares and which would make every fingerprint change with React's types.
 */
function ownProps(checker: ts.TypeChecker, type: ts.Type): Record<string, string> {
  const props: Record<string, string> = {}
  for (const property of checker.getPropertiesOfType(type)) {
    const declared = property.declarations?.[0]?.getSourceFile().fileName ?? ""
    if (/[/\\]@types[/\\]react|[/\\]typescript[/\\]lib[/\\]/.test(declared)) continue
    const written = checker.typeToString(checker.getTypeOfSymbol(property), undefined, ts.TypeFormatFlags.NoTruncation)
    const optional = property.flags & ts.SymbolFlags.Optional ? "?" : ""
    props[`${property.name}${optional}`] = hash(written).slice(0, 6)
  }
  return Object.fromEntries(Object.entries(props).sort(([a], [b]) => a.localeCompare(b, "en")))
}

/**
 * Sample values for required props, from their types: the first of a set of strings, a word for a string or a
 * node, a number, `true`, or an empty list. A function or an object is left out, since a sample can't say what it does.
 */
function samplesFor(checker: ts.TypeChecker, type: ts.Type, required: string[]): Record<string, unknown> {
  const samples: Record<string, unknown> = {}
  for (const name of required) {
    const property = type.getProperty(name)
    if (!property) continue
    const value = sampleOf(checker, checker.getNonNullableType(checker.getTypeOfSymbol(property)), name)
    if (value !== undefined) samples[name] = value
  }
  return samples
}

function sampleOf(checker: ts.TypeChecker, type: ts.Type, name: string): unknown {
  const parts = type.isUnion() ? type.types : [type]
  const literal = parts.find((part) => part.isStringLiteral())
  if (literal?.isStringLiteral()) return literal.value
  if (parts.some((part) => part.flags & ts.TypeFlags.String)) return /src|href|url/i.test(name) ? "#" : "Text"
  if (parts.some((part) => part.flags & ts.TypeFlags.Number)) return 1
  if (parts.some((part) => part.flags & ts.TypeFlags.BooleanLike)) return true
  if (parts.some((part) => checker.isArrayType(part))) return []
  // A node, which takes text: `children`, `label`, `title` and the like.
  if (/ReactNode|ReactElement|Element\b/.test(checker.typeToString(type))) return "Text"
  return undefined
}

function hash(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 8)
}
