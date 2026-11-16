import { describe, expect, it, vi } from "vite-plus/test"
import { createDriverTracker, type Driver, driverTags, runTags, telemetryUser } from "./driver.ts"

const claude = { name: "Claude", id: "Claude#1a2b3c4d", client: "claude-code" }

describe("runTags", () => {
  it("names the test pass from PARITY_TEST_RUN", () => {
    expect(runTags({ PARITY_TEST_RUN: " 1234-1 " })).toEqual({ test_run: "1234-1" })
  })

  it("names none when it's unset or blank", () => {
    expect(runTags({})).toEqual({})
    expect(runTags({ PARITY_TEST_RUN: "  " })).toEqual({})
  })
})

describe("driverTags", () => {
  it("names an agent by its caller name and client", () => {
    expect(driverTags({ kind: "agent", caller: claude })).toEqual({
      driver: "agent",
      agent: "Claude",
      agent_client: "claude-code"
    })
  })

  it("clears the agent's tags for a person", () => {
    expect(driverTags({ kind: "person" })).toEqual({ driver: "person", agent: undefined, agent_client: undefined })
  })
})

describe("telemetryUser", () => {
  it("is the install, named by the tester", () => {
    expect(telemetryUser("install", { PARITY_TESTER: "Sam" }, { kind: "agent", caller: claude })).toEqual({
      id: "install",
      username: "Sam"
    })
  })

  it("is named by the agent's session when no tester is set", () => {
    expect(telemetryUser("install", {}, { kind: "agent", caller: claude })).toEqual({
      id: "install",
      username: "Claude#1a2b3c4d"
    })
  })

  it("is the install alone for a person with no tester", () => {
    expect(telemetryUser("install", { PARITY_TESTER: " " }, { kind: "person" })).toEqual({ id: "install" })
  })
})

describe("createDriverTracker", () => {
  it("goes from a person to an agent and back when the person acts", () => {
    const onChange = vi.fn<(driver: Driver) => void>()
    const tracker = createDriverTracker({ now: () => 0, onChange })
    expect(tracker.current()).toEqual({ kind: "person" })
    tracker.agentCalled(claude)
    expect(tracker.current()).toEqual({ kind: "agent", caller: claude })
    tracker.personActed()
    expect(tracker.current()).toEqual({ kind: "person" })
    expect(onChange.mock.calls).toEqual([[{ kind: "agent", caller: claude }], [{ kind: "person" }]])
  })

  it("gives the controls back to the person once the agent stops calling", () => {
    let time = 0
    const tracker = createDriverTracker({ agentForMs: 1000, now: () => time })
    tracker.agentCalled(claude)
    time = 999
    expect(tracker.current().kind).toBe("agent")
    time = 1000
    expect(tracker.current().kind).toBe("person")
  })

  it("reports a change only when the driver changes", () => {
    const onChange = vi.fn<(driver: Driver) => void>()
    const tracker = createDriverTracker({ now: () => 0, onChange })
    tracker.personActed()
    tracker.agentCalled(claude)
    tracker.agentCalled(claude)
    tracker.agentCalled({ ...claude, id: "Claude#other" })
    expect(onChange).toHaveBeenCalledTimes(2)
  })
})
