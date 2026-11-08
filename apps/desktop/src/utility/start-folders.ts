import { stat } from "node:fs/promises"
import { dirname, join } from "node:path"

/**
 * What the start page needs to know about folders on this computer (PAR-188): which of its projects' folders aren't
 * there any more, and where the example project is, when this copy of Parity can reach it.
 */
export async function checkStartFolders(
  roots: readonly string[],
  from = import.meta.dirname
): Promise<{ missing: string[]; example?: string }> {
  const [missing, example] = await Promise.all([missingFolders(roots), exampleFolder(from)])
  return { missing, ...(example ? { example } : {}) }
}

/**
 * The folders of these that aren't there: moved, renamed, deleted, or on a drive that isn't plugged in. One Parity
 * can't read for another reason, such as permissions, isn't counted, since it may well be there.
 */
export async function missingFolders(roots: readonly string[]): Promise<string[]> {
  const found = await Promise.all(roots.map(async (root) => ((await isGone(root)) ? root : undefined)))
  return found.filter((root) => root !== undefined)
}

async function isGone(path: string): Promise<boolean> {
  try {
    return !(await stat(path)).isDirectory()
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === "ENOENT" || code === "ENOTDIR"
  }
}

/** Where the example lives in Parity's repository, beside the app. */
const examplePath = join("examples", "shadcn-vite")

/**
 * The example project, Acme, found in a folder above `from` with its packages installed, as it is when Parity runs
 * from its repository. An installed copy doesn't have it yet, so there's none.
 */
export async function exampleFolder(from: string): Promise<string | undefined> {
  for (let folder = from; ; folder = dirname(folder)) {
    const example = join(folder, examplePath)
    if ((await exists(join(example, "package.json"))) && (await exists(join(example, "node_modules")))) return example
    if (dirname(folder) === folder) return undefined
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}
