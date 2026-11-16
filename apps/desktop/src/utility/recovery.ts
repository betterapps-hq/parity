import { createHash } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { type RecoveryCopy, readRecoveryCopy } from "@parity-app/editor"
import { degraded } from "./degraded.ts"

/**
 * Recovery copies of projects' unsaved changes (PAR-905), one file a project in Parity's app data
 * (`PARITY_RECOVERY_DIR`), named by a hash of its folder. The window keeps one while a project has unsaved changes and
 * removes it once they're saved or discarded, so a crash or a forced quit leaves it for the next open to offer back.
 * The project's own files are never written. Without a folder, as in tests of other modules, nothing is kept.
 */
export interface Recovery {
  /** Keeps a project's copy, or removes it when there's none. Writes for a project are made one at a time. */
  keep(root: string, copy: RecoveryCopy | undefined): Promise<void>
  /** The copy kept for a project, or nothing when there's none or it can't be read. */
  read(root: string): Promise<RecoveryCopy | undefined>
}

export function createRecovery(folder: string | undefined): Recovery {
  const writing = new Map<string, Promise<void>>()

  return {
    keep(root, copy) {
      if (!folder) {
        return Promise.resolve()
      }

      const file = recoveryFile(folder, root)

      const next = (writing.get(file) ?? Promise.resolve()).then(() =>
        copy ? write(folder, file, JSON.stringify(copy)) : remove(file)
      )

      writing.set(file, next)

      return next
    },
    async read(root) {
      if (!folder) {
        return undefined
      }

      const file = recoveryFile(folder, root)
      await writing.get(file)
      const text = await readFile(file, "utf8").catch(() => undefined)

      if (text === undefined) {
        return undefined
      }

      try {
        return readRecoveryCopy(JSON.parse(text))
      } catch {
        return undefined
      }
    }
  }
}

/** A project's copy, named by its folder's hash, since a path can't be a file name. */
export function recoveryFile(folder: string, root: string): string {
  return join(folder, `${createHash("sha256").update(root).digest("hex").slice(0, 32)}.json`)
}

/** Written beside the copy and renamed over it, so a reader never finds half a copy. */
async function write(folder: string, file: string, text: string): Promise<void> {
  const partial = `${file}.${process.pid}.partial`

  try {
    await mkdir(folder, { recursive: true })
    await writeFile(partial, text)
    await rename(partial, file)
  } catch (error) {
    degraded("recovery", "couldn't keep a recovery copy of unsaved changes", error)
  }
}

async function remove(file: string): Promise<void> {
  try {
    await rm(file, { force: true })
  } catch (error) {
    degraded("recovery", "couldn't remove a recovery copy", error)
  }
}
