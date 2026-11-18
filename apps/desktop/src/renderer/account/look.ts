import type { OwnLook } from "@parity-app/extension/internal"
import { accountColor } from "@parity-app/presence-colors"
import type { AccountPerson } from "../../shared/account.ts"

/*
 * How someone's account avatar looks, for `PersonAvatar` in the window's top right and for their own face in the live
 * room, so the two can't drift apart.
 */

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

/** Their provider's picture, when there is one, and their initials on the color their email gives them. */
export function lookOf(person: Pick<AccountPerson, "name" | "email" | "pictureUrl">): OwnLook {
  const look: OwnLook = { initials: initialsOf(person), color: accountColor(person.email) }

  if (person.pictureUrl) {
    look.photo = person.pictureUrl
  }

  return look
}
