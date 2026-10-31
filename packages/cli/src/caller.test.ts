import { describe, expect, it } from "vite-plus/test"
import { cliCallerName, mcpCallerName, sessionCallerId } from "./caller.ts"

describe("sessionCallerId", () => {
  it("keeps same-named MCP sessions distinct after the desktop truncates ids to 80 characters", () => {
    const name = "A".repeat(100)
    const first = sessionCallerId(name, "11111111-1111-4111-8111-111111111111")
    const second = sessionCallerId(name, "22222222-2222-4222-8222-222222222222")
    expect(first).toHaveLength(80)
    expect(first).toBe(`${"A".repeat(71)}#11111111`)
    expect(first.slice(0, 80)).not.toBe(second.slice(0, 80))
    expect(sessionCallerId("Agent", "12345678-rest")).toBe("Agent#12345678")
  })
})

describe("mcpCallerName", () => {
  it("prefers the declared title even when the protocol name mentions another tool", () => {
    expect(mcpCallerName({ name: "codex-proxy", title: " DeepSeek Harness " })).toBe("DeepSeek Harness")
  })

  it("preserves a client's own name without a known-agent table or rewriting", () => {
    expect(mcpCallerName({ name: " deepseek-flash " })).toBe("deepseek-flash")
    expect(mcpCallerName({ name: "my_agent-mcp-client", title: "  " })).toBe("my_agent-mcp-client")
    expect(mcpCallerName({ name: "Visual Studio Code" })).toBe("Visual Studio Code")
  })

  it("uses a neutral fallback without a valid declared identity", () => {
    expect(mcpCallerName(undefined)).toBe("Agent")
    expect(mcpCallerName({ name: 42, title: false })).toBe("Agent")
    expect(mcpCallerName({ name: "  " })).toBe("Agent")
  })
})

describe("cliCallerName", () => {
  it("uses an explicit name regardless of ambient agent variables", () => {
    expect(cliCallerName({ PARITY_AGENT_NAME: " DeepSeek Harness ", CODEX_HOME: "/config", CLAUDECODE: "1" })).toBe(
      "DeepSeek Harness"
    )
  })

  it("does not infer identity from another tool's environment", () => {
    for (const env of [
      { CODEX_HOME: "/config", DSH_HOME: "/dsh", DSH_SESSION_ID: "session" },
      { CODEX_SANDBOX: "seatbelt" },
      { CLAUDECODE: "1" },
      { GEMINI_CLI: "1" }
    ])
      expect(cliCallerName(env)).toBe("Terminal")
  })

  it("uses a neutral fallback for absent, empty and blank declarations", () => {
    expect(cliCallerName({ PATH: "/usr/bin" })).toBe("Terminal")
    expect(cliCallerName({ PARITY_AGENT_NAME: "" })).toBe("Terminal")
    expect(cliCallerName({ PARITY_AGENT_NAME: "  " })).toBe("Terminal")
  })
})
