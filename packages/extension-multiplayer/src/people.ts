import type { NodeRef } from "@parity-app/extension"
import type { Gesture, Palette, Point, Rect, Viewing } from "@parity-app/extension/internal"
import type { PersonPresence } from "./protocol.ts"

/*
 * Who else is in the room and what each is doing, as the window module hears it: their presence, their gesture, and
 * their palette's number. A store layers read with `useSyncExternalStore`, and pure functions over it, so what's drawn
 * can be tested without a canvas.
 */

/** Someone else in the room, as far as this copy knows. */
export interface RoomPerson {
  peer: string
  name: string
  /** Their palette's number, as the host assigned it. */
  color?: number
  pointer?: { at: Point; over: boolean }
  selection: readonly NodeRef[]
  camera?: Rect
  viewing: Viewing
  /** What they're doing with the pointer or keyboard, from its start to its end. */
  gesture?: Gesture
}

/** Palette numbers for everyone, by peer: kept for those already numbered, the lowest free for the rest. */
export function assignColors(peers: readonly string[], before: ReadonlyMap<string, number>): Map<string, number> {
  const assigned = new Map<string, number>()

  for (const peer of peers) {
    const kept = before.get(peer)

    if (kept !== undefined) {
      assigned.set(peer, kept)
    }
  }

  const taken = new Set(assigned.values())
  let next = 0

  for (const peer of peers) {
    if (assigned.has(peer)) {
      continue
    }

    while (taken.has(next)) {
      next += 1
    }

    assigned.set(peer, next)
    taken.add(next)
  }

  return assigned
}

/** Who else is here, for layers, the same array until something changes. */
export class People {
  /** Someone's palette now: their assigned one, held for them while they're here. */
  readonly paletteOf: (peer: string) => Palette
  #people = new Map<string, RoomPerson>()
  #list: readonly RoomPerson[] = []
  readonly #listeners = new Set<() => void>()

  constructor(paletteOf: (peer: string) => Palette) {
    this.paletteOf = paletteOf
  }

  get = (): readonly RoomPerson[] => this.#list

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)

    return () => this.#listeners.delete(listener)
  }

  person(peer: string): RoomPerson | undefined {
    return this.#people.get(peer)
  }

  /** Someone's latest presence. */
  presence(peer: string, presence: PersonPresence): void {
    const before = this.#people.get(peer)

    const person: RoomPerson = {
      peer,
      name: presence.name,
      selection: presence.selection,
      viewing: presence.viewing
    }

    if (before?.color !== undefined) {
      person.color = before.color
    }

    if (before?.gesture) {
      person.gesture = before.gesture
    }

    if (presence.pointer) {
      person.pointer = presence.pointer
    } else if (before?.pointer) {
      // Off the canvas, the pointer stays where it was.
      person.pointer = { ...before.pointer, over: false }
    }

    if (presence.camera) {
      person.camera = presence.camera
    }

    this.#set(peer, person)
  }

  /** Someone's gesture: kept from its start until it ends or is called off. */
  gesture(peer: string, gesture: Gesture): void {
    const before = this.#people.get(peer)

    if (!before) {
      return
    }

    const over = gesture.phase === "end" || gesture.phase === "cancel"
    const next = { ...before }

    if (over) {
      delete next.gesture
    } else {
      next.gesture = gesture
    }

    this.#set(peer, next)
  }

  /** The host's palette numbers, for those here. */
  colors(assigned: ReadonlyMap<string, number>): void {
    for (const [peer, color] of assigned) {
      const before = this.#people.get(peer)

      if (before && before.color !== color) {
        this.#set(peer, { ...before, color })
      }
    }
  }

  /** Someone left. */
  remove(peer: string): void {
    if (this.#people.delete(peer)) {
      this.#changed()
    }
  }

  /** Everyone but those in `here`, as when the connection comes back. */
  keepOnly(here: readonly string[]): void {
    let changed = false

    for (const peer of this.#people.keys()) {
      if (!here.includes(peer)) {
        this.#people.delete(peer)
        changed = true
      }
    }

    if (changed) {
      this.#changed()
    }
  }

  #set(peer: string, person: RoomPerson) {
    this.#people.set(peer, person)
    this.#changed()
  }

  #changed() {
    this.#list = [...this.#people.values()]

    for (const listener of this.#listeners) {
      listener()
    }
  }
}

/** The rect someone's marquee covers now, from where it started to their pointer, on the page. */
/** The rectangle a marquee covers on the page. */
export interface Marquee {
  x: number
  y: number
  w: number
  h: number
}

/** The rectangle a marquee drawn from `from` to `to` covers. */
export function marqueeRect(from: Point, to: Point): Marquee {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    w: Math.abs(to.x - from.x),
    h: Math.abs(to.y - from.y)
  }
}

/** A node someone drags, where it is on the page, and the state and mode it shows. */
export interface DragItem {
  ref: NodeRef
  at: Point
  state?: string
  mode?: string
}

/** Where each of someone's dragged nodes is drawn now: their pointer, plus where each was from it. */
export function dragItems(
  gesture: Extract<Gesture, { kind: "move" }>,
  pointer: Point
): { ref: NodeRef; at: Point; state?: string; mode?: string }[] {
  return gesture.targets.map(({ ref, offset, state, mode }) => {
    const item: DragItem = {
      ref,
      at: { x: pointer.x + offset.x, y: pointer.y + offset.y }
    }

    if (state !== undefined) {
      item.state = state
    }

    if (mode !== undefined) {
      item.mode = mode
    }

    return item
  })
}

/** Everyone's selections, by what's selected: who has each node, so several people on one get a ring each. */
export function selectionsByNode(people: readonly RoomPerson[]): { ref: NodeRef; by: RoomPerson[] }[] {
  const byKey = new Map<string, { ref: NodeRef; by: RoomPerson[] }>()

  for (const person of people) {
    for (const ref of person.selection) {
      const key = `${ref.owner}:${ref.type}:${ref.key}`
      const entry = byKey.get(key) ?? { ref, by: [] }
      entry.by.push(person)
      byKey.set(key, entry)
    }
  }

  return [...byKey.values()]
}
