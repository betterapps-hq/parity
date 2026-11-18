import type { Palette } from "@parity-app/presence-colors"

/*
 * Multiplayer presence, drawn: who's here, where their pointers are, what they've selected and what they're moving.
 * Nothing here knows about a room or the editor; the extensions that do pass in who's here, with each person's palette
 * already resolved. People and agents point with the same arrow, have round faces and wear gradients alike, but never
 * look alike: their palettes come in different styles (see `@parity-app/presence-colors`), vivid and sweeping across
 * hues for agents, soft and in one hue for people, and an agent's arrow glows.
 */

/** The parts of a palette that draw: a gradient's three stops, a solid color and the ink that reads on both. */
export type PaletteLook = Pick<Palette, "stops" | "color" | "ink">

/** Someone in the room: a person, or an agent one of them is running. */
export interface Member {
  /** What tells them apart when two share a name, as a peer id; their name when there's none. */
  id?: string
  name: string
  /** Their palette, resolved from the colors service by whoever draws them. */
  palette: Palette
  agent?: boolean
  /** Who's running it, for an agent. */
  runBy?: Member
  /** A picture of them, from their account. Without one, their initials. */
  photo?: string
  /**
   * How your account avatar shows you, for your own face in your own window: your initials on your own color in place
   * of your palette's, so your face matches your account's. Everyone else still sees you in your palette.
   */
  own?: { initials: string; color: string }
}

/**
 * Someone in the room, for their face and card, with only what the room knows for certain: whether they've been away
 * and for how long. Where a person is and what they're doing aren't shown, since neither can be told reliably. An agent
 * says what it's doing itself, in the words of its current step.
 */
export interface Presence {
  member: Member
  /** What an agent says it's doing, from its current step, as "Tightening the dashboard's spacing". */
  doing?: string
  /** How long they've been away, when they've stepped away. */
  away?: string
}

/** The line under someone's name, when there's one: how long they've been away, or what an agent says it's doing. */
export function statusOf(presence: Presence): string | undefined {
  return presence.away ? `Away for ${presence.away}` : presence.doing
}

/** What a badge or tag calls someone: a person by their first name, an agent by its whole name. */
export function shortName(member: Pick<Member, "name" | "agent">): string {
  return member.agent ? member.name : firstName(member.name)
}

/** The first word of a name, or the whole of it when it's only spaces. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

/** What tells someone apart in a list: their id, or their name. */
export function keyOf(member: Member): string {
  return member.id ?? member.name
}

/** Whose an agent is, as its card and the list of everyone say it: "Mia's agent". */
export function whoseAgent(member: Member): string | undefined {
  return member.runBy ? `${shortName(member.runBy)}'s agent` : undefined
}

/** Names in a sentence: "Mia", "Mia and Claude Code", "Mia, Jonas and Claude Code". */
export function listed(names: string[]): string | undefined {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]
}

/** Someone's initials: two from a face big enough to hold them, else one. */
export function initials(name: string, size: number): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, size < 22 ? 1 : 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase()
}

/** A palette's gradient, as a pointer and badge wear it. */
export function gradient(palette: PaletteLook, angle = 90): string {
  return `linear-gradient(${angle}deg, ${palette.stops.join(", ")})`
}

/** A hairline of a palette's ink just outside a line in its color, so light colors keep an edge on white. */
export function hairline(ink: string): string {
  return `0 0 0 1px color-mix(in oklch, ${ink} 35%, transparent)`
}

/**
 * The order faces go in: whoever you're following first, then everyone in the order they joined, each person's agents
 * just after them, and anyone away last.
 */
export function arrange(here: Presence[], following?: Member): Presence[] {
  const people = here.filter((presence) => !presence.member.agent)
  const agents = here.filter((presence) => presence.member.agent)
  const runners = new Set(people.map((presence) => presence.member))

  const joined = [
    ...people.flatMap((person) => [person, ...agents.filter((agent) => agent.member.runBy === person.member)]),
    ...agents.filter((agent) => !agent.member.runBy || !runners.has(agent.member.runBy))
  ]

  const rank = (presence: Presence) => {
    if (presence.member === following) {
      return 0
    }

    return presence.away ? 2 : 1
  }

  return joined.toSorted((a, b) => rank(a) - rank(b))
}

/** How many faces the stack shows of `count`, up to `max`: one fewer when there are more, to leave room for the count. */
export function shownCount(count: number, max: number): number {
  return count > max ? Math.max(max - 1, 0) : count
}
