import type { ProjectProcess } from "./protocol.ts"

/*
 * A process's ids. In the process manager an extension's is `extension:<extension>:<project>:<id>`, unique across open
 * projects; in what extensions see, and tell providers, it's `<extension>:<id>`, or `parity:<role>` for Parity's own.
 * The window works them out too, so a process's menu tests extensions' context keys by the ids they know (PAR-1127).
 */

/** A process's id in the manager: one per extension, process and project. */
export function managedId(caller: { extension: string; projectId: string }, id: string): string {
  return `extension:${caller.extension}:${caller.projectId}:${id}`
}

/** The extension that started or adopted a process, or none for Parity's own. */
export function ownerOf({ owner }: ProjectProcess): string | undefined {
  if (owner.kind === "parity") {
    return undefined
  }

  return owner.kind === "extension" ? owner.extension : owner.by
}

/**
 * A process's id in the list extensions see: `<extension>:<id>` for an extension's, `parity:<role>` for Parity's own,
 * with a number after the role when the project has more than one with it. `all` is the project's processes.
 */
export function listedId(process: ProjectProcess, all: ProjectProcess[]): string {
  const { owner } = process

  if (owner.kind === "parity") {
    const same = all.filter((each) => each.owner.kind === "parity" && each.owner.role === owner.role)

    const index = same
      .map((each) => each.id)
      .sort()
      .indexOf(process.id)

    return index > 0 ? `parity:${owner.role}-${index + 1}` : `parity:${owner.role}`
  }

  const extension = ownerOf(process) ?? ""
  const prefix = managedId({ extension, projectId: process.projectId }, "")

  return `${extension}:${process.id.startsWith(prefix) ? process.id.slice(prefix.length) : process.id}`
}
