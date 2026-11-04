import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test"
import {
  agentRegistry,
  entryPath,
  isRunning,
  legacyAgentFile,
  readEntries,
  type Registry,
  removeEntry,
  removeStaleEntry,
  writeEntry
} from "./registry.ts"
import type { CopyEntry } from "./routing.ts"

let home = ""
let registry: Registry
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "parity-registry-"))
  registry = agentRegistry({}, home)
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

function entry(app: number): CopyEntry {
  return { version: 1, url: `http://127.0.0.1:${4000 + app}`, token: `token-${app}`, app, startedAt: app * 100 }
}

describe("agentRegistry", () => {
  it("is ~/.parity/agents, PARITY_AGENT_DIR, or the one file PARITY_AGENT_FILE names", () => {
    expect(agentRegistry({}, "/home/person")).toEqual({
      kind: "folder",
      path: join("/home/person", ".parity", "agents")
    })
    expect(agentRegistry({ PARITY_AGENT_DIR: "/tmp/agents" }, "/home/person")).toEqual({
      kind: "folder",
      path: "/tmp/agents"
    })
    expect(agentRegistry({ PARITY_AGENT_FILE: "/tmp/perf/agent.json", PARITY_AGENT_DIR: "/x" }, "/h")).toEqual({
      kind: "file",
      path: "/tmp/perf/agent.json"
    })
  })
})

describe("the registry", () => {
  it("lists each copy that wrote its entry, and forgets one as it quits", () => {
    writeEntry(registry, entry(10))
    writeEntry(registry, entry(20))
    expect(readEntries(registry, home).sort((a, b) => a.app - b.app)).toEqual([entry(10), entry(20)])
    removeEntry(registry, 10)
    expect(readEntries(registry, home)).toEqual([entry(20)])
  })

  it("lists an app from before the registry, once", () => {
    writeEntry(registry, entry(10))
    writeFileSync(legacyAgentFile(home), JSON.stringify({ url: entry(30).url, token: "old", pid: 30 }))
    expect(readEntries(registry, home).map((found) => found.app)).toEqual([10, 30])
    writeFileSync(legacyAgentFile(home), JSON.stringify({ url: entry(10).url, token: "token-10", pid: 11 }))
    expect(readEntries(registry, home).map((found) => found.app)).toEqual([10])
  })

  it("ignores files that aren't entries", () => {
    writeEntry(registry, entry(10))
    writeFileSync(join(registry.path, "notes.json"), JSON.stringify(entry(40)))
    writeFileSync(join(registry.path, "50.json"), "{")
    expect(readEntries(registry, home)).toEqual([entry(10)])
  })

  it("removes a stale entry the CLI found", () => {
    writeEntry(registry, entry(10))
    removeStaleEntry(registry, entry(10))
    expect(readEntries(registry, home)).toEqual([])
  })

  it("is empty before any copy has started", () => {
    expect(readEntries(registry, home)).toEqual([])
  })
})

describe("a copy kept apart with PARITY_AGENT_FILE", () => {
  it("writes only that file, and keeps another copy's there when it quits", () => {
    const file: Registry = agentRegistry({ PARITY_AGENT_FILE: join(home, "perf", "agent.json") }, home)
    writeEntry(file, entry(10))
    expect(entryPath(file, 10)).toBe(file.path)
    expect(readEntries(file, home)).toEqual([entry(10)])
    writeEntry(file, entry(20))
    removeEntry(file, 10)
    expect(JSON.parse(readFileSync(file.path, "utf8"))).toEqual(entry(20))
    removeEntry(file, 20)
    expect(readEntries(file, home)).toEqual([])
  })
})

describe("isRunning", () => {
  it("is true for this process and false for one that can't exist", () => {
    expect(isRunning(process.pid)).toBe(true)
    expect(isRunning(0)).toBe(false)
    expect(isRunning(2 ** 31 - 2)).toBe(false)
  })
})
