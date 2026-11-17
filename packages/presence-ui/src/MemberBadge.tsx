import { type AgentStepKind, AgentBadge } from "./AgentPointer.tsx"
import type { Member } from "./member.ts"
import { PersonBadge } from "./PersonPointer.tsx"

interface MemberBadgeProps {
  member: Member
  /** A person's short note, as "Typing…", or what an agent says it's doing. */
  detail?: string
  /** The kind of step an agent is taking, for its icon. */
  kind?: AgentStepKind
}

/**
 * The badge under someone's pointer, a canvas chip on their gradient: a person's first name, with a short note when
 * the room knows one for certain. An agent's badge is the agents' own, with the icon for its step and what it says
 * it's doing.
 */
export function MemberBadge({ member, detail, kind }: MemberBadgeProps) {
  if (member.agent) {
    return <AgentBadge palette={member.palette} agent={member.name} kind={kind} label={detail} />
  }

  return <PersonBadge palette={member.palette} name={member.name} detail={detail} />
}
