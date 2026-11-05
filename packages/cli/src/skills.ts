import { readdir, readFile } from "node:fs/promises"
import { join, normalize, relative, sep } from "node:path"
import { closest, CodedError } from "@parity-app/core/errors"
import { invalidInput } from "./errors.ts"

const root = join(import.meta.dirname, "..", "skills")

/** Reads the Parity design skill: SKILL.md, or a file it references. */
export async function readSkill(path = "SKILL.md"): Promise<string> {
  const target = normalize(join(root, path))
  if (relative(root, target).startsWith("..") || relative(root, target).includes(`..${sep}`)) {
    throw invalidInput("path", `${path} isn't part of the skill`)
  }
  try {
    return await readFile(target, "utf8")
  } catch {
    const files = await list()
    throw new CodedError(`No skill file ${path}. Files: ${files.join(", ")}`, {
      code: "invalid_input",
      field: "path",
      alternatives: closest(path, files)
    })
  }
}

/** Every file in the skill, as paths `readSkill` takes. */
export async function skillFiles(): Promise<string[]> {
  return list()
}

async function list(directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) =>
      entry.isDirectory()
        ? list(join(directory, entry.name))
        : [relative(root, join(directory, entry.name)).replaceAll("\\", "/")]
    )
  )
  return files.flat()
}
