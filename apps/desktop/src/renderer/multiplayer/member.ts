import type { Palette } from "@parity-app/presence-colors"

/*
 * Multiplayer presence, drawn: who's here, where their pointers are, what they've selected and what they're moving.
 * Design only, for Storybook; nothing in this folder is wired to a room. People and agents point with the same arrow,
 * have round faces and wear gradients alike, but never look alike: their palettes come in different styles (see
 * `@parity-app/presence-colors`), vivid and sweeping across hues for agents, soft and in one hue for people, and an
 * agent's arrow glows.
 */

/** Someone in the room: a person, or an agent one of them is running. */
export interface Member {
  name: string
  palette: Palette
  agent?: boolean
  /** Who's running it, for an agent. */
  runBy?: Member
  /** A picture of them, from their account. Without one, their initials. */
  photo?: string
}

/**
 * Where someone is, for their face and card: only what the room knows for certain. For a person that's the board their
 * view is on, or how long they've been away; what they're doing there isn't guessed at. An agent also says what it's
 * doing, in the words of its current step.
 */
export interface Presence {
  member: Member
  /** The board their view is on. */
  on: string
  /** What an agent says it's doing, from its current step, as "Tightening the dashboard's spacing". */
  doing?: string
  /** How long they've been away, when they've stepped away. */
  away?: string
}

/** Someone's line under their name: away and for how long, what an agent says it's doing, or the board they're on. */
export function whereabouts(presence: Presence): string {
  if (presence.away) {
    return `Away for ${presence.away}`
  }

  return presence.doing ?? `On ${presence.on}`
}

/** What a badge or tag calls someone: a person by their first name, an agent by its whole name. */
export function shortName(member: Member): string {
  return member.agent ? member.name : (member.name.split(" ")[0] ?? member.name)
}

/** Whose an agent is, as its card and the list of everyone say it: "Mia's agent". */
export function whoseAgent(member: Member): string | undefined {
  return member.runBy ? `${shortName(member.runBy)}'s agent` : undefined
}

/** A palette's gradient, as a pointer and badge wear it. */
export function gradient(palette: Palette, angle = 90): string {
  return `linear-gradient(${angle}deg, ${palette.stops.join(", ")})`
}

/** A hairline of a palette's ink just outside a line in its color, so light colors keep an edge on white. */
export function hairline(ink: string): string {
  return `0 0 0 1px color-mix(in oklch, ${ink} 35%, transparent)`
}
