import { describe, expect, it } from "vitest"
import { cliCallerName, mcpCallerName } from "./caller.ts"

describe("mcpCallerName", () => {
  it("names known clients the way people know them", () => {
    expect(mcpCallerName({ name: "claude-code", title: "Claude Code" })).toBe("Claude Code")
    expect(mcpCallerName({ name: "claude-ai" })).toBe("Claude")
    expect(mcpCallerName({ name: "cursor-vscode" })).toBe("Cursor")
    expect(mcpCallerName({ name: "codex-mcp-client" })).toBe("Codex")
    expect(mcpCallerName({ name: "Visual Studio Code" })).toBe("Copilot")
  })

  it("uses an unknown client's title, else its name made readable", () => {
    expect(mcpCallerName({ name: "acme", title: "Acme Agent" })).toBe("Acme Agent")
    expect(mcpCallerName({ name: "acme-builder-mcp-client" })).toBe("Acme Builder")
    expect(mcpCallerName({ name: "my_agent" })).toBe("My Agent")
  })

  it("has no name without client info", () => {
    expect(mcpCallerName(undefined)).toBeUndefined()
    expect(mcpCallerName({ name: 42 })).toBeUndefined()
    expect(mcpCallerName({ name: "  " })).toBeUndefined()
  })
})

describe("cliCallerName", () => {
  it("prefers an explicit name", () => {
    expect(cliCallerName({ PARITY_AGENT_NAME: "Build bot", CLAUDECODE: "1" })).toBe("Build bot")
  })

  it("recognizes agents by their shell environment", () => {
    expect(cliCallerName({ CLAUDECODE: "1" })).toBe("Claude Code")
    expect(cliCallerName({ GEMINI_CLI: "1" })).toBe("Gemini CLI")
    expect(cliCallerName({ CODEX_SANDBOX: "seatbelt" })).toBe("Codex")
  })

  it("falls back to someone at a terminal", () => {
    expect(cliCallerName({ PATH: "/usr/bin" })).toBe("Terminal")
  })
})
