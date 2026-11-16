import { listInWords } from "@parity-app/editor"
import type { Permissions } from "@parity-app/extension"
import type { Extension } from "./definitions.ts"

/*
 * What an extension's page says of it besides its settings (PAR-1090): what its manifest says it may do, and how its
 * code is running in the open project.
 */

/** Each thing an extension's manifest says it may do, in a short line: what it reads, writes, reaches, runs, changes. */
export function permissionLines(permissions: Permissions | undefined): string[] {
  if (!permissions) {
    return []
  }

  const lines: string[] = []

  const add = (verb: string, items: string[] | undefined) => {
    if (items && items.length > 0) {
      lines.push(`${verb} ${listInWords(items)}`)
    }
  }

  add("Reads", permissions.read)
  add("Writes", permissions.write)
  add("Reaches", permissions.network)
  add("Runs", permissions.processes)

  if (permissions.edits) {
    lines.push("Changes designs")
  }

  return lines
}

/** A size in bytes as a person reads it, in megabytes. */
function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1_048_576))} MB`
}

/** How long something took, as a person reads it: milliseconds under a second, else seconds. */
function duration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`
}

/** How an extension's code runs in the open project: how long it took to activate and the memory it holds. */
export function extensionFacts(
  extension: Pick<Extension, "activatedIn" | "memory" | "onStartup">
): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = []

  if (extension.onStartup) {
    facts.push({ label: "Starts", value: "As Parity opens the project" })
  }

  if (extension.activatedIn !== undefined) {
    facts.push({ label: "Activation", value: duration(extension.activatedIn) })
  }

  if (extension.memory !== undefined) {
    facts.push({ label: "Memory", value: megabytes(extension.memory) })
  }

  return facts
}
