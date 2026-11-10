import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { z } from "zod"

/** How many times a rename another process holds the file for is tried, and how long apart, in milliseconds. */
const renameTries = 5

const renameGap = 40

/**
 * The items in a small JSON file of main's that holds `{ [list]: [...] }`, each checked with `item`: one that doesn't
 * read is left out, and a file that can't be read gives none. For lists that are a convenience or a count, where
 * starting again beats failing.
 */
export async function readItems<T>(file: string, list: string, item: z.ZodType<T>): Promise<T[]> {
  try {
    const parsed = z.record(z.string(), z.unknown()).safeParse(JSON.parse(await readFile(file, "utf8")))
    const items = z.array(z.unknown()).safeParse(parsed.data?.[list])

    return items.success ? items.data.flatMap((each) => item.safeParse(each).data ?? []) : []
  } catch {
    return []
  }
}

/**
 * Replaces a JSON file whole: written beside it under a name no other copy of Parity uses, then renamed over it, so a
 * reader never sees half a file. On Windows a rename fails while another process has the file open, so it's tried a
 * few times.
 */
export async function writeJson<Value>(file: string, value: Value): Promise<void> {
  const partial = `${file}.${process.pid}-${randomUUID()}.tmp`
  await mkdir(dirname(file), { recursive: true })
  await writeFile(partial, JSON.stringify(value))

  for (let tried = 1; ; tried++) {
    try {
      await rename(partial, file)

      return
    } catch (error) {
      const code = z.object({ code: z.string() }).safeParse(error).data?.code

      if (tried >= renameTries || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
        await rm(partial, { force: true })
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, renameGap * tried))
    }
  }
}
