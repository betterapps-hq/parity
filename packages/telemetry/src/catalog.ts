import { z } from "zod"
import type { Level, Process } from "./envelope.ts"
import type { EventDefinition } from "./events.ts"

type JsonSchema = z.core.JSONSchema.JSONSchema

/** One attribute as the catalog lists it. A nested object's fields are listed by their dotted path. */
export interface CatalogAttribute {
  name: string
  /** As TypeScript writes it: `string`, `integer`, `"key" | "menu"`, `string[]`. */
  type: string
  optional: boolean
  /** What it means, from the schema's `.describe()`. */
  meaning: string
}

/** One event as the catalog lists it. */
export interface CatalogEvent {
  name: string
  level: Level
  sample: number
  sentBy: readonly Process[]
  when: string
  attributes: CatalogAttribute[]
}

/** Where the generated part of docs/telemetry.md starts and ends. Everything around it is written by hand. */
export const catalogStart = "<!-- Generated from the event registry: see “Adding an event”. -->"
export const catalogEnd = "<!-- End of the generated events. -->"

/**
 * The catalog's entry for an event, from its definition and its schema. It throws when the event leaves something out
 * the catalog needs, since that's a mistake in Parity's own code: a process that sends it, when, or an attribute's
 * meaning.
 */
export function catalogEvent(event: EventDefinition): CatalogEvent {
  const { name, level, sample, sentBy, when } = event
  if (sentBy.length === 0) throw new Error(`${name} doesn't say which processes send it`)
  if (!when.trim()) throw new Error(`${name} doesn't say when it's sent`)
  const schema = z.toJSONSchema(event.schema, { io: "input", unrepresentable: "any" })
  if (schema.type !== "object") throw new Error(`${name}'s attributes are a z.object, so each is a named field`)
  return { name, level, sample, sentBy, when, attributes: attributesOf(name, schema) }
}

/** The fields of an object schema, nested objects flattened to dotted paths, each optional when its parent is. */
function attributesOf(event: string, schema: JsonSchema, prefix = "", parentOptional = false): CatalogAttribute[] {
  const required = new Set(schema.required ?? [])
  return Object.entries(schema.properties ?? {}).flatMap(([key, field]) => {
    const name = `${prefix}${key}`
    const optional = parentOptional || !required.has(key)
    if (typeof field === "boolean") throw new Error(`${event}'s attribute ${name} has no schema to describe it by`)
    if (field.type === "object" && field.properties) return attributesOf(event, field, `${name}.`, optional)
    const meaning = field.description?.trim()
    if (!meaning) throw new Error(`${event}'s attribute ${name} doesn't say what it means: give it a .describe()`)
    return [{ name, type: typeOf(field), optional, meaning }]
  })
}

/** A JSON Schema's type as TypeScript writes it. */
function typeOf(schema: JsonSchema | boolean): string {
  if (typeof schema === "boolean") return schema ? "unknown" : "never"
  if (schema.const !== undefined) return JSON.stringify(schema.const)
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(" | ")
  const options = schema.anyOf ?? schema.oneOf
  if (options) return options.map(typeOf).join(" | ")
  if (Array.isArray(schema.type)) return schema.type.map((type) => typeOf({ ...schema, type })).join(" | ")
  switch (schema.type) {
    case "array": {
      const items = Array.isArray(schema.items) ? undefined : schema.items
      const item = items === undefined ? "unknown" : typeOf(items)
      return item.includes(" ") ? `(${item})[]` : `${item}[]`
    }
    case "object":
      return "object"
    case "string":
      return schema.format ? `string (${schema.format})` : "string"
    case undefined:
      return "unknown"
    default:
      return schema.type
  }
}

/**
 * The generated part of docs/telemetry.md: a table of every event, then each event's attributes. Events are listed by
 * name, so a group's events sit together.
 */
export function renderCatalog(events: readonly EventDefinition[]): string {
  const names = new Set<string>()
  for (const { name } of events) {
    if (names.has(name)) throw new Error(`${name} is registered twice`)
    names.add(name)
  }
  const entries = events.map(catalogEvent).sort((a, b) => (a.name < b.name ? -1 : 1))
  if (entries.length === 0) return "No events are registered yet."
  const summary = table(
    ["Event", "Level", "Kept", "Sent by", "When"],
    entries.map((event) => [code(event.name), event.level, kept(event.sample), event.sentBy.join(", "), event.when])
  )
  const sections = entries.map((event) => {
    const attributes =
      event.attributes.length === 0
        ? "No attributes."
        : table(
            ["Attribute", "Type", "Meaning"],
            event.attributes.map((attribute) => [
              code(attribute.name),
              attribute.optional ? `${code(attribute.type)}, optional` : code(attribute.type),
              attribute.meaning
            ])
          )
    return `### ${code(event.name)}\n\n${attributes}`
  })
  return [summary, ...sections].join("\n\n")
}

/**
 * The page with its generated part replaced by `events`' catalog. It throws when the page lacks the markers, so a
 * page that lost them isn't rewritten from scratch.
 */
export function withCatalog(page: string, events: readonly EventDefinition[]): string {
  const start = page.indexOf(catalogStart)
  const end = page.indexOf(catalogEnd)
  if (start === -1 || end < start) {
    throw new Error(`The page has no generated part: put the events between "${catalogStart}" and "${catalogEnd}"`)
  }
  const before = page.slice(0, start + catalogStart.length)
  return `${before}\n\n${renderCatalog(events)}\n\n${page.slice(end)}`
}

/** The share of an event kept, as the catalog writes it: all, or a percentage. */
function kept(sample: number): string {
  return sample === 1 ? "all" : `${Math.round(sample * 1000) / 10}%`
}

/** Text as inline code. */
function code(text: string): string {
  return `\`${text}\``
}

/** A Markdown table with its columns padded, as `vp fmt` writes it, so formatting the page leaves it alone. */
function table(header: string[], rows: string[][]): string {
  const cells = [header, ...rows].map((row) => row.map((cell) => cell.replaceAll("|", "\\|").replaceAll("\n", " ")))
  const widths = header.map((_, column) => Math.max(3, ...cells.map((row) => row[column]?.length ?? 0)))
  const line = (row: string[]) => `| ${row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join(" | ")} |`
  const [head = [], ...body] = cells
  return [line(head), line(widths.map((width) => "-".repeat(width))), ...body.map(line)].join("\n")
}
