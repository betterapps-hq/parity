import { toast } from "sonner"
import type { ProjectSession } from "../workspace.ts"
import { getPreferences } from "./preferences.ts"

/**
 * A component's code, as an absolute path: the project's own component's file, or a library component's type
 * declarations, which is the code the project has of it. None for a library component without them.
 */
export function componentFile(session: ProjectSession, component: string): string | undefined {
  const source = session.info.sources[component]
  if (!source) return undefined
  const relative = source.library ? source.declaration : source.path
  if (!relative) return undefined
  const root = session.info.root
  // The root's own separator, so the path reads as the system writes it.
  const separator = root.includes("\\") ? "\\" : "/"
  return `${root.replace(/[\\/]+$/, "")}${separator}${relative.replace(/^[.][\\/]/, "").replaceAll(/[\\/]/g, separator)}`
}

/** Opens a component's code in the editor Settings names, at the line of its export (PAR-527). */
export async function viewCode(session: ProjectSession, component: string): Promise<void> {
  const file = componentFile(session, component)
  const source = session.info.sources[component]
  if (!file || !source) return
  try {
    // A part named through its family, as `Dialog.Root`, is found by the family's export.
    const name = source.export.split(".")[0]
    await window.canvasHost.openInEditor({ file, export: name, editor: getPreferences().codeEditor })
  } catch (error) {
    toast.error("Couldn't open the code", {
      description: (error instanceof Error ? error.message : String(error)).replace(
        /^Error invoking remote method '[^']+': (Error: )?/,
        ""
      )
    })
  }
}
