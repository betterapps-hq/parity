// Design tokens in the DTCG format (the Design Tokens Community Group's Format and Resolver modules, 2025.10): token
// files, and resolvers that layer them into contexts such as light and dark themes. Parity reads them to describe a
// library's tokens; the stylesheet stays what frames render with.

/** A token as its file describes it, with its value in each context. */
export interface DescribedToken {
  /** Its path in the file, as in `color.primary`. */
  path: string
  type?: string
  description?: string
  /** Its value in each context, written as CSS: `default` for the resolver's defaults, else the context, as in `dark`. */
  values: Record<string, string>
  /**
   * What Parity's own extension says about it (`$extensions.parity`): the custom property it compiles to, without
   * `--`, the Tokens panel category it belongs in, and for a font size, the custom property of its line height.
   */
  parity?: TokenExtension
}

export interface TokenExtension {
  var?: string
  category?: string
  lineHeight?: string
}

/** Reads a JSON file that tokens refer to, by its path. */
export type ReadTokenFile = (path: string) => Promise<unknown>

interface Resolver {
  sets: Record<string, { sources: unknown[] }>
  modifiers: Record<string, { contexts: Record<string, unknown[]>; default?: string }>
  resolutionOrder: unknown[]
}

type Group = Record<string, unknown>

/**
 * Reads design tokens from a token file or a resolver. `source` is a path, read with `read`, or the document itself;
 * `folder` is where relative paths start, with `/` between folders. A resolver gives values for its defaults and for
 * each context of each modifier, the other modifiers staying at their defaults.
 */
export async function readDesignTokens(source: unknown, read: ReadTokenFile, folder = ""): Promise<DescribedToken[]> {
  let directory = folder
  let document = source
  if (typeof source === "string") {
    const file = joinPath(folder, source)
    directory = dirnameOf(file)
    document = await read(file)
  }
  if (!isObject(document)) throw new TypeError("Design tokens must be a JSON object")
  const resolver = asResolver(document)
  const files = new Map<string, Promise<unknown>>()
  const load = (path: string) => {
    if (!files.has(path)) files.set(path, read(path))
    return files.get(path)!
  }

  const inputs: [string, Record<string, string>][] = []
  const defaults = Object.fromEntries(
    Object.entries(resolver.modifiers).map(([name, modifier]) => [
      name,
      modifier.default ?? Object.keys(modifier.contexts)[0] ?? ""
    ])
  )
  inputs.push(["default", defaults])
  for (const [name, modifier] of Object.entries(resolver.modifiers)) {
    for (const context of Object.keys(modifier.contexts)) {
      if (context !== defaults[name]) inputs.push([context, { ...defaults, [name]: context }])
    }
  }

  const tokens = new Map<string, DescribedToken>()
  for (const [context, input] of inputs) {
    const merged: Group = {}
    for (const item of resolver.resolutionOrder) {
      for (const source of await sourcesFor(item, resolver, input, document, directory, load)) {
        merge(merged, await expandSource(source, document, directory, load))
      }
    }
    for (const token of collectTokens(merged)) {
      const value = toCss(resolveAliases(token.value, merged, new Set([token.path])), token.type)
      const entry = tokens.get(token.path) ?? {
        path: token.path,
        ...(token.type ? { type: token.type } : {}),
        ...(token.description ? { description: token.description } : {}),
        values: {},
        ...(token.parity ? { parity: token.parity } : {})
      }
      // Only what differs from the defaults is kept per context.
      if (context === "default" || entry.values.default !== value) entry.values[context] = value
      tokens.set(token.path, entry)
    }
  }
  return [...tokens.values()]
}

/** A token file is a resolver with one set: itself. */
function asResolver(document: Group): Resolver {
  if (!Array.isArray(document.resolutionOrder)) {
    return { sets: { tokens: { sources: [document] } }, modifiers: {}, resolutionOrder: [{ $ref: "#/sets/tokens" }] }
  }
  const sets = isObject(document.sets) ? document.sets : {}
  const modifiers = isObject(document.modifiers) ? document.modifiers : {}
  return {
    sets: Object.fromEntries(
      Object.entries(sets).map(([name, set]) => [name, { sources: isObject(set) ? arrayOf(set.sources) : [] }])
    ),
    modifiers: Object.fromEntries(
      Object.entries(modifiers).map(([name, modifier]) => {
        const contexts = isObject(modifier) && isObject(modifier.contexts) ? modifier.contexts : {}
        return [
          name,
          {
            contexts: Object.fromEntries(Object.entries(contexts).map(([key, list]) => [key, arrayOf(list)])),
            ...(isObject(modifier) && typeof modifier.default === "string" ? { default: modifier.default } : {})
          }
        ]
      })
    ),
    resolutionOrder: document.resolutionOrder
  }
}

/** The sources one step of the resolution order contributes, for this input. */
async function sourcesFor(
  item: unknown,
  resolver: Resolver,
  input: Record<string, string>,
  document: Group,
  directory: string,
  load: ReadTokenFile
): Promise<unknown[]> {
  const ref = isObject(item) && typeof item.$ref === "string" ? item.$ref : undefined
  const set = /^#\/sets\/(.+)$/.exec(ref ?? "")?.[1]
  if (set !== undefined) return resolver.sets[decodePointer(set)]?.sources ?? []
  const modifier = /^#\/modifiers\/(.+)$/.exec(ref ?? "")?.[1]
  if (modifier !== undefined) {
    const name = decodePointer(modifier)
    return resolver.modifiers[name]?.contexts[input[name] ?? ""] ?? []
  }
  if (isObject(item) && Array.isArray(item.sources)) return item.sources
  if (isObject(item) && isObject(item.contexts)) {
    const contexts = item.contexts
    const name = typeof item.name === "string" ? item.name : ""
    const chosen = input[name] ?? (typeof item.default === "string" ? item.default : Object.keys(contexts)[0])
    return arrayOf(contexts[chosen ?? ""])
  }
  if (ref) return [await expandSource(item, document, directory, load)]
  return []
}

/** A source as token groups: inline groups as they are, or what a `$ref` points at, in this file or another. */
async function expandSource(source: unknown, document: Group, directory: string, load: ReadTokenFile): Promise<Group> {
  if (!isObject(source)) return {}
  if (typeof source.$ref !== "string") return source
  const [file, pointer = ""] = source.$ref.split("#")
  const target = file ? await load(joinPath(directory, file)) : document
  const found = pointAt(target, pointer)
  if (isObject(found) && Array.isArray(found.sources)) {
    const merged: Group = {}
    for (const inner of found.sources) merge(merged, await expandSource(inner, document, directory, load))
    return merged
  }
  return isObject(found) ? found : {}
}

/** Merges token groups: later tokens replace earlier ones whole, and groups merge key by key. */
function merge(into: Group, from: Group): void {
  for (const [key, value] of Object.entries(from)) {
    const existing = into[key]
    if (isObject(value) && !("$value" in value) && isObject(existing) && !("$value" in existing)) {
      merge(existing, value)
    } else {
      into[key] = isObject(value) && !("$value" in value) ? structuredClone(value) : value
    }
  }
}

interface RawToken {
  path: string
  value: unknown
  type?: string
  description?: string
  parity?: TokenExtension
}

/** Every token in the groups, with the type it inherits from the groups around it. */
function collectTokens(group: Group, prefix: string[] = [], inherited?: string): RawToken[] {
  const type = typeof group.$type === "string" ? group.$type : inherited
  const found: RawToken[] = []
  for (const [key, value] of Object.entries(group)) {
    if (!isObject(value)) continue
    // `$root` is a group's own token, named after the group.
    if (key.startsWith("$") && key !== "$root") continue
    const path = key === "$root" ? prefix : [...prefix, key]
    if ("$value" in value) {
      const ownType = typeof value.$type === "string" ? value.$type : type
      const parity = isObject(value.$extensions) ? tokenExtension(value.$extensions.parity) : undefined
      found.push({
        path: path.join("."),
        value: value.$value,
        ...(ownType ? { type: ownType } : {}),
        ...(typeof value.$description === "string" ? { description: value.$description } : {}),
        ...(parity ? { parity } : {})
      })
    } else {
      found.push(...collectTokens(value, path, type))
    }
  }
  return found
}

function tokenExtension(value: unknown): TokenExtension | undefined {
  if (!isObject(value)) return undefined
  const extension: TokenExtension = {}
  for (const key of ["var", "category", "lineHeight"] as const) {
    if (typeof value[key] === "string") extension[key] = value[key]
  }
  return Object.keys(extension).length > 0 ? extension : undefined
}

/** Follows aliases, `{color.base}` or `{ "$ref": "#/color/base" }`, to the values they stand for. */
function resolveAliases(value: unknown, groups: Group, seen: Set<string>): unknown {
  const alias = typeof value === "string" ? /^\{([^{}]+)\}$/.exec(value)?.[1] : undefined
  const ref = isObject(value) && typeof value.$ref === "string" ? value.$ref : undefined
  const target =
    alias ??
    (ref?.startsWith("#/")
      ? ref
          .slice(2)
          .replace(/\/\$value$/, "")
          .split("/")
          .map(decodePointer)
          .join(".")
      : undefined)
  if (target !== undefined) {
    if (seen.has(target)) throw new TypeError(`Design token alias {${target}} refers to itself`)
    const found = pointAt(groups, `/${target.split(".").join("/")}`)
    // A group can be referred to by name when it has a `$root` token.
    const token = isObject(found) && !("$value" in found) ? found.$root : found
    if (!isObject(token) || !("$value" in token)) throw new TypeError(`Design token alias {${target}} doesn't exist`)
    return resolveAliases(token.$value, groups, new Set([...seen, target]))
  }
  if (Array.isArray(value)) return value.map((item) => resolveAliases(item, groups, seen))
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveAliases(item, groups, seen)]))
  }
  return value
}

/** A token's value written as CSS would take it. */
function toCss(value: unknown, type: string | undefined): string {
  if (typeof value === "string") return value
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) {
    if (type === "cubicBezier") return `cubic-bezier(${value.join(", ")})`
    if (type === "fontFamily") return value.map((name) => fontName(String(name))).join(", ")
    if (type === "shadow") return value.map((item) => toCss(item, "shadow")).join(", ")
    if (type === "gradient") {
      const stops = value.map((stop) =>
        isObject(stop) ? `${toCss(stop.color, "color")} ${percent(stop.position)}` : ""
      )
      return `linear-gradient(${stops.join(", ")})`
    }
    return value.map((item) => toCss(item, undefined)).join(" ")
  }
  if (!isObject(value)) return JSON.stringify(value) ?? ""
  if ("colorSpace" in value || type === "color") return colorToCss(value)
  if ("value" in value && "unit" in value) return `${String(value.value)}${String(value.unit)}`
  if (type === "shadow") {
    const parts = ["offsetX", "offsetY", "blur", "spread"].map((key) => toCss(value[key] ?? "0", "dimension"))
    return `${value.inset === true ? "inset " : ""}${parts.join(" ")} ${toCss(value.color, "color")}`
  }
  if (type === "border") return [value.width, value.style, value.color].map((part) => toCss(part, undefined)).join(" ")
  if (type === "typography") {
    const size = toCss(value.fontSize, "dimension")
    const line = value.lineHeight === undefined ? "" : `/${toCss(value.lineHeight, "number")}`
    return `${toCss(value.fontWeight ?? "normal", "fontWeight")} ${size}${line} ${toCss(value.fontFamily, "fontFamily")}`
  }
  if (type === "transition") {
    return [value.duration, value.timingFunction, value.delay].map((part) => toCss(part, "cubicBezier")).join(" ")
  }
  return JSON.stringify(value)
}

function colorToCss(color: Group): string {
  const alpha = typeof color.alpha === "number" && color.alpha < 1 ? color.alpha : undefined
  if (typeof color.hex === "string" && alpha === undefined) return color.hex
  const components = arrayOf(color.components).map((part) => (typeof part === "number" ? part : "none"))
  const space = typeof color.colorSpace === "string" ? color.colorSpace : "srgb"
  const slash = alpha === undefined ? "" : ` / ${alpha}`
  if (space === "srgb") {
    const [r, g, b] = components.map((part) => (typeof part === "number" ? Math.round(part * 255) : part))
    return `rgb(${r} ${g} ${b}${slash})`
  }
  if (["hsl", "hwb", "lab", "lch", "oklab", "oklch"].includes(space)) return `${space}(${components.join(" ")}${slash})`
  return `color(${space} ${components.join(" ")}${slash})`
}

function fontName(name: string): string {
  return /^[\w-]+$/.test(name) ? name : `"${name}"`
}

function percent(position: unknown): string {
  return typeof position === "number" ? `${Math.round(position * 1000) / 10}%` : ""
}

function pointAt(value: unknown, pointer: string): unknown {
  let current = value
  for (const part of pointer.split("/").filter(Boolean)) {
    if (!isObject(current)) return undefined
    current = current[decodePointer(part)]
  }
  return current
}

function decodePointer(part: string): string {
  return part.replaceAll("~1", "/").replaceAll("~0", "~")
}

/** Joins a relative path onto a folder, POSIX style, resolving `.` and `..`. */
function joinPath(folder: string, path: string): string {
  if (path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) return path
  const parts = folder ? folder.split("/") : []
  for (const part of path.split("/")) {
    if (part === "..") parts.pop()
    else if (part !== "." && part !== "") parts.push(part)
  }
  return parts.join("/")
}

function dirnameOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""
}

function isObject(value: unknown): value is Group {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}
