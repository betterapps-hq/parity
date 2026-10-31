/** Declared caller names are displayed verbatim apart from surrounding whitespace. */
function declaredName(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined
}

/** MCP supplies its own identity in initialize; prefer its display title over its protocol name. */
export function mcpCallerName(clientInfo: { name?: unknown; title?: unknown } | undefined): string {
  return declaredName(clientInfo?.title) ?? declaredName(clientInfo?.name) ?? "Agent"
}

/** CLI callers opt in to attribution explicitly; ambient tool configuration is not identity. */
export function cliCallerName(env: Record<string, string | undefined>): string {
  return declaredName(env.PARITY_AGENT_NAME) ?? "Terminal"
}
