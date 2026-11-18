/*
 * A person's own color outside the room: the one their account avatar wears in the window's top right, and their face
 * in their own live room window. It comes from their email, so it's the same every time and on every copy they sign in
 * to. The room gives them a palette of its own for everyone else to see (`palette`).
 */

/** A steady hue for a person, from their email. */
export function accountHue(email: string): number {
  let hash = 0

  for (const char of email) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360
  }

  return hash
}

/** The color a person's initials sit on when their account has no picture, from their email. */
export function accountColor(email: string): string {
  return `oklch(0.6 0.13 ${accountHue(email)})`
}
