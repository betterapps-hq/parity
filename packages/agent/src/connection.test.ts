import { join } from "node:path"
import { describe, expect, it } from "vite-plus/test"
import {
  type AgentConnection,
  agentFilePath,
  asksToTakeOver,
  claimAgentFile,
  connectionChain,
  readAgentConnection,
  releaseAgentFile
} from "./connection.ts"

/** The person's app, a second copy (`pnpm perf` or a session's) and a third. */
const person: AgentConnection = { url: "http://127.0.0.1:4100", token: "person", pid: 11, app: 10 }
const second: AgentConnection = { url: "http://127.0.0.1:4200", token: "second", pid: 21, app: 20 }
const third: AgentConnection = { url: "http://127.0.0.1:4300", token: "third", pid: 31, app: 30 }

describe("agentFilePath", () => {
  it("is ~/.parity/agent.json unless PARITY_AGENT_FILE names another", () => {
    expect(agentFilePath({}, "/home/person")).toBe(join("/home/person", ".parity", "agent.json"))
    expect(agentFilePath({ PARITY_AGENT_FILE: "/tmp/perf/agent.json" }, "/home/person")).toBe("/tmp/perf/agent.json")
  })
})

describe("asksToTakeOver", () => {
  it("is asked with PARITY_AGENT_TAKE_OVER=1 only", () => {
    expect(asksToTakeOver({ PARITY_AGENT_TAKE_OVER: "1" })).toBe(true)
    expect(asksToTakeOver({})).toBe(false)
    expect(asksToTakeOver({ PARITY_AGENT_TAKE_OVER: "0" })).toBe(false)
  })
})

describe("readAgentConnection", () => {
  it("reads a connection and what it took over", () => {
    const text = JSON.stringify({ ...second, previous: person })
    expect(readAgentConnection(text)).toEqual({ ...second, previous: person })
  })
  it("takes a file without a copy for its service's copy", () => {
    expect(readAgentConnection(JSON.stringify({ url: person.url, token: "t", pid: 5 }))).toEqual({
      url: person.url,
      token: "t",
      pid: 5,
      app: 5
    })
  })
  it("reads nothing from a missing, broken or foreign file", () => {
    expect(readAgentConnection(undefined)).toBeUndefined()
    expect(readAgentConnection("{")).toBeUndefined()
    expect(readAgentConnection("[]")).toBeUndefined()
    expect(readAgentConnection(JSON.stringify({ url: person.url, token: 1, pid: 5 }))).toBeUndefined()
  })
  it("drops a broken connection it took over, keeping its own", () => {
    expect(readAgentConnection(JSON.stringify({ ...second, previous: { url: 1 } }))).toEqual(second)
  })
})

describe("connectionChain", () => {
  it("lists the file's connection, then what each took over", () => {
    expect(connectionChain({ ...third, previous: { ...second, previous: person } }).map((entry) => entry.app)).toEqual([
      30, 20, 10
    ])
    expect(connectionChain(undefined)).toEqual([])
  })
})

describe("claimAgentFile", () => {
  it("takes a missing file", () => {
    expect(claimAgentFile({ current: undefined, running: undefined, mine: second, takeOver: false })).toEqual({
      kind: "take",
      write: second
    })
  })
  it("takes a file whose copy is gone, without keeping it", () => {
    expect(claimAgentFile({ current: person, running: undefined, mine: second, takeOver: false })).toEqual({
      kind: "take",
      write: second
    })
  })
  it("leaves a running copy's file alone", () => {
    expect(claimAgentFile({ current: person, running: person, mine: second, takeOver: false })).toEqual({
      kind: "leave",
      owner: person
    })
  })
  it("takes a running copy's file when asked, keeping that copy to give back", () => {
    expect(claimAgentFile({ current: person, running: person, mine: second, takeOver: true })).toEqual({
      kind: "take",
      write: { ...second, previous: person }
    })
  })
  it("takes its own file back when its service restarts, still keeping what it took over", () => {
    const current = { ...second, previous: person }
    const restarted = { ...second, url: "http://127.0.0.1:4201", token: "again", pid: 22 }
    expect(claimAgentFile({ current, running: current, mine: restarted, takeOver: false })).toEqual({
      kind: "take",
      write: { ...restarted, previous: person }
    })
  })
  it("gives a file naming a copy that's gone back to the running copy that copy took over", () => {
    const current = { ...second, previous: person }
    expect(claimAgentFile({ current, running: person, mine: third, takeOver: false })).toEqual({
      kind: "leave",
      owner: person,
      write: person
    })
  })
  it("keeps only where it is, not a chain it was handed", () => {
    expect(
      claimAgentFile({ current: undefined, running: undefined, mine: { ...second, previous: person }, takeOver: false })
    ).toEqual({ kind: "take", write: second })
  })
})

describe("releaseAgentFile", () => {
  const running = (apps: number[]) => (connection: AgentConnection) => apps.includes(connection.app)

  it("keeps a file naming another copy, or none", () => {
    expect(releaseAgentFile(person, second.app, running([10, 20]))).toEqual({ kind: "keep" })
    expect(releaseAgentFile(undefined, second.app, running([10, 20]))).toEqual({ kind: "keep" })
  })
  it("removes its own file when it took over no copy that's running", () => {
    expect(releaseAgentFile(second, second.app, running([20]))).toEqual({ kind: "remove" })
    expect(releaseAgentFile({ ...second, previous: person }, second.app, running([20]))).toEqual({ kind: "remove" })
  })
  it("gives its own file back to the copy it took over", () => {
    expect(releaseAgentFile({ ...second, previous: person }, second.app, running([10, 20]))).toEqual({
      kind: "restore",
      write: person
    })
  })
  it("gives it back to the newest copy in its chain that's still running", () => {
    const current = { ...third, previous: { ...second, previous: person } }
    expect(releaseAgentFile(current, third.app, running([10, 30]))).toEqual({ kind: "restore", write: person })
    expect(releaseAgentFile(current, third.app, running([10, 20, 30]))).toEqual({
      kind: "restore",
      write: { ...second, previous: person }
    })
  })
})
