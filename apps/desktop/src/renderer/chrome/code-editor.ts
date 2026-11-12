import type { ElementSource } from "@parity-app/core"
import type { OpenInEditorRequest, ProjectInfo } from "../../shared/protocol.ts"
import { reportError } from "../report-error.ts"
import { getPreferences } from "./preferences.ts"

/** The parts of a project's info that say where its components' code is. */
type ProjectFiles = Pick<ProjectInfo, "root" | "sources">

/**
 * A component's code, as an absolute path: the project's own component's file, or a library component's type
 * declarations, which is the code the project has of it. None for a library component without them.
 */
export function componentFile(info: ProjectFiles, component: string): string | undefined {
  const source = info.sources[component]

  if (!source) {
    return undefined
  }

  const relative = source.library ? source.declaration : source.path

  return relative ? projectFile(info, relative) : undefined
}

/** A file of the project, from its root, as an absolute path in the root's own separators, as the system writes it. */
export function projectFile(info: Pick<ProjectInfo, "root">, relative: string): string {
  const root = info.root
  const separator = root.includes("\\") ? "\\" : "/"

  return `${root.replace(/[\\/]+$/, "")}${separator}${relative.replace(/^[.][\\/]/, "").replaceAll(/[\\/]/g, separator)}`
}

/** Opens a component's code in the editor Settings names, at the line of its export (PAR-527). */
export async function viewCode(info: ProjectFiles, component: string): Promise<void> {
  const file = componentFile(info, component)
  const source = info.sources[component]

  if (!file || !source) {
    return
  }

  // A part named through its family, as `Dialog.Root`, is found by the family's export.
  await openFile({ file, export: source.export.split(".")[0] })
}

/** Opens the file an element is written in, at its line (PAR-167). */
export async function openSource(info: Pick<ProjectInfo, "root">, { path, line }: ElementSource): Promise<void> {
  await openFile({ file: projectFile(info, path), line })
}

async function openFile(at: Omit<OpenInEditorRequest, "editor">): Promise<void> {
  try {
    await window.canvasHost.openInEditor({ ...at, editor: getPreferences().codeEditor })
  } catch (error) {
    reportError(error, {
      operation: "editor.open",
      title: "Couldn't open the code",
      description: (error instanceof Error ? error.message : String(error)).replace(
        /^Error invoking remote method '[^']+': (Error: )?/,
        ""
      )
    })
  }
}
