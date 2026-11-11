/*
 * Where a lifted list entry lands (sortable.ts): the place it's over as it's carried, how far the entries it passes
 * move to make room for it, and how far it travels to settle. Data in, data out, so it's tested without a page.
 */

/** An entry's place down its list: its top and height in px, measured from the list's top. */
export interface SortBox {
  top: number
  height: number
}

export interface SortLayout {
  /** The place the lifted entry takes if it's put down now. */
  to: number
  /** How far each entry moves to make room, in px, down when positive; the lifted entry's own is 0. */
  offsets: number[]
  /** How far the lifted entry's new place is from its old one, in px. */
  landing: number
}

const bottomOf = (box: SortBox) => box.top + box.height

/** The gap after an entry, or before the last one, which every entry of a list has the same of. */
function gapBeside(boxes: readonly SortBox[], at: number): number {
  const box = boxes[at]!
  const next = boxes[at + 1]
  const previous = boxes[at - 1]

  if (next) {
    return next.top - bottomOf(box)
  }

  return previous ? box.top - bottomOf(previous) : 0
}

/**
 * Where an entry lifted from `from` and carried `shift` px (down when positive) would land among entries laid out as
 * `boxes`: it takes the place of every entry it covers half of, its leading edge past their middle, so a tall entry
 * changes places with a short one as readily as two of a size do. Those it passes move one place back toward where it
 * came from, by its height and the gap.
 */
export function sortLayout(boxes: readonly SortBox[], from: number, shift: number): SortLayout {
  const lifted = boxes[from]

  if (!lifted) {
    return { to: from, offsets: boxes.map(() => 0), landing: 0 }
  }

  const top = lifted.top + shift
  const bottom = top + lifted.height
  let to = from

  for (const [at, box] of boxes.entries()) {
    const middle = box.top + box.height / 2

    if (at < from && top < middle) {
      to = Math.min(to, at)
    }

    if (at > from && bottom > middle) {
      to = Math.max(to, at)
    }
  }

  const room = lifted.height + gapBeside(boxes, from)

  const offsets = boxes.map((_, at) => {
    if (at >= to && at < from) {
      return room
    }

    return at > from && at <= to ? -room : 0
  })

  let landing = 0

  if (to < from) {
    landing = boxes[to]!.top - lifted.top
  }

  if (to > from) {
    landing = bottomOf(boxes[to]!) - bottomOf(lifted)
  }

  return { to, offsets, landing }
}

/** How far past an end is drawn for `past` px of pointer: less and less, never reaching `give`. */
const resisted = (past: number, give: number) => give * (1 - 1 / ((past * 0.55) / give + 1))

/**
 * Where a lifted entry is drawn for a pointer `shift` px from where it was pressed: under the pointer within the list,
 * and past either end less and less, never more than `give` px, so the list's ends are felt rather than hit.
 */
export function carriedShift(boxes: readonly SortBox[], from: number, shift: number, give: number): number {
  const lifted = boxes[from]
  const first = boxes[0]
  const last = boxes.at(-1)

  if (!lifted || !first || !last) {
    return 0
  }

  const least = first.top - lifted.top
  const most = bottomOf(last) - bottomOf(lifted)

  if (shift < least) {
    return least - resisted(least - shift, give)
  }

  return shift > most ? most + resisted(shift - most, give) : shift
}
