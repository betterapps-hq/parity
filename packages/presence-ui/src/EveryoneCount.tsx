import { Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn"
import { useState } from "react"
import { EveryoneGroup } from "./EveryoneGroup.tsx"
import { EveryoneRow } from "./EveryoneRow.tsx"
import { faceButton } from "./face-button.ts"
import { keyOf, type Member, type Presence } from "./member.ts"

interface EveryoneCountProps {
  everyone: Presence[]
  more: number
  size: number
  following?: Member
  onFollow?: (member: Member) => void
}

/** The count of faces past the first few: it opens everyone here, people and agents apart, and closes on a Follow. */
export function EveryoneCount({ everyone, more, size, following, onFollow }: EveryoneCountProps) {
  const people = everyone.filter((presence) => !presence.member.agent)
  const agents = everyone.filter((presence) => presence.member.agent)
  const [open, setOpen] = useState(false)

  const row = (presence: Presence) => (
    <EveryoneRow
      key={keyOf(presence.member)}
      presence={presence}
      following={presence.member === following}
      onFollow={
        onFollow &&
        (() => {
          setOpen(false)
          onFollow(presence.member)
        })
      }
    />
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`${more} more, of ${everyone.length} here`}
            className={`${faceButton} grid place-items-center bg-(--floating-bar-step) text-2xs font-medium text-muted-foreground tabular-nums shadow-[0_0_0_2px_var(--face-cutout)] hover:text-foreground dark:bg-muted`}
            style={{ width: size, height: size }}
          >
            +{more}
          </button>
        }
      />
      <PopoverContent align="end" sideOffset={10} className="w-80 gap-0 p-1.5 [--face-cutout:var(--popover)]">
        <span className="px-2 pt-1 text-sm font-medium">{everyone.length} here</span>
        <ul className="flex flex-col">
          {people.length > 0 && <EveryoneGroup label="People">{people.map(row)}</EveryoneGroup>}
          {agents.length > 0 && <EveryoneGroup label="Agents">{agents.map(row)}</EveryoneGroup>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
