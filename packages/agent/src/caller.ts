/** Validate caller metadata once at the RPC boundary; display width belongs to the renderer. */
export function callerIdentity(agent: unknown, agentId: unknown): { name: string; id: string } | undefined {
  const name = typeof agent === "string" ? agent.trim() : ""
  if (!name) return undefined
  const id = typeof agentId === "string" ? agentId.trim().slice(0, 80) : ""
  return { name, id: id || name }
}
