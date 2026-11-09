import type { ElementSource } from "@parity-app/core"
import type { OpenInEditorRequest } from "../../shared/protocol.ts"
import { reportError } from "../report-error.ts"
import type { ProjectSession } from "../workspace.ts"
import { getPreferences } from "./preferences.ts"

/**
 * A component's code, as an absolute path: the project's own component's file, or a library component's type
 * declarations, which is the code the project has of it. None for a library component without them.
 */
export function componentFile(session: ProjectSession, component: string): string | undefined {
  const source = session.info.sources[component]

  if (!source) {
    return undefined
  }

  const relative = source.library ? source.declaration : source.path

  return relative ? projectFile(session, relative) : undefined
}

/** A file of the project, from its root, as an absolute path in the root's own separators, as the system writes it. */
export function projectFile(session: ProjectSession, relative: string): string {
  const root = session.info.root
  const separator = root.includes("\\") ? "\\" : "/"

  return `${root.replace(/[\\/]+$/, "")}${separator}${relative.replace(/^[.][\\/]/, "").replaceAll(/[\\/]/g, separator)}`
}

/** Opens a component's code in the editor Settings names, at the line of its export (PAR-527). */
export async function viewCode(session: ProjectSession, component: string): Promise<void> {
  const file = componentFile(session, component)
  const source = session.info.sources[component]

  if (!file || !source) {
    return
  }

  // A part named through its family, as `Dialog.Root`, is found by the family's export.
  await openFile({ file, export: source.export.split(".")[0] })
}

/** Opens the file an element is written in, at its line (PAR-167). */
export async function openSource(session: ProjectSession, { path, line }: ElementSource): Promise<void> {
  await openFile({ file: projectFile(session, path), line })
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
