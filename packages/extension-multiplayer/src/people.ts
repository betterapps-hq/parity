import type { NodeRef } from "@parity-app/extension"
import type { CaretAt, Gesture, Palette, Point, Rect, Self, Viewing } from "@parity-app/extension/internal"
import { type Member, PointerTrail } from "@parity-app/presence-ui"
import type { PersonPresence } from "./protocol.ts"

/*
 * Who else is in the room and what each is doing, as the window module hears it: their presence, their gesture, and
 * their palette's number. Stores layers read with `useSyncExternalStore`, and pure functions over them, so what's drawn
 * can be tested without a canvas. Each person has a store of their own, which changes only when something drawn of
 * them changes, so one person moving draws nobody else again (PAR-1327). Their pointer positions go into a trail as
 * they arrive instead, which their pointer, marquee and drag are drawn from on every frame, a little behind, so all
 * three move together and smoothly without React drawing them again.
 */

/** Someone in the room, as the avatar stack and their badges name them. */
export interface Someone {
  peer: string
  name: string
  /** Their palette's number, as the host assigned it. */
  color?: number
}

/** Someone else in the room, as far as this copy knows: all that's drawn of them but where their pointer is. */
export interface RoomPerson extends Someone {
  /**
   * Whether their pointer is over the canvas, once they've sent one. Where it's drawn comes from their trail
   * (`People.trail`, `People.pointerAt`), which moves with every position without changing this.
   */
  pointer?: { over: boolean }
  selection: readonly NodeRef[]
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

/**
 * You, as your own window draws you: as your account avatar shows you while you're signed in (your picture, or your
 * initials on your own color), else in the palette the room assigned you. Only this window sees it; the room is told
 * your name alone, so everyone else sees you in your palette.
 */
export function yourMember(peer: string, self: Self, palette: Palette): Member {
  const you: Member = { id: peer, name: self.name, palette }

  if (self.own) {
    you.own = { initials: self.own.initials, color: self.own.color }

    if (self.own.photo) {
      you.photo = self.own.photo
    }
  }

  return you
}

/** Who's here, everyone's selections, and each person, for layers: each the same until something drawn of it changes. */
export class People {
  /** Someone's palette now: their assigned one, held for them while they're here. */
  readonly paletteOf: (peer: string) => Palette
  #people = new Map<string, RoomPerson>()
  #trails = new Map<string, PointerTrail>()
  #cameras = new Map<string, Rect>()
  #roster: readonly Someone[] = []
  #everyone: readonly RoomPerson[] = []
  readonly #rosterListeners = new Set<() => void>()
  readonly #selectionListeners = new Set<() => void>()
  readonly #personListeners = new Map<string, Set<() => void>>()
  readonly #now: () => number

  constructor(paletteOf: (peer: string) => Palette, now: () => number = () => performance.now()) {
    this.paletteOf = paletteOf
    this.#now = now
  }

  /** Who's here, by name and color: changes as someone joins or leaves, or is renamed or given another color. */
  roster = (): readonly Someone[] => this.#roster

  onRoster = (listener: () => void): (() => void) => listen(this.#rosterListeners, listener)

  /**
   * Everyone, for their selections and carets: changes as someone joins or leaves, or their name, color, selection,
   * view or typing changes, but not as their pointer moves or another gesture starts.
   */
  everyone = (): readonly RoomPerson[] => this.#everyone

  onSelections = (listener: () => void): (() => void) => listen(this.#selectionListeners, listener)

  person = (peer: string): RoomPerson | undefined => this.#people.get(peer)

  /** Hears changes to what's drawn of one person, and of nobody else. */
  onPerson = (peer: string, listener: () => void): (() => void) => {
    const listeners = this.#personListeners.get(peer) ?? new Set()
    this.#personListeners.set(peer, listeners)
    listeners.add(listener)

    return () => {
      listeners.delete(listener)

      if (listeners.size === 0 && this.#personListeners.get(peer) === listeners) {
        this.#personListeners.delete(peer)
      }
    }
  }

  /** Someone's pointer positions as they arrived, to draw from, once they've sent one. */
  trail(peer: string): PointerTrail | undefined {
    return this.#trails.get(peer)
  }

  /** Where someone's pointer is drawn at `now`, from their trail. */
  pointerAt(peer: string, now: number): Point | undefined {
    return this.#trails.get(peer)?.at(now)
  }

  /** What someone last had in view, to follow them or go to them. */
  cameraOf(peer: string): Rect | undefined {
    return this.#cameras.get(peer)
  }

  /** How many positions, from everyone, arrived too late to be drawn on time since the last call. */
  takeLate(): number {
    let late = 0

    for (const trail of this.#trails.values()) {
      late += trail.takeLate()
    }

    return late
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
      const { at, over, t } = presence.pointer
      person.pointer = { over }
      const arrived = this.#now()
      const trail = this.#trails.get(peer) ?? new PointerTrail()
      this.#trails.set(peer, trail)
      // An older copy sends no time, so the position counts as taken as it arrived.
      trail.push({ t: t ?? arrived, at }, arrived)
    } else if (before?.pointer) {
      // Off the canvas, the pointer stays where it was.
      person.pointer = { over: false }
    }

    if (presence.camera) {
      this.#cameras.set(peer, presence.camera)
    }

    // Only their pointer moved, or their view: their trail draws the one, and the other isn't drawn.
    if (before && samePerson(before, person)) {
      return
    }

    this.#set(peer, person, before)
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

    if (!sameJson(before.gesture, next.gesture)) {
      this.#set(peer, next, before)
    }
  }

  /** The host's palette numbers, for those here. */
  colors(assigned: ReadonlyMap<string, number>): void {
    for (const [peer, color] of assigned) {
      const before = this.#people.get(peer)

      if (before && before.color !== color) {
        this.#set(peer, { ...before, color }, before)
      }
    }
  }

  /** Someone left. */
  remove(peer: string): void {
    this.keepOnly([...this.#people.keys()].filter((each) => each !== peer))
    this.#forget(peer)
  }

  /** Everyone but those in `here`, as when the connection comes back. */
  keepOnly(here: readonly string[]): void {
    const gone = [...this.#people.keys()].filter((peer) => !here.includes(peer))

    for (const peer of gone) {
      this.#people.delete(peer)
      this.#forget(peer)
    }

    if (gone.length === 0) {
      return
    }

    this.#everyoneChanged(true)

    for (const peer of gone) {
      this.#tell(peer)
    }
  }

  #forget(peer: string) {
    this.#trails.delete(peer)
    this.#cameras.delete(peer)
  }

  #set(peer: string, person: RoomPerson, before: RoomPerson | undefined) {
    this.#people.set(peer, person)
    const renamed = !before || before.name !== person.name || before.color !== person.color

    if (renamed || !sameSelection(before, person)) {
      this.#everyoneChanged(renamed)
    }

    this.#tell(peer)
  }

  /** Tells those drawing selections, and those drawing who's here when that or what they're called changed. */
  #everyoneChanged(roster: boolean) {
    this.#everyone = [...this.#people.values()]

    if (roster) {
      this.#roster = this.#everyone.map(({ peer, name, color }) =>
        color === undefined ? { peer, name } : { peer, name, color }
      )
      tell(this.#rosterListeners)
    }

    tell(this.#selectionListeners)
  }

  #tell(peer: string) {
    const listeners = this.#personListeners.get(peer)

    if (listeners) {
      tell(listeners)
    }
  }
}

function listen(listeners: Set<() => void>, listener: () => void): () => void {
  listeners.add(listener)

  return () => listeners.delete(listener)
}

function tell(listeners: ReadonlySet<() => void>) {
  for (const listener of listeners) {
    listener()
  }
}

/** Whether two values are the same plain data. */
function sameJson<T>(a: T, b: T): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/** Whether the same is drawn of someone: everything but where their pointer is, which their trail draws. */
function samePerson(a: RoomPerson, b: RoomPerson): boolean {
  return (
    a.name === b.name &&
    a.color === b.color &&
    a.pointer?.over === b.pointer?.over &&
    sameJson(a.gesture, b.gesture) &&
    sameSelection(a, b)
  )
}

/** Whether someone's selection, the frame they see it in, and where they're typing are all as they were. */
function sameSelection(a: RoomPerson | undefined, b: RoomPerson): boolean {
  const typing = (person: RoomPerson | undefined) => (person?.gesture?.kind === "text" ? person.gesture : undefined)

  return (
    a !== undefined &&
    sameJson(a.selection, b.selection) &&
    sameJson(a.viewing, b.viewing) &&
    sameJson(typing(a), typing(b))
  )
}

/** How much of the letters' box a caret leaves out, at the top and at the bottom, so it's as tall as a text field's. */
const caretTrim = 0.1

/** How wide a caret is on screen, in pixels: wider than a text field's own, so someone else's is easy to see. */
const caretWidth = 2

/** Where a caret's line is drawn on the page, as CSS places it. */
export interface CaretMark {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Where someone's caret is drawn on the page, as a text field draws one: centred on where it stands, a little shorter
 * than the line, and the same width on screen at any zoom.
 */
export function caretMark(caret: CaretAt, zoom: number): CaretMark {
  const line = caret.bottom - caret.top
  const width = caretWidth / zoom

  return {
    left: caret.x - width / 2,
    top: caret.top + line * caretTrim,
    width,
    height: line * (1 - 2 * caretTrim)
  }
}

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
