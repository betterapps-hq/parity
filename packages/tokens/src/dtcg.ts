// Design tokens in the DTCG format (the Design Tokens Community Group's Format and Resolver modules, 2025.10): token
// files, and resolvers that layer them into contexts such as light and dark themes. Parity reads them to describe a
// library's tokens; the stylesheet stays what frames render with.

import type { DescribedToken } from "@parity-app/core"
import { parseData, parserFor } from "@parity-app/core/schema"
import { isComposite } from "@parity-app/core/values/evaluate"
import { z } from "zod"
import { untypedValue, valueTypes } from "./dtcg-values.ts"

/** Reads a JSON file that tokens refer to, by its path. */
// oxlint-disable-next-line anti-slop/no-unknown-returns -- the I/O boundary: a token file read from disk, parsed as `tokenData` here
export type ReadTokenFile = (path: string) => Promise<unknown>

/** A token, or a part of a resolver, left out of what's read because it isn't what DTCG describes. */
export interface SkippedToken {
  /** The token's path, as `color.primary`, or the part of the resolver, as a JSON pointer such as `/sets/base`. */
  path: string
  /** Where in it the problem is, as a JSON pointer, and what was expected: `/$value/alpha: expected at most 1`. */
  problem: string
}

/**
 * What a token file holds: JSON, read from a file or written in memory, where an object's key or a list's item may be undefined.
 */
type TokenData = string | number | boolean | null | (TokenData | undefined)[] | Group

interface Group {
  [key: string]: TokenData | undefined
}

const tokenData: z.ZodType<TokenData> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(tokenData.optional()), group])
)

const group: z.ZodType<Group> = z.record(z.string(), tokenData.optional())

/** Reads what a token file holds, as `read` gives it. */
const readTokenData = parserFor(tokenData)

/** Reads a token file by its path, checked to be what a token file holds. */
type LoadTokenFile = (path: string) => Promise<TokenData>

const text = z.string()

/** Token groups, or `$ref`s to them in this file or another. */
const tokenSources = z.array(group)
const resolverSet = z.object({ sources: tokenSources })

const resolverModifier = z.object({
  contexts: z.record(z.string(), tokenSources).transform((contexts) => new Map(Object.entries(contexts))),
  default: z.string().optional()
})

/** A step of the resolution order: a `$ref` to a set or a modifier, or one written in place. */
const reference = z.object({ $ref: z.string() })

/** A modifier written in the resolution order, set by the input of its `name`. */
const inlineModifier = resolverModifier.extend({ name: z.string().optional() })

type ResolverSet = z.infer<typeof resolverSet>

type ResolverModifier = z.infer<typeof resolverModifier>

type ResolutionStep = z.infer<typeof reference> | ResolverSet | z.infer<typeof inlineModifier>

interface Resolver {
  sets: Map<string, ResolverSet>
  modifiers: Map<string, ResolverModifier>
  resolutionOrder: ResolutionStep[]
}

/** A token's fields besides its value: its own type, its description, and Parity's extension (`TokenExtension`). */
const tokenFields = z.object({
  $type: z.string().optional(),
  $description: z.string().optional(),
  $extensions: z
    .object({
      parity: z
        .object({ var: z.string().optional(), category: z.string().optional(), lineHeight: z.string().optional() })
        .optional()
    })
    .optional()
})

/** Says what was skipped: a token by its path, or a part of the resolver by its pointer. */
type Skip = (path: string, problem: string) => void

/**
 * Reads design tokens from a token file or a resolver. `source` is a path, read with `read`, or the document itself;
 * `folder` is where relative paths start, with `/` between folders. A resolver gives values for its defaults and for
 * each context of each modifier, the other modifiers staying at their defaults.
 *
 * A malformed token, set, modifier or step of the resolution order is left out rather than failing the file, and
 * `report` hears of each once. A broken alias still fails it.
 */
export async function readDesignTokens(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a manifest's path to its tokens, or the tokens themselves, parsed here
  source: unknown,
  read: ReadTokenFile,
  folder = "",
  report?: (skipped: SkippedToken) => void
): Promise<DescribedToken[]> {
  let directory = folder
  let given = source
  const path = text.safeParse(source)

  if (path.success) {
    const file = joinPath(folder, path.data)
    directory = dirnameOf(file)
    given = await read(file)
  }

  const document = tokenData.safeParse(given).data

  if (!isObject(document)) {
    throw new TypeError("Design tokens must be a JSON object")
  }

  const reported = new Set<string>()

  const skip: Skip = (path, problem) => {
    const key = JSON.stringify([path, problem])

    if (reported.has(key)) {
      return
    }

    reported.add(key)
    report?.({ path, problem })
  }

  const resolver = asResolver(document, skip)
  const files = new Map<string, Promise<TokenData>>()

  const load: LoadTokenFile = (path) => {
    if (!files.has(path)) {
      files.set(
        path,
        read(path).then((data) => readTokenData(data))
      )
    }

    return files.get(path)!
  }

  const inputs: [string, Record<string, string>][] = []

  const defaults = Object.fromEntries(
    [...resolver.modifiers].map(([name, modifier]) => [
      name,
      modifier.default ?? modifier.contexts.keys().next().value ?? ""
    ])
  )

  inputs.push(["default", defaults])

  for (const [name, modifier] of resolver.modifiers) {
    for (const context of modifier.contexts.keys()) {
      if (context !== defaults[name]) {
        inputs.push([context, { ...defaults, [name]: context }])
      }
    }
  }

  const tokens = new Map<string, DescribedToken>()

  for (const [context, input] of inputs) {
    const merged: Group = {}

    for (const step of resolver.resolutionOrder) {
      for (const source of await sourcesFor(step, resolver, input, document, directory, load)) {
        merge(merged, await expandSource(source, document, directory, load))
      }
    }

    for (const found of collectTokens(merged)) {
      const token = readToken(found, merged, skip)

      if (!token) {
        continue
      }

      const entry = tokens.get(token.path) ?? describedToken(token)

      // Only what differs from the defaults is kept per context.
      if (context === "default" || entry.values.default !== token.css) {
        entry.values[context] = token.css
      }

      tokens.set(token.path, entry)
    }
  }

  return [...tokens.values()]
}

/** A token as it's first described, with no values yet, its keys in the order Parity writes them. */
function describedToken(token: ReadToken): DescribedToken {
  const head: Omit<DescribedToken, "values" | "parity"> = { path: token.path }

  if (token.type) {
    head.type = token.type
  }

  if (token.description) {
    head.description = token.description
  }

  const described: DescribedToken = { ...head, values: {} }

  if (token.parity) {
    described.parity = token.parity
  }

  return described
}

/** A token file is a resolver with one set: itself. A resolver's malformed sets, modifiers and steps are skipped. */
function asResolver(document: Group, skip: Skip): Resolver {
  const order = document.resolutionOrder

  if (!Array.isArray(order)) {
    return {
      sets: new Map([["tokens", { sources: [document] }]]),
      modifiers: new Map(),
      resolutionOrder: [{ $ref: "#/sets/tokens" }]
    }
  }

  return {
    sets: namedParts(resolverSet, document.sets, "/sets", skip),
    modifiers: namedParts(resolverModifier, document.modifiers, "/modifiers", skip),
    resolutionOrder: order.flatMap((step, index) => {
      const report = (problem: string) => skip(`/resolutionOrder/${index}`, problem)
      const object = checked(group, step, report)

      return object ? (checked(stepSchema(object), object, report) ?? []) : []
    })
  }
}

/** The schema for a step of the resolution order, told by its keys, so a problem is reported against what it meant. */
function stepSchema(step: Group) {
  if ("$ref" in step) {
    return reference
  }

  if ("sources" in step) {
    return resolverSet
  }

  return inlineModifier
}

/** A resolver's named sets or modifiers, those `schema` takes; the rest are skipped. */
function namedParts<T extends z.ZodType>(
  schema: T,
  value: TokenData | undefined,
  at: string,
  skip: Skip
): Map<string, z.output<T>> {
  const parts = new Map<string, z.output<T>>()

  if (value === undefined) {
    return parts
  }

  const named = checked(group, value, (problem) => skip(at, problem)) ?? {}

  for (const [name, part] of Object.entries(named)) {
    const pointer = `${at}/${encodePointer(name)}`
    const parsed = checked(schema, part, (problem) => skip(pointer, problem))

    if (parsed !== undefined) {
      parts.set(name, parsed)
    }
  }

  return parts
}

/** The sources one step of the resolution order contributes, for this input. */
async function sourcesFor(
  step: ResolutionStep,
  resolver: Resolver,
  input: Record<string, string>,
  document: Group,
  directory: string,
  load: LoadTokenFile
): Promise<Group[]> {
  if ("$ref" in step) {
    const set = /^#\/sets\/(.+)$/.exec(step.$ref)?.[1]

    if (set !== undefined) {
      return resolver.sets.get(decodePointer(set))?.sources ?? []
    }

    const modifier = /^#\/modifiers\/(.+)$/.exec(step.$ref)?.[1]

    if (modifier !== undefined) {
      const name = decodePointer(modifier)

      return resolver.modifiers.get(name)?.contexts.get(input[name] ?? "") ?? []
    }

    return [await expandSource(step, document, directory, load)]
  }

  if ("sources" in step) {
    return step.sources
  }

  const chosen = input[step.name ?? ""] ?? step.default ?? step.contexts.keys().next().value

  return step.contexts.get(chosen ?? "") ?? []
}

/** A source as token groups: inline groups as they are, or what a `$ref` points at, in this file or another. */
async function expandSource(source: Group, document: Group, directory: string, load: LoadTokenFile): Promise<Group> {
  const ref = reference.safeParse(source).data?.$ref

  if (ref === undefined) {
    return source
  }

  const [file, pointer = ""] = ref.split("#")
  const target = file ? await load(joinPath(directory, file)) : document
  const found = pointAt(target, pointer)

  if (isObject(found) && Array.isArray(found.sources)) {
    const merged: Group = {}

    for (const inner of found.sources) {
      if (isObject(inner)) {
        merge(merged, await expandSource(inner, document, directory, load))
      }
    }

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

interface FoundToken {
  path: string
  /** The token itself: its `$value` and its other `$` fields. */
  token: Group
  /** The type the groups around it give it. */
  type?: string
}

/** Every token in the groups, with the type it inherits from the groups around it. */
function collectTokens(group: Group, prefix: string[] = [], inherited?: string): FoundToken[] {
  const type = text.safeParse(group.$type).data ?? inherited
  const found: FoundToken[] = []

  for (const [key, value] of Object.entries(group)) {
    if (!isObject(value)) {
      continue
    }

    // `$root` is a group's own token, named after the group.
    if (key.startsWith("$") && key !== "$root") {
      continue
    }

    const path = key === "$root" ? prefix : [...prefix, key]

    if ("$value" in value) {
      const token: FoundToken = { path: path.join("."), token: value }

      if (type) {
        token.type = type
      }

      found.push(token)
    } else {
      found.push(...collectTokens(value, path, type))
    }
  }

  return found
}

/** A token as Parity describes it, with its value as CSS rather than its values by context. */
type ReadToken = Omit<DescribedToken, "values"> & { css: string }

/** A token as Parity describes it, with its value as CSS; nothing, with the problem reported, when it's malformed. */
function readToken(found: FoundToken, groups: Group, skip: Skip): ReadToken | undefined {
  const report = (problem: string) => skip(found.path, problem)
  const fields = checked(tokenFields, found.token, report)

  if (!fields) {
    return undefined
  }

  const type = fields.$type ?? found.type
  const value = resolveAliases(found.token.$value, groups, new Set([found.path]))
  const schema = (type === undefined ? undefined : valueTypes.get(type)) ?? untypedValue
  const css = checked(schema, value, report, "/$value")

  if (css === undefined) {
    return undefined
  }

  const parity = fields.$extensions?.parity
  const token: ReadToken = { path: found.path, css }

  if (type) {
    token.type = type
  }

  if (fields.$description) {
    token.description = fields.$description
  }

  if (parity && Object.keys(parity).length > 0) {
    token.parity = parity
  }

  return token
}

/** Follows aliases, `{color.base}` or `{ "$ref": "#/color/base" }`, to the values they stand for. */
function resolveAliases(value: TokenData | undefined, groups: Group, seen: Set<string>): TokenData | undefined {
  const alias = /^\{([^{}]+)\}$/.exec(text.safeParse(value).data ?? "")?.[1]
  const ref = reference.safeParse(value).data?.$ref

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
    if (seen.has(target)) {
      throw new TypeError(`Design token alias {${target}} refers to itself`)
    }

    const found = pointAt(groups, `/${target.split(".").join("/")}`)
    // A group can be referred to by name when it has a `$root` token.
    const token = isObject(found) && !("$value" in found) ? found.$root : found

    if (!isObject(token) || !("$value" in token)) {
      throw new TypeError(`Design token alias {${target}} doesn't exist`)
    }

    return resolveAliases(token.$value, groups, new Set([...seen, target]))
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveAliases(item, groups, seen))
  }

  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveAliases(item, groups, seen)]))
  }

  return value
}

/**
 * What `schema` reads from `value`, or nothing, with the problem reported as `/json/pointer: message`. `at` is where
 * the value sits in what's reported.
 */
function checked<T extends z.ZodType>(
  schema: T,
  value: TokenData | undefined,
  report: (problem: string) => void,
  at = ""
): z.output<T> | undefined {
  try {
    return parseData(schema, value, at)
  } catch (error) {
    if (!(error instanceof TypeError)) {
      throw error
    }

    report(error.message)

    return undefined
  }
}

function pointAt(value: TokenData | undefined, pointer: string): TokenData | undefined {
  let current = value

  for (const part of pointer.split("/").filter(Boolean)) {
    if (!isObject(current)) {
      return undefined
    }

    current = current[decodePointer(part)]
  }

  return current
}

function decodePointer(part: string): string {
  return part.replaceAll("~1", "/").replaceAll("~0", "~")
}

function encodePointer(key: string): string {
  return key.replaceAll("~", "~0").replaceAll("/", "~1")
}

/** Joins a relative path onto a folder, POSIX style, resolving `.` and `..`. */
function joinPath(folder: string, path: string): string {
  if (path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) {
    return path
  }

  const parts = folder ? folder.split("/") : []

  for (const part of path.split("/")) {
    if (part === "..") {
      parts.pop()
    } else if (part !== "." && part !== "") {
      parts.push(part)
    }
  }

  return parts.join("/")
}

function dirnameOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""
}

function isObject(value: TokenData | undefined): value is Group {
  return isComposite(value) && !Array.isArray(value)
}
