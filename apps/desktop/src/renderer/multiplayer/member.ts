import type { Palette } from "@parity-app/presence-colors"

/*
 * Multiplayer presence, drawn: who's here, where their pointers are, what they've selected and what they're moving.
 * Design only, for Storybook; nothing in this folder is wired to a room. People and agents point with the same arrow
 * and wear gradients alike, but never look alike: their palettes come in different styles (see
 * `@parity-app/presence-colors`), an agent's arrow glows, its face is a rounded square with a sparkle where a person's
 * is round, and its badge says what it's doing.
 */

/** Someone in the room: a person, or an agent one of them is running. */
export interface Member {
  name: string
  palette: Palette
  agent?: boolean
  /** A picture of them, from their account. Without one, their initials. */
  photo?: string
}

/** Where someone is and what they're doing, for their face and card. */
export interface Presence {
  member: Member
  /** What they're doing, as "Viewing Dashboard in dark mode". */
  activity: string
  /** How long they've been away, when they've stepped away. */
  away?: string
}

/** What a badge or tag calls someone: a person by their first name, an agent by its whole name. */
export function shortName(member: Member): string {
  return member.agent ? member.name : (member.name.split(" ")[0] ?? member.name)
}

/** A palette's gradient, as a pointer and badge wear it. */
export function gradient(palette: Palette, angle = 90): string {
  return `linear-gradient(${angle}deg, ${palette.stops.join(", ")})`
}

/** A hairline of a palette's ink just outside a line in its color, so light colors keep an edge on white. */
export function hairline(ink: string): string {
  return `0 0 0 1px color-mix(in oklch, ${ink} 35%, transparent)`
}
