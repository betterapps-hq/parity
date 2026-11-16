import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { envSecrets } from "@parity-app/telemetry"

/** `.env`, `.env.local` and every other `.env.*` file. */
const envFile = /^\.env(?:\..+)?$/

/**
 * The values worth scrubbing from telemetry in the `.env` files at each project's root (PAR-672), without repeats. A
 * file that can't be read is skipped.
 */
export async function projectEnvSecrets(roots: readonly string[]): Promise<string[]> {
  const values = new Set<string>()

  for (const root of roots) {
    const names = await readdir(root).catch(() => [])

    for (const name of names.filter((candidate) => envFile.test(candidate)).sort()) {
      const text = await readFile(join(root, name), "utf8").catch(() => "")

      for (const value of envSecrets(text)) {
        values.add(value)
      }
    }
  }

  return [...values]
}
