import { readFile, stat } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

/** The largest file the Code section shows the lines of; a bigger one is opened in the editor instead. */
const largestFile = 1024 * 1024

/**
 * A project's file as text, for the Code section to show the lines an element is written on (PAR-167). `path` is from
 * the project's root, as an element's source gives it; a file outside the project's folder is refused.
 */
export async function readProjectFile(root: string, path: string): Promise<{ text: string }> {
  const file = resolve(root, path)
  const inside = relative(root, file)
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) throw new Error(`${path} isn't in the project's folder`)
  if ((await stat(file)).size > largestFile) throw new Error(`${path} is too big to show; open it in your editor`)
  return { text: await readFile(file, "utf8") }
}
