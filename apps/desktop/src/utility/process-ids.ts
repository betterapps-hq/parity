import type { CommandTarget, ProcessInfo } from "@parity-app/extension-api"
import type { ProcessCaller } from "@parity-app/extensions"
import { visibleTo } from "@parity-app/processes"
import type { ProjectProcess } from "../shared/protocol.ts"

/*
 * A process's ids. In the process manager an extension's is `extension:<extension>:<project>:<id>`, unique across open
 * projects; in what extensions see, and tell providers, it's `<extension>:<id>`, or `parity:<role>` for Parity's own.
 */

/** A process's id in the manager: one per extension, process and project. */
export function managedId(caller: Pick<ProcessCaller, "extension" | "projectId">, id: string): string {
  return `extension:${caller.extension}:${caller.projectId}:${id}`
}

/**
 * What an extension sees of a process: its id among the project's processes, without what only the window needs, and
 * only what `visibleTo` lets it see of one it doesn't own.
 */
export function seenBy(caller: ProcessCaller, process: ProjectProcess, all: ProjectProcess[] = [process]): ProcessInfo {
  const { projectId: _project, project: _name, canStop: _stop, canRestart: _restart, ...info } = process

  return visibleTo(
    { ...info, id: listedId(process, all) },
    { owns: ownerOf(process) === caller.extension, observe: caller.permissions.observe }
  )
}

/** The extension that started or adopted a process, or none for Parity's own. */
function ownerOf({ owner }: ProjectProcess): string | undefined {
  if (owner.kind === "parity") {
    return undefined
  }

  return owner.kind === "extension" ? owner.extension : owner.by
}

/**
 * A command's target as an extension sees it: a process the window names by its id here is named by its id in the list
 * extensions see (`listedId`). Any other target, or a process that has gone, is left as it is.
 */
export function targetSeenByExtensions(target: CommandTarget, all: ProjectProcess[]): CommandTarget {
  if (target.type !== "process") {
    return target
  }

  const process = all.find((each) => each.id === target.id)

  return process ? { type: "process", id: listedId(process, all) } : target
}

/**
 * A process's id in the list extensions see: `<extension>:<id>` for an extension's, `parity:<role>` for Parity's own,
 * with a number after the role when the project has more than one with it.
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
