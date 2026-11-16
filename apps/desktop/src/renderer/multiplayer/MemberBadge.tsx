import type { PresenceEvent } from "../../shared/protocol.ts"
import { AgentBadge } from "../agent/AgentPointer.tsx"
import { gradient, type Member, shortName } from "./member.ts"

/**
 * The badge under someone's pointer: a person's first name and, when there's something to say, what they're doing.
 * An agent's badge is the agents' own, with the icon for its call.
 */
export function MemberBadge({
  member,
  detail,
  kind
}: {
  member: Member
  detail?: string
  kind?: PresenceEvent["kind"]
}) {
  if (member.agent) {
    return <AgentBadge palette={member.palette} agent={member.name} kind={kind} label={detail} />
  }

  return (
    <div
      className="mt-0.5 ml-4 flex w-max max-w-72 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] whitespace-nowrap shadow-md"
      style={{ background: gradient(member.palette), color: member.palette.ink }}
    >
      <span className="max-w-40 shrink-0 truncate font-semibold">{shortName(member)}</span>
      {detail && <span className="truncate opacity-75">{detail}</span>}
    </div>
  )
}
