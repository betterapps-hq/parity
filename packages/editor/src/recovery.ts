import { type CanvasDocument, canvasDocument, type ModeSettings, modeSettings } from "@parity-app/core"
import { z } from "zod"
import type { TokenEdit } from "./token-edits.ts"

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

/** The label of the undo step a restore makes. */
export const restoreLabel = "Restore unsaved changes"

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
