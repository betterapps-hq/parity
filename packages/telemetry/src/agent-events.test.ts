import { describe, expect, it } from "vite-plus/test"
import {
  agentCallAnswered,
  agentCallFailed,
  agentCallStart,
  cliEvents,
  createScrubber,
  createTelemetry,
  createTestSink,
  endWhenSettled,
  registeredEvents
} from "./index.ts"

describe("agentCallStart", () => {
  it("names the operation, how it came, who sent it and its inputs", () => {
    const body = JSON.stringify({
      method: "screenshot",
      params: { design: "Card", scale: 2 },
      agent: "Claude",
      agentId: "Claude#1",
      client: "claude-code",
      transport: "mcp"
    })

    expect(agentCallStart(body)).toEqual({
      method: "screenshot",
      transport: "mcp",
      agent: "Claude",
      client: "claude-code",
      input: '{"design":"Card","scale":2}'
    })
  })

  it("keeps an exec call's snippet apart from its other inputs", () => {
    const body = JSON.stringify({ method: "exec", params: { label: "Add", code: "Insert(Card)" }, transport: "cli" })
    expect(agentCallStart(body)).toEqual({
      method: "exec",
      transport: "cli",
      input: '{"label":"Add"}',
      snippet: "Insert(Card)"
    })
  })

  it("keeps what an agent searched for and which result it placed where out of its inputs", () => {
    const search = { method: "photos", params: { query: "my client's office", color: "teal", exclude: ["a"] } }
    const place = { method: "place", params: { connector: "unsplash", id: "abc", node: "home/photo" } }

    expect(agentCallStart(JSON.stringify(search)).input).toBe('{"color":"teal"}')
    expect(agentCallStart(JSON.stringify(place)).input).toBe('{"connector":"unsplash"}')
  })

  it("cuts long inputs and snippets", () => {
    const body = JSON.stringify({ method: "exec", params: { label: "x".repeat(3000), code: "y".repeat(20_000) } })
    const { input, snippet } = agentCallStart(body)
    expect(input).toHaveLength(2001)
    expect(snippet).toHaveLength(10_001)
  })

  it("scrubs a project's secrets before they're escaped or cut", () => {
    const scrubber = createScrubber({ secrets: ['my-"shop"-secret-value', "my-shop-secret-value"] })

    const body = JSON.stringify({
      method: "exec",
      params: { replace: 'token = my-"shop"-secret-value', code: `${"y".repeat(9990)}my-shop-secret-value` }
    })

    const { input, snippet } = agentCallStart(body, scrubber)
    expect(input).toBe(JSON.stringify({ replace: "token = [redacted]" }))
    expect(snippet).toBe(`${"y".repeat(9990)}[redacted]`)
  })

  it("counts a call naming an MCP client as MCP when an older CLI doesn't say how it came", () => {
    expect(agentCallStart(JSON.stringify({ method: "tabs", client: "cursor" })).transport).toBe("mcp")
    expect(agentCallStart(JSON.stringify({ method: "tabs" })).transport).toBe("cli")
  })

  it("reads a body that isn't a JSON object, or names no method, as unreadable", () => {
    expect(agentCallStart("{")).toEqual({ method: "unreadable", transport: "cli" })
    expect(agentCallStart("[1]")).toEqual({ method: "unreadable", transport: "cli" })
    expect(agentCallStart(JSON.stringify({ method: 4 })).method).toBe("unreadable")
  })
})

describe("agentCallAnswered", () => {
  it("gives the answer's size and its warnings by category", () => {
    const answer = {
      ok: true,
      warningGroups: [
        { category: "overlap", severity: "warning", count: 2 },
        { category: "unknown_prop", severity: "warning", count: 1 },
        { category: "overlap", severity: "warning", count: 1 }
      ]
    }

    expect(agentCallAnswered(answer, 120)).toEqual({
      outcome: "ok",
      attributes: { resultBytes: 120, warnings: "overlap:3 unknown_prop:1" }
    })
    expect(agentCallAnswered([{ id: "tab" }], 14)).toEqual({ outcome: "ok", attributes: { resultBytes: 14 } })
  })

  it("ends a snippet that failed without throwing as an error, with its code, retryable and alternatives", () => {
    const failed = { ok: false, details: { code: "unknown_state", retryable: false, alternatives: ["hover", "focus"] } }
    expect(agentCallAnswered(failed, 80)).toEqual({
      outcome: "error",
      attributes: { resultBytes: 80, code: "unknown_state", retryable: false, alternatives: 2 }
    })
    expect(agentCallAnswered({ ok: false, error: "Threw" }, 30).attributes).toEqual({
      resultBytes: 30,
      code: "execution_failed"
    })
  })
})

describe("agentCallFailed", () => {
  it("gives a coded failure's code, whether to retry and how many alternatives", () => {
    const error = Object.assign(new Error("No tab"), {
      details: { code: "unknown_tab", retryable: false, alternatives: ["a", "b", "c"] }
    })

    expect(agentCallFailed(error)).toEqual({
      outcome: "error",
      attributes: { code: "unknown_tab", retryable: false, alternatives: 3 }
    })
    expect(agentCallFailed(new Error("Plain"))).toEqual({ outcome: "error", attributes: {} })
  })
})

describe("agent.called", () => {
  it("is recorded as a span whose attributes match its schema", async () => {
    const sink = createTestSink()

    const telemetry = createTelemetry({
      events: registeredEvents,
      context: { process: "service", installId: "install", sessionId: "session" },
      sinks: [sink],
      check: true
    })

    const span = telemetry.startSpan("agent.called", agentCallStart(JSON.stringify({ method: "exec", params: {} })))
    await endWhenSettled(span, () => ({ ok: false, details: { code: "conflict", retryable: true } }), {
      result: (answer) => agentCallAnswered(answer, 50)
    })
    const [recorded] = sink.named("agent.called")
    expect(recorded).toMatchObject({
      outcome: "error",
      attributes: { method: "exec", transport: "cli", resultBytes: 50, code: "conflict", retryable: true }
    })
    expect(registeredEvents.find((event) => event.name === "agent.called")?.schema.parse(recorded?.attributes)).toEqual(
      recorded?.attributes
    )
  })
})

describe("cliEvents", () => {
  it("are every event the CLI sends", () => {
    expect(registeredEvents.filter((event) => event.sentBy.includes("cli")).map((event) => event.name)).toEqual(
      cliEvents.map((event) => event.name)
    )
  })
})
