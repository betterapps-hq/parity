import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { type CopyEntry, readCopyEntry } from "./routing.ts"

/**
 * Where running copies of Parity say how to reach them (PAR-514): one entry per copy, named by its main process, in
 * `~/.parity/agents`. Each copy writes and removes only its own. The app and the CLI both go through here, so the
 * format and the place live in one module. What a copy has open isn't here: the CLI asks each copy, live.
 *
 * `PARITY_AGENT_FILE` names one file instead, for a copy kept apart from the person's, as `pnpm perf`, the end-to-end
 * tests and the backtest run: that copy writes only that file, and a CLI given it reaches only that copy.
 */
export interface Registry {
  /** The folder of entries, or the one file a copy kept apart uses. */
  kind: "folder" | "file"
  path: string
}

/** The registry these settings name: `PARITY_AGENT_FILE`, else `PARITY_AGENT_DIR`, else `~/.parity/agents`. */
export function agentRegistry(env: Record<string, string | undefined>, home: string): Registry {
  if (env.PARITY_AGENT_FILE) return { kind: "file", path: env.PARITY_AGENT_FILE }
  return { kind: "folder", path: env.PARITY_AGENT_DIR || join(home, ".parity", "agents") }
}

/** The file before the registry, where an app from before it says how to reach it. */
export function legacyAgentFile(home: string): string {
  return join(home, ".parity", "agent.json")
}

/** Where a copy's own entry goes. */
export function entryPath(registry: Registry, app: number): string {
  return registry.kind === "file" ? registry.path : join(registry.path, `${app}.json`)
}

/** Writes a copy's entry, readable by the person's account only, since it holds the copy's token. */
export function writeEntry(registry: Registry, entry: CopyEntry): void {
  const path = entryPath(registry, entry.app)
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, JSON.stringify(entry, null, 2), { mode: 0o600 })
}

/** Removes a copy's entry as it quits, unless the file there names another copy. */
export function removeEntry(registry: Registry, app: number): void {
  const path = entryPath(registry, app)
  const entry = readCopyEntry(readText(path))
  if (entry?.app === app) rmSync(path, { force: true })
}

/** Removes an entry the CLI found for a copy that isn't running. */
export function removeStaleEntry(registry: Registry, entry: CopyEntry): void {
  if (registry.kind === "folder") rmSync(entryPath(registry, entry.app), { force: true })
}

/**
 * Every entry the registry has, with the file before the registry when an older app wrote it, so a CLI reaches an app
 * from before the registry too.
 */
export function readEntries(registry: Registry, home: string): CopyEntry[] {
  if (registry.kind === "file") {
    const entry = readCopyEntry(readText(registry.path))
    return entry ? [entry] : []
  }
  let names: string[] = []
  try {
    names = readdirSync(registry.path).filter((name) => /^\d+\.json$/.test(name))
  } catch {
    // No copy has started since the registry began.
  }
  const entries = names.flatMap((name) => {
    const entry = readCopyEntry(readText(join(registry.path, name)))
    return entry ? [entry] : []
  })
  const legacy = readCopyEntry(readText(legacyAgentFile(home)))
  if (legacy && !entries.some((entry) => entry.url === legacy.url)) entries.push(legacy)
  return entries
}

/** Whether a process is still running. One the person's account can't signal still is. */
export function isRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM"
  }
}

function readText(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}
