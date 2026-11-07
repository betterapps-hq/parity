import { nonBlankString } from "@parity-app/core/schema"

/** Declared caller names are displayed verbatim apart from surrounding whitespace. */
function declaredName(value: unknown): string | undefined {
  return nonBlankString.safeParse(value).data
}

/** Reserve the session suffix inside the desktop boundary's 80-character caller-id limit. */
export function sessionCallerId(name: string, session: string): string {
  return `${name.slice(0, 71)}#${session.slice(0, 8)}`
}

/** MCP supplies its own identity in initialize; prefer its display title over its protocol name. */
export function mcpCallerName(clientInfo: { name?: unknown; title?: unknown } | undefined): string {
  return declaredName(clientInfo?.title) ?? declaredName(clientInfo?.name) ?? "Agent"
}

/** The MCP client's protocol name, such as `claude-code`, which says which program an agent runs in (PAR-630). */
export function mcpClientName(clientInfo: { name?: unknown; title?: unknown } | undefined): string | undefined {
  return declaredName(clientInfo?.name)
}

/** CLI callers opt in to attribution explicitly; ambient tool configuration is not identity. */
export function cliCallerName(env: Record<string, string | undefined>): string {
  return declaredName(env.PARITY_AGENT_NAME) ?? "Terminal"
}
