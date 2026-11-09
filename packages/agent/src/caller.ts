import { nonBlankString, parserFor } from "@parity-app/core/schema"
import { z } from "zod"
import type { Caller } from "./dispatch.ts"

/** A label the caller sent, trimmed, or left out when it's blank or isn't text, since a bad label shouldn't fail a call. */
const label = nonBlankString.optional().catch(undefined)

const callerFields = z.object({ agent: label, agentId: label, client: label })

/**
 * Validate caller metadata once at the RPC boundary, from a request's `agent`, `agentId` and `client`; display width
 * belongs to the renderer.
 */
export const callerIdentity = parserFor(callerFields, ({ agent: name, agentId, client }): Caller | undefined => {
  if (!name) {
    return undefined
  }

  const caller: Caller = { name, id: agentId?.slice(0, 80) ?? name }
  const program = client?.slice(0, 80)

  if (program) {
    caller.client = program
  }

  return caller
})
