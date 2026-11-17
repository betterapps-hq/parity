import { jsonValue } from "@parity-app/core/schema"
import { z } from "zod"

/*
 * Applying what setting a library up or taking it out changes in a project's package.json (`LibrariesProvider.add` and
 * `remove`), as text in and text out, so the project service writes the result as a project edit.
 */

/**
 * What setting a library up or taking it out changes in package.json: dependencies at the ranges given, and scripts by
 * name, `null` removing one.
 */
export interface PackageChanges {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string | null>
}

const ranges = z.record(z.string(), z.string())

/** A package.json: its fields in the order written, with the sections the changes touch checked. */
const packageJson = z.record(z.string(), jsonValue)

const sections = z.object({
  dependencies: ranges.optional(),
  devDependencies: ranges.optional(),
  scripts: ranges.optional()
})

/** Names in the order package managers write dependencies: by code unit, not by locale. */
function byName(a: string, b: string): number {
  if (a === b) {
    return 0
  }

  return a < b ? -1 : 1
}

/**
 * A package.json's text with `changes` merged in: each dependency and script replacing one of the same name, where it
 * was, dependencies kept in name order as package managers write them, new scripts and sections last, and a script set
 * to `null` removed. Its fields' order, indentation and final newline are kept. Throws when the text isn't a
 * package.json.
 */
export function withPackageChanges(text: string, changes: PackageChanges): string {
  const pkg = packageJson.parse(JSON.parse(text))
  const current = sections.parse(pkg)
  const merged = { ...pkg }

  for (const section of ["dependencies", "devDependencies"] as const) {
    const added = changes[section]

    if (added) {
      merged[section] = Object.fromEntries(
        Object.entries({ ...current[section], ...added }).sort(([a], [b]) => byName(a, b))
      )
    }
  }

  if (changes.scripts) {
    const scripts = Object.entries({ ...current.scripts, ...changes.scripts }).filter(
      (entry): entry is [string, string] => entry[1] !== null
    )

    merged.scripts = Object.fromEntries(scripts)
  }

  const indent = /^\{\r?\n([ \t]+)"/.exec(text)?.[1] ?? "  "
  const newline = text.includes("\r\n") ? "\r\n" : "\n"
  const written = JSON.stringify(merged, null, indent).replaceAll("\n", newline)

  return /\r?\n$/.test(text) ? written + newline : written
}
