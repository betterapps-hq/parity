import { z } from "zod"

export const jsonObject = z.record(z.string(), z.json())

/** A file's keys and their values, as JSON. */
export type FileObject = z.infer<typeof jsonObject>

/** Any JSON value. */
export type JsonValue = FileObject[string]

/**
 * A file's text as an object of its keys, or why it isn't one. No text, as for a missing file, is an empty one. `name`
 * is the file's, for the problem.
 */
export function parseObject(name: string, text: string | undefined): { object: FileObject } | { problem: string } {
  if (text === undefined || text.trim() === "") {
    return { object: {} }
  }

  let json: unknown

  try {
    json = JSON.parse(text)
  } catch (error) {
    return { problem: `${name} isn't JSON: ${error instanceof Error ? error.message : String(error)}` }
  }

  const object = jsonObject.safeParse(json)

  return object.success ? { object: object.data } : { problem: `${name} isn't an object.` }
}

/** The object `text` holds, for a change to it. Throws for text that doesn't parse, which must never be written over. */
export function objectToChange(name: string, text: string | undefined): FileObject {
  const parsed = parseObject(name, text)

  if ("problem" in parsed) {
    throw new Error(parsed.problem)
  }

  return { ...parsed.object }
}

/** A file's text for `object`, as every file here is written. */
export function fileText(object: FileObject): string {
  return `${JSON.stringify(object, null, 2)}\n`
}
