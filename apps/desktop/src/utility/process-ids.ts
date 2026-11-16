import type { ProcessInfo } from "@parity-app/extension"
import type { ProcessCaller } from "@parity-app/extension-host"
import { visibleTo } from "@parity-app/processes"
import { listedId, ownerOf } from "../shared/process-ids.ts"
import type { ProjectProcess } from "../shared/protocol.ts"

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
