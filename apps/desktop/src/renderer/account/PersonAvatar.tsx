import { UserRound } from "lucide-react"
import { useState } from "react"
import type { AccountPerson } from "../../shared/account.ts"

/** Someone's initials, from their name, or their email when WorkOS has no name for them. */
export function initialsOf(person: Pick<AccountPerson, "name" | "email">): string {
  const words = (person.name ?? person.email.split("@")[0] ?? "").split(/[\s._-]+/).filter(Boolean)
  return (
    words
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "?"
  )
}

/** A steady hue for a person, from their email, so their avatar keeps its color. */
function hueOf(email: string): number {
  let hash = 0
  for (const char of email) hash = (hash * 31 + char.charCodeAt(0)) % 360
  return hash
}

/** The person's picture from their provider, or their initials in a color of their own. */
export function PersonAvatar({ person, size }: { person: AccountPerson; size: number }) {
  const [broken, setBroken] = useState(false)
  if (person.pictureUrl && !broken) {
    return (
      <img
        src={person.pictureUrl}
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
        background: `oklch(0.6 0.13 ${hueOf(person.email)})`
      }}
    >
      {initialsOf(person)}
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
