import type { PresenceEvent } from "../../shared/protocol.ts"
import { AgentBadge } from "../agent/AgentPointer.tsx"
import { gradient, type Member, shortName } from "./member.ts"

interface MemberBadgeProps {
  member: Member
  detail?: string
  kind?: PresenceEvent["kind"]
}

/**
 * The badge under someone's pointer, a canvas chip on their gradient: a person's first name, and nothing more, since
 * what they're doing isn't guessed at. An agent's badge is the agents' own, with the icon for its step and what it says
 * it's doing (`detail`).
 */
export function MemberBadge({ member, detail, kind }: MemberBadgeProps) {
  if (member.agent) {
    return <AgentBadge palette={member.palette} agent={member.name} kind={kind} label={detail} />
  }

  return (
    <div
      className="mt-0.5 ml-4 w-max max-w-40 truncate rounded-full px-2 py-0.5 text-2xs font-semibold whitespace-nowrap shadow-md"
      style={{ background: gradient(member.palette), color: member.palette.ink }}
    >
      {shortName(member)}
    </div>
  )
}
