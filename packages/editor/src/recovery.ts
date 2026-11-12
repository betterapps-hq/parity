import { type CanvasDocument, canvasDocument, type ModeSettings, modeSettings } from "@parity-app/core"
import { z } from "zod"
import { sameValue } from "./document-equality.ts"
import { type DesignHistory, type DesignSnapshot, type DesignStep, recordChange, unsavedPaths } from "./history.ts"
import { type TokenEdit, tokenDifferences, tokenKey, withTokenEdits } from "./token-edits.ts"

/*
 * A recovery copy of a project's unsaved changes (PAR-905), kept outside the project so a crash or a forced quit
 * doesn't lose them, and offered back the next time the project opens. Restoring puts them back over whatever the
 * files hold then, unsaved, since an agent often changes a file through the CLI in between.
 */

/** An unsaved project file as it is here, or null for one deleted here. */
export interface RecoveredDocument {
  path: string
  document: CanvasDocument | null
}

export interface RecoveryCopy {
  version: 1
  /** When it was kept, in milliseconds since 1970. */
  keptAt: number
  documents: RecoveredDocument[]
  /** The modes, when they changed here. */
  modes?: ModeSettings
  /** Token values edited and not yet written to the stylesheet, each with the value the stylesheet held. */
  tokens: TokenEdit[]
}

/** What a project's unsaved changes are now, to keep, or nothing when everything is saved. */
export function recoveryCopy(history: DesignHistory, keptAt: number): RecoveryCopy | undefined {
  const { current, saved } = history
  const paths = unsavedPaths(history).filter((path) => current.documents.has(path) || saved.documents.has(path))

  const documents = paths
    .filter((path) => current.documents.get(path) !== saved.documents.get(path))
    .map((path) => ({ path, document: current.documents.get(path) ?? null }))

  const tokens = tokenDifferences(saved.tokens, current.tokens).flatMap((difference): TokenEdit[] => {
    const key = tokenKey(difference.name, difference.theme)
    const edit = current.tokens.get(key)

    if (!edit) {
      return []
    }

    // What the stylesheet holds: the value last saved, or what it had before any edit.
    const original = saved.tokens.get(key)?.value ?? edit.original
    const kept: TokenEdit = { name: edit.name, theme: edit.theme, value: edit.value }

    if (original !== undefined) {
      kept.original = original
    }

    return [kept]
  })

  const copy: RecoveryCopy = { version: 1, keptAt, documents, tokens }

  if (current.modes !== saved.modes && !sameValue(current.modes, saved.modes)) {
    copy.modes = current.modes
  }

  return documents.length > 0 || tokens.length > 0 || copy.modes ? copy : undefined
}

/** The label of the undo step a restore makes. */
export const restoreLabel = "Restore unsaved changes"

/**
 * Puts a copy's changes back into a project just opened, as one undoable step that leaves them unsaved, so Undo goes
 * back to what the files hold and Save writes them. Nothing when the copy holds nothing the project doesn't.
 */
export function restoreRecovery(history: DesignHistory, copy: RecoveryCopy): DesignStep | undefined {
  const documents = new Map(history.current.documents)

  for (const { path, document } of copy.documents) {
    if (document) {
      documents.set(path, document)
    } else {
      documents.delete(path)
    }
  }

  const next: DesignSnapshot = {
    documents,
    modes: copy.modes ?? history.current.modes,
    tokens: withTokenEdits(history.current.tokens, copy.tokens)
  }

  return recordChange(history, restoreLabel, next)
}

const recoveredDocument = z.object({
  path: z.string(),
  document: canvasDocument.nullable()
})

const tokenEdit = z.object({
  name: z.string(),
  theme: z.string(),
  value: z.string(),
  original: z.string().optional()
})

/** A recovery copy as it's kept and sent, each document checked as a project file is. */
export const recoveryCopySchema = z.object({
  version: z.literal(1),
  keptAt: z.number(),
  documents: z.array(recoveredDocument),
  modes: modeSettings.optional(),
  tokens: z.array(tokenEdit)
})

/**
 * A recovery copy read back from its file, or nothing for one that isn't: cut short, or kept by a version of Parity
 * whose copies this one can't read.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the I/O boundary: a file an earlier run wrote
export function readRecoveryCopy(read: unknown): RecoveryCopy | undefined {
  const parsed = recoveryCopySchema.safeParse(read)

  // SAFETY: the schema checks each document as a project file is checked, and the copy's shape as it's kept.
  return parsed.success ? (parsed.data as RecoveryCopy) : undefined
}
