import { describe, expect, it } from "vite-plus/test"
import { describeCall, extensionsDebug } from "./debug.ts"

const multiplayer = { id: "@parity-app/extension-multiplayer", prefix: "multiplayer" }
const agentPresence = { id: "@parity-app/extension-agent-presence", prefix: "agentPresence" }

describe("PARITY_EXTENSIONS_DEBUG", () => {
  it("traces nothing while it's unset, empty or turned off", () => {
    for (const value of [undefined, "", " ", "0", "false", "off"]) {
      expect(extensionsDebug(value)(multiplayer)).toBe(false)
    }
  })

  it("traces every extension for 1, true, all or *", () => {
    for (const value of ["1", "true", "ALL", "*"]) {
      expect(extensionsDebug(value)(multiplayer)).toBe(true)
      expect(extensionsDebug(value)(agentPresence)).toBe(true)
    }
  })

  it("traces the extensions it names, by prefix or id, separated by commas", () => {
    const byPrefix = extensionsDebug("multiplayer")
    expect(byPrefix(multiplayer)).toBe(true)
    expect(byPrefix(agentPresence)).toBe(false)

    const both = extensionsDebug(" @parity-app/extension-multiplayer , agentPresence ")
    expect(both(multiplayer)).toBe(true)
    expect(both(agentPresence)).toBe(true)
  })

  it("writes a call as its direction, what was called and how long it took, saying when it failed", () => {
    expect(describeCall({ direction: "in", api: "selection.onChange", durationMs: 0.44, outcome: "ok" })).toBe(
      "in selection.onChange 0.4 ms"
    )
    expect(describeCall({ direction: "out", api: "host.join", durationMs: 12.6, outcome: "error" })).toBe(
      "out host.join 13 ms, failed"
    )
  })
})
