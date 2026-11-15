import { type CanvasDocument, type ContainerSpec, defaultModeSettings, type ModeSettings } from "@parity-app/core"
import type { Persistence } from "@parity-app/multiplayer"
import { type DocSession, openDocSession } from "./project-doc.ts"

/**
 * A project document for tests and stories, as `openDocSession` opens one for a project, with nothing written unless
 * `saveDocument` says how: its files, its modes (the defaults), its main file (the first, or `app.par`), and automatic
 * saving off.
 */
export function openTestSession(
  files: readonly { path: string; document: CanvasDocument }[],
  options: {
    modes?: ModeSettings
    main?: string
    drawn?: readonly { path: string; document: CanvasDocument }[]
    libraryDesigns?: readonly ContainerSpec[]
    saveDocument?: Persistence["saveDocument"]
    autosave?: () => boolean
  } = {}
): DocSession {
  return openDocSession({
    files,
    drawn: options.drawn ?? [],
    modes: options.modes ?? defaultModeSettings,
    main: options.main ?? files[0]?.path ?? "app.par",
    persistence: {
      saveDocument: options.saveDocument ?? (async () => undefined),
      deleteDocument: async () => undefined,
      autosave: options.autosave ?? (() => false)
    },
    libraryDesigns: options.libraryDesigns ?? []
  })
}
