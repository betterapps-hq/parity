import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  API,
  type Checker,
  type DocumentPosition,
  NodeBuilderFlags,
  type Project,
  SignatureKind,
  type Symbol as TypeSymbol,
  SymbolFlags,
  type Type,
  TypeFlags
} from "typescript/unstable/sync"

/** Where the snippet API is declared, from the repository root. */
const declaredIn = "packages/agent/src/snippet-api.ts"

/**
 * Files whose top-level types the reference calls by name wherever they appear, even inside a type the code infers,
 * from the repository root.
 */
const namedIn = [
  declaredIn,
  "packages/agent/src/arguments.ts",
  "packages/agent/src/types.ts",
  "packages/core/src/document.ts",
  "packages/core/src/modes.ts"
]

/** The document format, which document.md describes: the reference names its types without spelling them out. */
const formatIn = "packages/core/src/document.ts"

/** Other types the reference leaves to document.md, by name. */
const leftToDocument = new Set(["PatchStyle"])

/** The issues code comments cite, as ` (PAR-886)`, which mean nothing to agents. */
const issues = / \((?:PAR|CAN)-\d+(?:, (?:PAR|CAN)-\d+)*\)/g

// The flags are distinct bits, so adding them sets both.
const printFlags = NodeBuilderFlags.NoTruncation + NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope

/**
 * The snippet API reference agents read (`packages/cli/skills/reference.md`), generated with TypeScript's checker from
 * `SnippetApi` and every type its functions name, so it says what the code does (PAR-958). `root` is the repository's.
 */
export function snippetReference(root: string): string {
  const api = new API({ cwd: root })

  try {
    const snapshot = api.updateSnapshot({ openProjects: [join(root, "tsconfig.json")] })
    const project = snapshot.getDefaultProjectForFile(join(root, declaredIn))

    if (!project) {
      throw new Error(`${declaredIn} isn't in the repository's TypeScript project`)
    }

    return new Reference(project, root).markdown()
  } finally {
    api.close()
  }
}

class Reference {
  private readonly project: Project
  private readonly checker: Checker
  private readonly file: string
  private readonly format: string
  private readonly sources = new Map<string, string>()
  /** Named types by the id of the type each declares, so a type the code infers can call them by name. */
  private readonly named = new Map<number, TypeSymbol>()
  private readonly queued: TypeSymbol[] = []
  private readonly seen = new Set<TypeSymbol["id"]>()
  private readonly leftOut = new Set<string>()

  constructor(project: Project, root: string) {
    this.project = project
    this.checker = project.checker
    this.file = join(root, declaredIn)
    this.format = join(root, formatIn).replaceAll("\\", "/").toLowerCase()

    for (const path of namedIn.map((each) => join(root, each))) {
      for (const [, name] of this.source(path).matchAll(/^(?:export )?(?:type|interface) ([A-Z]\w*)/gm)) {
        const symbol = this.resolve(name!, { document: path, position: 0 })

        if (symbol) {
          this.named.set(this.checker.getDeclaredTypeOfSymbol(symbol).id, symbol)
        }
      }
    }
  }

  markdown(): string {
    const declared = this.source(this.file)
    const at = declared.indexOf("interface SnippetApi")
    const symbol = this.checker.getSymbolAtPosition(this.file, at + "interface ".length)

    if (!symbol) {
      throw new Error(`No SnippetApi interface in ${declaredIn}`)
    }

    const groups = new Map<string, string[]>()

    for (const member of this.checker.getPropertiesOfType(this.checker.getDeclaredTypeOfSymbol(symbol))) {
      const category = this.checker.getJsDocTagsOfSymbol(member).find((tag) => tag.name === "category")?.text ?? "Other"
      const entry = this.member(member)
      groups.set(category, [...(groups.get(category) ?? []), entry])
      this.collect(entry, { document: this.file, position: at })
    }

    const types: string[] = []

    for (let next = this.queued.shift(); next; next = this.queued.shift()) {
      types.push(`### ${next.name}`, "", "```ts", this.spell(next), "```", "")
    }

    const left = [...this.leftOut].sort().map((name) => `\`${name}\``)

    return [
      "# Snippet API reference",
      "",
      "Generated from `SnippetApi` in Parity's `packages/agent/src/snippet-api.ts`, so it matches what the code takes and",
      "returns. Every function is a global in an `execute` snippet; execute.md says how to use them together.",
      "",
      ...[...groups].flatMap(([category, entries]) => [`## ${category}`, "", "```ts", entries.join("\n\n"), "```", ""]),
      "## Types",
      "",
      "These are the document format, which document.md describes:",
      "",
      ...left.map((name) => `- ${name}`),
      "",
      ...types
    ].join("\n")
  }

  /** One function, or one value, as its doc comment and its signatures. */
  private member(member: TypeSymbol): string {
    const doc = comment(this.checker.getDocumentationCommentOfSymbol(member), "")
    const type = this.checker.getTypeOfSymbol(member)
    const signatures = type ? this.checker.getSignaturesOfType(type, SignatureKind.Call) : []

    if (!type || signatures.length === 0) {
      return `${doc}${member.name}: ${type ? this.checker.typeToString(type, undefined, printFlags) : "unknown"}`
    }

    const lines = signatures.map((signature) => {
      const node = signature.declaration?.resolve(this.project)
      const written = node ? this.source(this.file).slice(node.pos, node.end) : ""
      const params = signature.getParameters().map((param) => this.written(param))
      const own = signatures.length > 1 ? comment(leadingDoc(written), "") : ""
      const result = written.slice(written.lastIndexOf(")") + 1).replace(/^\s*(?::|=>)\s*/, "")

      return `${own}${member.name}(${params.join(", ")}): ${result.trim()}`
    })

    // Each overload has its own doc comment, which the member's would only sit above.
    return `${signatures.length > 1 ? "" : doc}${lines.join("\n")}`
  }

  /** Queues every type named in `text` that the reference spells out, as names resolve at `where`. */
  private collect(text: string, where: DocumentPosition) {
    for (const [name] of text.matchAll(/\b[A-Z]\w*\b/g)) {
      const symbol = this.resolve(name, where)

      if (symbol) {
        this.use(symbol)
      }
    }
  }

  /** Notes a type the reference names: spelled out further down, or left to document.md. */
  private use(symbol: TypeSymbol) {
    const path = (symbol.declarations[0]?.path ?? "").replaceAll("\\", "/").toLowerCase()

    // The language's own types and libraries' are left to their names.
    if (!path.includes("/packages/") || path.includes("/node_modules/") || this.seen.has(symbol.id)) {
      return
    }

    this.seen.add(symbol.id)

    if (path === this.format || leftToDocument.has(symbol.name)) {
      this.leftOut.add(symbol.name)
    } else {
      this.queued.push(symbol)
    }
  }

  private resolve(name: string, where: DocumentPosition): TypeSymbol | undefined {
    const found = this.checker.resolveName(name, SymbolFlags.Type, where)

    return found && hasFlag(found.flags, SymbolFlags.Alias) ? this.checker.getAliasedSymbol(found) : found
  }

  /** A type as the reference prints it: an interface as written, an inferred one as the fields it comes to. */
  private spell(symbol: TypeSymbol): string {
    const handle = symbol.declarations[0]!
    const node = handle.resolve(this.project)!
    const written = this.source(handle.path).slice(node.pos, node.end).trim()

    const declaration = written
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("// oxlint"))
      .join("\n")
      .replace(/^(\/\*\*[\s\S]*?\*\/\s*)?export /, "$1")
      .replaceAll(issues, "")

    if (hasFlag(symbol.flags, SymbolFlags.Interface) || !/\bz\.|typeof /.test(declaration)) {
      this.collect(declaration, { document: handle.path, position: node.end - 1 })

      return declaration
    }

    return this.inferred(symbol, leadingDoc(declaration))
  }

  /** A type alias the code infers, such as from a schema, written out as the type it comes to. */
  private inferred(symbol: TypeSymbol, doc: string): string {
    const declared = this.checker.getDeclaredTypeOfSymbol(symbol)
    const type = this.checker.getNonNullableType(declared) ?? declared
    const fields = type.isUnionType() || type.isIntersectionType() ? [] : this.checker.getPropertiesOfType(type)

    if (fields.length === 0) {
      return `${comment(doc, "")}type ${symbol.name} = ${this.print(type, symbol)}`
    }

    const lines = fields.map((field) => {
      const optional = hasFlag(field.flags, SymbolFlags.Optional)
      const fieldType = this.checker.getTypeOfSymbol(field)

      return `${comment(this.checker.getDocumentationCommentOfSymbol(field), "  ")}  ${field.name}${optional ? "?" : ""}: ${
        fieldType ? this.print(fieldType, symbol, optional) : "unknown"
      }`
    })

    return `${comment(doc, "")}interface ${symbol.name} {\n${lines.join("\n")}\n}`
  }

  /**
   * A type written out, calling every named type by its name rather than its fields. `self` is the type being written,
   * which is spelled out; `optional` leaves out `undefined`, which an optional field's `?` already says.
   */
  private print(type: Type, self: TypeSymbol, optional = false): string {
    const named = this.named.get(type.id) ?? type.getAliasSymbol()

    if (named && named !== self && this.named.get(this.checker.getDeclaredTypeOfSymbol(named).id) === named) {
      this.use(named)

      return named.name
    }

    if (type.isUnionType()) {
      // `null` and `undefined` go last, as code writes them.
      const members = [...type.getTypes()]
        .filter((member) => !(optional && hasFlag(member.flags, TypeFlags.Undefined)))
        .sort((a, b) => Number(nothing(a)) - Number(nothing(b)))
        .map((member) => this.print(member, self))

      // `true | false` is how the checker holds `boolean`.
      return [...new Set(members)].join(" | ").replace(/\bfalse \| true\b/, "boolean")
    }

    if (type.isIntersectionType()) {
      return type
        .getTypes()
        .map((member) => this.print(member, self))
        .join(" & ")
    }

    if (type.isTypeReference() && ["Array", "ReadonlyArray"].includes(type.getTarget().getSymbol()?.name ?? "")) {
      const [element] = this.checker.getTypeArguments(type)
      const printed = element ? this.print(element, self) : "unknown"

      return /[|&]/.test(printed) ? `(${printed})[]` : `${printed}[]`
    }

    if (type.isObjectType() && this.checker.getSignaturesOfType(type, SignatureKind.Call).length === 0) {
      const fields = this.checker.getPropertiesOfType(type)
      const [index] = this.checker.getIndexInfosOfType(type)

      if (fields.length === 0 && index) {
        return `Record<${this.print(index.keyType, self)}, ${this.print(index.valueType, self)}>`
      }

      if (fields.length > 0 && !index) {
        const written = fields.map((field) => {
          const fieldOptional = hasFlag(field.flags, SymbolFlags.Optional)
          const fieldType = this.checker.getTypeOfSymbol(field)

          return `${field.name}${fieldOptional ? "?" : ""}: ${fieldType ? this.print(fieldType, self, fieldOptional) : "unknown"}`
        })

        return `{ ${written.join("; ")} }`
      }
    }

    return this.checker.typeToString(type, undefined, printFlags)
  }

  /** A parameter as `SnippetApi` writes it. */
  private written(param: TypeSymbol): string {
    const handle = param.declarations[0]
    const node = handle?.resolve(this.project)

    return handle && node ? this.source(handle.path).slice(node.pos, node.end).trim() : param.name
  }

  private source(path: string): string {
    let text = this.sources.get(path)

    if (text === undefined) {
      text = readFileSync(path, "utf8")
      this.sources.set(path, text)
    }

    return text
  }
}

/** Whether a set of the checker's flags (`SymbolFlags`, `TypeFlags`) has any of these. */
function hasFlag<Flags extends number>(flags: Flags, ...wanted: Flags[]): boolean {
  // oxlint-disable-next-line no-bitwise -- the checker reports what a symbol or type is as bit flags; this is the one place they're read
  return wanted.some((flag) => (flags & flag) !== 0)
}

/** Whether a type is `null` or `undefined`. */
function nothing(type: Type): boolean {
  return hasFlag(type.flags, TypeFlags.Null, TypeFlags.Undefined)
}

/** The text of the doc comment leading a declaration, without its tags. */
function leadingDoc(written: string): string {
  const doc = /^\s*\/\*\*([\s\S]*?)\*\//.exec(written)?.[1] ?? ""

  return doc
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/, "").trimEnd())
    .join("\n")
    .trim()
}

/** `doc` as a doc comment, without its tags, indented by `indent`; nothing when it's empty. */
function comment(doc: string, indent: string): string {
  const lines = doc
    .replaceAll(issues, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("@"))
    .join("\n")
    .trim()
    .split("\n")

  if (lines.length === 1 && lines[0] === "") {
    return ""
  }

  return lines.length === 1
    ? `${indent}/** ${lines[0]} */\n`
    : `${indent}/**\n${lines.map((line) => `${indent} * ${line}`.trimEnd()).join("\n")}\n${indent} */\n`
}
