import { nonBlankString, parserFor } from "@parity-app/core/schema"
import { z } from "zod"
import type { Caller } from "./dispatch.ts"

/** A label the caller sent, trimmed, or left out when it's blank or isn't text, since a bad label shouldn't fail a call. */
const label = nonBlankString.optional().catch(undefined)

const callerFields = z.object({ agent: label, agentId: label, client: label, subagent: label })

/**
 * Validate caller metadata once at the RPC boundary, from a request's `agent`, `agentId`, `client` and `subagent`;
 * display width belongs to the renderer.
 */
export const callerIdentity = parserFor(
  callerFields,
  ({ agent: name, agentId, client, subagent }): Caller | undefined => {
    if (!name) {
      return undefined
    }

    const caller: Caller = { name, id: agentId?.slice(0, 80) ?? name }
    const program = client?.slice(0, 80)

    if (program) {
      caller.client = program
    }

    // An agent writes its subagents' names, so one is kept to a line and a length a strip can show.
    const worker = subagent?.replace(/\s+/g, " ").slice(0, 40).trim()

    if (worker) {
      caller.subagent = worker
    }

    return caller
  }
)

/**
 * Who a caller's cursor and strip on the canvas are for (PAR-960). A session's subagents share its connection, name and
 * id, so each one that names itself gets a cursor of its own: its name first, since that's what tells them apart, and
 * an id under the session's.
 */
export function presenceIdentity(caller: Caller) {
  if (!caller.subagent) {
    return { agent: caller.name, agentId: caller.id }
  }

  return { agent: `${caller.subagent} (${caller.name})`, agentId: `${caller.id}/${caller.subagent}` }
}
