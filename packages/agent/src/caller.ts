import { nonBlankString } from "@parity-app/core/schema"

/** Validate caller metadata once at the RPC boundary; display width belongs to the renderer. */
export function callerIdentity(
  agent: unknown,
  agentId: unknown,
  client?: unknown
): { name: string; id: string; client?: string } | undefined {
  const name = nonBlankString.safeParse(agent).data

  if (!name) {
    return undefined
  }

  const id = nonBlankString.safeParse(agentId).data?.slice(0, 80)
  const program = nonBlankString.safeParse(client).data?.slice(0, 80)

  return { name, id: id ?? name, ...(program ? { client: program } : {}) }
}
