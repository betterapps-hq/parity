import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * This install's ID for telemetry, kept in `file` across runs: made at random the first time, or when the file holds
 * something else. If it can't be saved, it's still used for this run.
 */
export function readInstallId(file: string): string {
  try {
    const saved = readFileSync(file, "utf8").trim()
    if (uuid.test(saved)) return saved
  } catch {
    // Not made yet.
  }
  const id = randomUUID()
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, id)
  } catch {
    // A folder that can't be written gives a new ID each run.
  }
  return id
}
