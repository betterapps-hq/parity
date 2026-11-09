import { readFileSync, writeFileSync } from "node:fs"
import { homedir, platform, release, arch } from "node:os"
import { join, resolve } from "node:path"
import { desktopDataFolder, diagnosticFiles, lastRunCrash } from "@parity-app/telemetry"
import { z } from "zod"
import { readEvents } from "./logs.ts"
import { zipFiles } from "./zip.ts"

/**
 * `parity diagnostics`: a zip of what Help > Report a problem sends (PAR-635), for a bug filed by hand: the last hour
 * of the local log, the versions, the projects open in that hour, and the latest run that didn't quit. Reads the files
 * main writes, so it works with the app closed, or crashed.
 */

export interface DiagnosticsResult {
  path: string
  files: string[]
  /** The run whose crash is in it, if one is. */
  crashed?: string
}

/** The app's data folder for this system and its variables. */
function dataFolder(env: NodeJS.ProcessEnv = process.env): string {
  return desktopDataFolder({ platform: process.platform, env, home: homedir() })
}

const versioned = z.object({ version: z.string() })

/** The `version` a JSON file names, or "unknown" when it names none. Throws when the file isn't JSON. */
function versionIn(text: string): string {
  return versioned.safeParse(JSON.parse(text)).data?.version ?? "unknown"
}

/** The installed app's version, from the file main keeps, or "unknown" when it hasn't run. */
function appVersion(folder: string): string {
  try {
    return versionIn(readFileSync(join(folder, "installed-build.json"), "utf8"))
  } catch {
    return "unknown"
  }
}

/** This CLI's version, from its package.json, which sits beside both src and dist. */
export function cliVersion(): string {
  try {
    return versionIn(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
  } catch {
    return "unknown"
  }
}

/** Writes the zip to `out`, or `parity-diagnostics-<time>.zip` here. `folder` and `now` are for tests. */
export function writeDiagnostics({
  out,
  folder = dataFolder(),
  now = new Date()
}: { out?: string; folder?: string; now?: Date } = {}): DiagnosticsResult {
  const events = readEvents(join(folder, "logs"))
  // The latest run that didn't quit: the one open now, if Parity is running, which is said in the README.
  const crash = lastRunCrash(events, "")

  const files = diagnosticFiles({
    events,
    now: now.getTime(),
    versions: {
      parity: appVersion(folder),
      cli: cliVersion(),
      node: process.versions.node,
      system: `${platform()} ${release()} ${arch()}`
    },
    crash
  })

  const path = resolve(out ?? `parity-diagnostics-${now.toISOString().replace(/[:.]/g, "-")}.zip`)
  writeFileSync(path, zipFiles(files, now))

  const result: DiagnosticsResult = { path, files: files.map((file) => file.name) }

  if (crash) {
    result.crashed = crash.sessionId
  }

  return result
}

export function describeDiagnostics({ path, files, crashed }: DiagnosticsResult): string {
  const lines = [`Wrote ${path}, with ${files.join(", ")}.`]

  if (crashed) {
    lines.push(`crash.json is the latest run that didn't quit, ${crashed}; if Parity is open, that's this run.`)
  }

  lines.push("Attach it to the bug, and check it first: logs can name your files and projects.")

  return lines.join("\n")
}
