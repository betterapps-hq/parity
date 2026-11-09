import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateRawSync } from "node:zlib"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import { describeDiagnostics, writeDiagnostics } from "./diagnostics.ts"
import type { LogEvent } from "./logs.ts"
import { zipFiles } from "./zip.ts"

let folder: string

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "parity-diagnostics-"))
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

const event = (sessionId: string, name: string, time: string, project?: string): LogEvent => {
  const logged: LogEvent = {
    process: "main",
    installId: "install",
    sessionId,
    name,
    time,
    level: "info",
    attributes: {}
  }

  if (project) {
    logged.project = project
  }

  return logged
}

/** The files in a zip, by reading each local header in turn. */
function unzip(zip: Buffer): Map<string, string> {
  const files = new Map<string, string>()
  let at = 0

  while (zip.readUInt32LE(at) === 0x04034b50) {
    const packed = zip.readUInt32LE(at + 18)
    const nameLength = zip.readUInt16LE(at + 26)
    const name = zip.toString("utf8", at + 30, at + 30 + nameLength)
    const start = at + 30 + nameLength
    files.set(name, inflateRawSync(zip.subarray(start, start + packed)).toString("utf8"))
    at = start + packed
  }

  return files
}

describe("zipFiles", () => {
  it("writes files an unzip can read back", () => {
    const zip = zipFiles([
      { name: "a.json", text: "{}" },
      { name: "b.txt", text: "é".repeat(500) }
    ])

    expect(Object.fromEntries(unzip(zip))).toEqual({ "a.json": "{}", "b.txt": "é".repeat(500) })
    // The end of central directory record names both files.
    expect(zip.readUInt16LE(zip.length - 12)).toBe(2)
  })
})

describe("writeDiagnostics", () => {
  it("zips the last hour of logs, versions, projects and the run that didn't quit", () => {
    mkdirSync(join(folder, "logs"))
    writeFileSync(join(folder, "installed-build.json"), JSON.stringify({ version: "0.20.0" }))

    const lines = [
      event("run-1", "app.started", "2026-11-06T09:00:00.000Z"),
      event("run-1", "app.quit", "2026-11-06T09:10:00.000Z"),
      event("run-2", "app.started", "2026-11-06T11:30:00.000Z"),
      event("run-2", "project.opened", "2026-11-06T11:31:00.000Z", "/site")
    ]

    writeFileSync(join(folder, "logs", "parity-2026-11-06.jsonl"), lines.map((line) => JSON.stringify(line)).join("\n"))
    const out = join(folder, "out.zip")
    const result = writeDiagnostics({ out, folder, now: new Date("2026-11-06T12:00:00.000Z") })
    expect(result).toMatchObject({ path: out, crashed: "run-2" })
    const files = unzip(readFileSync(out))
    expect([...files.keys()]).toEqual(["logs.jsonl", "versions.json", "projects.json", "crash.json"])
    expect(files.get("logs.jsonl")?.split("\n")).toHaveLength(2)
    expect(JSON.parse(files.get("versions.json") ?? "")).toMatchObject({ parity: "0.20.0" })
    expect(JSON.parse(files.get("projects.json") ?? "")).toEqual(["/site"])
    expect(describeDiagnostics(result)).toContain("run-2")
  })

  it("writes an empty log when Parity hasn't run", () => {
    const out = join(folder, "out.zip")
    const result = writeDiagnostics({ out, folder })
    expect(result.crashed).toBeUndefined()
    expect(unzip(readFileSync(out)).get("versions.json")).toContain('"parity": "unknown"')
  })
})
