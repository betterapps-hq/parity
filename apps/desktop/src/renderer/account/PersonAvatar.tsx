import { UserRound } from "lucide-react"
import { useState } from "react"
import type { AccountPerson } from "../../shared/account.ts"
import { lookOf } from "./look.ts"

/** The person's picture from their provider, or their initials in a color of their own. */
export function PersonAvatar({ person, size }: { person: AccountPerson; size: number }) {
  const [broken, setBroken] = useState(false)
  const look = lookOf(person)

  if (look.photo && !broken) {
    return (
      <img
        src={look.photo}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: look.color
      }}
    >
      {look.initials}
    </span>
  )
}

/** Nobody's avatar: an outline of a person, where yours goes once you sign in. */
export function NobodyAvatar({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full border border-dashed border-muted-foreground/50 text-muted-foreground"
      style={{ width: size, height: size }}
    >
      <UserRound style={{ width: size * 0.58, height: size * 0.58 }} />
    </span>
  )
}
