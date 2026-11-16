import type { CanvasDocument, ContainerSpec, DesignNode, JsonValue, NoteSpec, ReferenceSpec } from "@parity-app/core"

/*
 * Reading and setting fields of the plain values by name, as operations name them: a file's, a design's and a layer's.
 * What a transaction leaves is checked against core's schemas before anything is applied (`checkDraft`).
 */

/** What an operation names a field of. */
export type Holder = CanvasDocument | ContainerSpec | DesignNode

/** JSON as the plain values hold it: an optional field may be absent, which reads as undefined. */
export type Plain = string | number | boolean | null | readonly Plain[] | PlainRecord

export interface PlainRecord {
  readonly [key: string]: Plain | undefined
}

/** What a field can be set to: JSON, or a file's notes or references. */
export type FieldValue = Plain | readonly NoteSpec[] | readonly ReferenceSpec[] | undefined

export function isRecord(value: Plain | undefined): value is PlainRecord {
  return value instanceof Object && !Array.isArray(value)
}

/** A file's, a design's or a layer's fields, by name. */
export function fieldsOf(value: Holder): PlainRecord {
  // SAFETY: a file, a design and a layer are JSON objects, read from a `.par` file or checked against its schema.
  return value as PlainRecord
}

/** A file, a design or a layer as JSON, as an operation or a diff carries it. */
export function asJson(value: Holder): JsonValue {
  return jsonOf(fieldsOf(value)) ?? null
}

/** A field's value, as an operation carries it. */
export function fieldOf(value: Holder, field: string): JsonValue | undefined {
  return jsonOf(fieldsOf(value)[field])
}

/** One key of a record field. */
export function keyOf(value: Holder, field: string, key: string): JsonValue | undefined {
  const record = fieldsOf(value)[field]

  return isRecord(record) ? jsonOf(record[key]) : undefined
}

/** The value at a path: a field, or a field and one of its keys. */
export function pathOf(value: Holder | undefined, path: readonly string[]): JsonValue | undefined {
  const [field, ...rest] = path

  if (!value || field === undefined) {
    return undefined
  }

  let current = fieldsOf(value)[field]

  for (const part of rest) {
    current = isRecord(current) ? current[part] : undefined
  }

  return jsonOf(current)
}

/** A value with a field set, or taken away when `next` is undefined. */
export function withField<T extends Holder>(value: T, field: string, next: FieldValue): T {
  const copy = { ...value }

  if (next === undefined) {
    Reflect.deleteProperty(copy, field)
  } else {
    Reflect.set(copy, field, next)
  }

  return copy
}

/** A value with one key of a record field set or taken away; a record left empty is taken away too. */
export function withKey<T extends Holder>(value: T, field: string, key: string, next: Plain | undefined): T {
  const current = fieldsOf(value)[field]
  const entries = (isRecord(current) ? Object.entries(current) : []).filter(([name]) => name !== key)

  if (next !== undefined) {
    entries.push([key, next])
  }

  return withField(value, field, entries.length > 0 ? Object.fromEntries(entries) : undefined)
}

/** A plain value as JSON, as an operation carries it. */
export function jsonOf(value: Plain | undefined): JsonValue | undefined {
  // SAFETY: the plain values come from parsed files and checked operations, and core's file schemas leave unset fields
  // out rather than keeping them as undefined (`fileObject`), so nothing inside is undefined and the value is JSON.
  return value as JsonValue | undefined
}
