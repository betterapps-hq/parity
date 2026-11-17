/*
 * A project file is written in the order its keys already have on disk, so a save changes only the lines that changed
 * (PAR-1288). The document saved doesn't always keep that order: a copy that took over a live room has it from the room,
 * which doesn't keep the order of a design's keyed values (a component's props, a design's params), and the schema
 * puts an object's own fields in its order, not the file's.
 */

import type { z } from "zod"
import type { CanvasDocument } from "./document.ts"
import { type JsonValue as Json, jsonValue, parseData, type plainObject } from "./schema.ts"

/** A library manifest with its designs in `canvas`, as `withLibraryCanvas` makes it. */
type LibraryFile = z.output<typeof plainObject>

/**
 * The text of a project file holding `value`, as Parity writes it: two-space JSON ending in a newline, with each object's
 * keys in the order the same object has in `onDisk`, the file as it is now. A key the file doesn't have yet follows the
 * key before it in `value`. Without readable text on disk, the keys stay in `value`'s order.
 */
export function projectFileText(value: CanvasDocument | LibraryFile, onDisk?: string): string {
  const text = `${JSON.stringify(value, null, 2)}\n`
  const previous = onDisk === undefined ? undefined : readJson(onDisk)

  if (previous === undefined) {
    return text
  }

  // What's written is what JSON keeps of the value, read back as JSON.
  return `${JSON.stringify(ordered(parseData(jsonValue, JSON.parse(text)), previous), null, 2)}\n`
}

/** The JSON `text` holds, or nothing when it isn't JSON. */
function readJson(text: string): Json | undefined {
  try {
    return parseData(jsonValue, JSON.parse(text))
  } catch {
    return undefined
  }
}

function ordered(value: Json, previous: Json | undefined): Json {
  if (Array.isArray(value)) {
    const before = Array.isArray(previous) ? previous : []

    return value.map((item, at) => ordered(item, counterpart(item, at, before)))
  }

  if (!isObject(value) || !isObject(previous)) {
    return value
  }

  const result: { [key: string]: Json } = {}

  for (const key of keyOrder(Object.keys(value), Object.keys(previous))) {
    result[key] = ordered(value[key]!, previous[key])
  }

  return result
}

/**
 * `keys` with those `before` has in its order, and each of the others right after the key it follows in `keys`, or
 * first when it's first.
 */
function keyOrder(keys: string[], before: string[]): string[] {
  const present = new Set(keys)
  const order = before.filter((key) => present.has(key))
  const placed = new Set(order)

  keys.forEach((key, at) => {
    if (placed.has(key)) {
      return
    }

    const after = at === 0 ? -1 : order.indexOf(keys[at - 1]!)
    order.splice(after + 1, 0, key)
    placed.add(key)
  })

  return order
}

/** What an array item was on disk: the item with the same `id`, or, for items without one, the item in its place. */
function counterpart(item: Json, at: number, before: Json[]): Json | undefined {
  const id = isObject(item) ? item.id : undefined

  if (id !== undefined && id !== null && !(id instanceof Object)) {
    return before.find((each) => isObject(each) && each.id === id)
  }

  return before[at]
}

function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return value instanceof Object && !Array.isArray(value)
}
