import { readdir, readFile } from "node:fs/promises"
import { join, normalize, relative, sep } from "node:path"

const root = join(import.meta.dirname, "..", "skills")

/** Reads the Parity design skill: SKILL.md, or a file it references. */
export async function readSkill(path = "SKILL.md"): Promise<string> {
  const target = normalize(join(root, path))
  if (relative(root, target).startsWith("..") || relative(root, target).includes(`..${sep}`)) {
    throw new Error(`${path} isn't part of the skill`)
  }
  try {
    return await readFile(target, "utf8")
  } catch {
    const files = await list()
    throw new Error(`No skill file ${path}. Files: ${files.join(", ")}`)
  }
}

async function list(directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? list(join(directory, entry.name))
        : [relative(root, join(directory, entry.name)).replaceAll("\\", "/")]
    )
  )
  return files.flat()
}
