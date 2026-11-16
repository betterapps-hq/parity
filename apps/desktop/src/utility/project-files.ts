import { randomUUID } from "node:crypto"
import { mkdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { insideProject } from "@parity-app/project"

/** How many times a rename another process holds the file for is tried, and how long apart, in milliseconds. */
const renameTries = 5

const renameGap = 40

/**
 * Writes a project's file whole: under a hidden name beside it, then renamed over it, so a save that's cut off leaves
 * the file as it was and the watcher never reads half of one. `path` is from the root and must be inside it, as must
 * wherever a symlink on the way leads; a symlink to a file in the project stays a symlink, with its file written. On
 * Windows a rename fails while another process has the file open, so it's tried a few times. Resolves once the file
 * holds `content`.
 */
export async function writeProjectFile(root: string, path: string, content: string | Uint8Array): Promise<void> {
  const target = await realTarget(root, path)
  await mkdir(dirname(target), { recursive: true })

  const partial = join(dirname(target), `.${basename(target)}.${process.pid}-${randomUUID()}.tmp`)

  const mode = await stat(target).then(
    (found) => found.mode,
    () => undefined
  )

  try {
    await writeFile(partial, content, mode === undefined ? {} : { mode })
    await renameOver(partial, target)
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined)
    throw error
  }
}

/** Removes a project's file, refused the same way as a write when it's outside the project. */
export async function removeProjectFile(root: string, path: string): Promise<void> {
  await rm(await realTarget(root, path, { follow: false }), { force: true })
}

/**
 * Where a write to `path` lands: inside the root by its path, and still inside it once symlinks are followed, from the
 * root's real folder. With `follow`, a symlinked file is where it leads; without, the link itself.
 */
async function realTarget(root: string, path: string, { follow = true } = {}): Promise<string> {
  const target = insideProject(root, path)

  if (!target) {
    throw new Error(`${path} is outside the project`)
  }

  const realRoot = await realpath(root)
  let existing = follow ? target : dirname(target)
  const rest: string[] = follow ? [] : [basename(target)]

  // The nearest part of the path on disk, so a folder about to be made still counts where its parent leads.
  for (;;) {
    const real = await realpath(existing).catch(() => undefined)

    if (real !== undefined) {
      const landed = join(real, ...rest)

      if (!insideProject(realRoot, landed)) {
        throw new Error(`${path} links outside the project`)
      }

      return landed
    }

    rest.unshift(basename(existing))
    existing = dirname(existing)
  }
}

async function renameOver(partial: string, target: string): Promise<void> {
  for (let tried = 1; ; tried++) {
    try {
      await rename(partial, target)

      return
    } catch (error) {
      const code = error instanceof Error && "code" in error ? error.code : undefined

      if (tried >= renameTries || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, renameGap * tried))
    }
  }
}
