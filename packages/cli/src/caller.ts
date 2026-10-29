/** Who is driving Parity, named the way people know it, for the agent's cursor on the canvas. */

/** Known clients, by the name they give MCP's `initialize`, most specific first. */
const clients: [RegExp, string][] = [
  [/claude[-_ ]?code/i, "Claude Code"],
  [/^claude/i, "Claude"],
  [/cursor/i, "Cursor"],
  [/codex/i, "Codex"],
  [/gemini/i, "Gemini CLI"],
  [/windsurf|codeium/i, "Windsurf"],
  [/copilot|visual studio code|^vscode/i, "Copilot"],
  [/zed/i, "Zed"],
  [/cline/i, "Cline"],
  [/goose/i, "Goose"]
]

/**
 * An MCP client's name for people: a known agent's own name, else the title it gives, else its name with its
 * separators made spaces and its words capitalized ("my-agent" becomes "My Agent").
 */
export function mcpCallerName(clientInfo: { name?: unknown; title?: unknown } | undefined): string | undefined {
  const name = typeof clientInfo?.name === "string" ? clientInfo.name.trim() : ""
  const title = typeof clientInfo?.title === "string" ? clientInfo.title.trim() : ""
  for (const [pattern, known] of clients) if (pattern.test(name) || pattern.test(title)) return known
  if (title) return title
  if (!name) return undefined
  return name
    .replace(/[-_]+(mcp[-_]?)?client$/i, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ")
}

/**
 * Who runs the CLI, from what agents put in their shell's environment. `PARITY_AGENT_NAME` names it outright; with
 * no sign of an agent, it's someone at a terminal.
 */
export function cliCallerName(env: Record<string, string | undefined>): string {
  const named = env.PARITY_AGENT_NAME?.trim()
  if (named) return named
  if (env.CLAUDECODE === "1") return "Claude Code"
  if (env.GEMINI_CLI === "1") return "Gemini CLI"
  if (Object.keys(env).some((key) => key.startsWith("CODEX_"))) return "Codex"
  return "Terminal"
}
