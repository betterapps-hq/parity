import { cancelMs, dropMs, lift, liftMs, liftScale, settle, translated } from "./drag-motion.ts"
import { asTranslate, type Point, translateOnScreen } from "./screen-moves.ts"

/** What lifting writes on an element, which is put back as it was once it's settled. */
const written = ["scale", "filter", "transition", "translate"] as const

/** Values for what lifting writes. */
type Written = Partial<Record<(typeof written)[number], string>>

/** Elements still lifted or settling, and what puts each back at once, so a new lift starts from how it's drawn. */
const settling = new WeakMap<Element, () => void>()

/** How much bigger each element picked up is drawn while it's carried, so what measures it can leave that out. */
const grown = new WeakMap<Element, number>()

/** How much bigger an element is drawn because it's picked up: 1 when it isn't, or once it's put down. */
export function liftOf(element: Element | undefined): number {
  return (element && grown.get(element)) ?? 1
}

/** Something picked up on the canvas (see `liftElements`). */
export interface ElementLift {
  /** Dropped where it is: it settles there. */
  drop(): void
  /**
   * Called off: `moveBack` puts it back where it was, and it flies there from where it was let go, settling as it goes.
   * It's measured before and after, so it flies however far it went.
   */
  cancel(moveBack: () => void): void
}

/** Whether the person asked for less motion, which the canvas's drags respect (see `drag-motion.ts`). */
export function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Lifts the canvas's own elements as they're picked up, as `DragLift` does for what React draws: an absolutely placed
 * layer, or a board dragged by its name. They grow round `origin` (where they were grabbed, in client pixels), so it
 * stays under the pointer, and lift onto the shadow; dropped, they settle where they are; cancelled, they fly back. Their
 * transform origin is left as it is, since their own scale, rotation or transform turn about it too: a translate,
 * easing along with the growth, keeps the grab point where it was instead.
 * `scale` is screen pixels per pixel of their own, for an element whose layout size can't be read (an SVG's). The
 * styles go on the elements themselves, composed with any scale, shadow or translate of their own, and come off once
 * they've settled. With reduced motion nothing grows or flies, and the shadow comes off as soon as they're put down.
 */
export function liftElements(
  elements: readonly Element[],
  { origin, scale }: { origin?: { x: number; y: number }; scale?: number } = {}
): ElementLift {
  const reduced = reducedMotion()

  const lifted = elements.flatMap((element) => {
    settling.get(element)?.()

    if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
      return []
    }

    const style = element.style

    const saved = written.map((name) => ({
      name,
      value: style.getPropertyValue(name),
      priority: style.getPropertyPriority(name)
    }))

    const drawn = getComputedStyle(element)
    const own = { scale: drawn.scale, filter: drawn.filter, translate: drawn.translate }
    const rect = element.getBoundingClientRect()
    const size = element instanceof HTMLElement ? element.offsetWidth : 0
    const ratio = scale ?? (size > 0 ? rect.width / size : 1)
    // A move on screen as a change to its translate, which whatever it's in scales and turns.
    const moves = translateOnScreen(element, own.translate)
    const toOwn = (by: Point) => asTranslate(by, moves, ratio)

    // Each settles on a timer of its own, so one picked up again before the rest have settled leaves theirs running.
    let timer = 0

    const restore = () => {
      window.clearTimeout(timer)

      for (const { name, value, priority } of saved) {
        if (value) {
          style.setProperty(name, value, priority)
        } else {
          style.removeProperty(name)
        }
      }

      settling.delete(element)
      grown.delete(element)
    }

    settling.set(element, restore)

    // The translate it's lifted with: its own, unless it's moved to keep the grab point under the pointer.
    return [
      {
        element,
        style,
        own,
        toOwn,
        restore,
        held: own.translate,
        settle: (ms: number) => {
          timer = window.setTimeout(restore, ms)
        }
      }
    ]
  })

  const write = (style: CSSStyleDeclaration, values: Written) => {
    for (const [name, value] of Object.entries(values)) {
      style.setProperty(name, value, "important")
    }
  }

  for (const entry of lifted) {
    const { element, style, own, toOwn } = entry
    const up = lift(true, { reduced, scale: own.scale, filter: own.filter })

    const held =
      origin && up.scale !== own.scale ? pinned(element, own.scale, up.scale, origin, toOwn, own.translate) : undefined

    if (held) {
      entry.held = held
      write(style, { ...up, translate: held, transition: `${up.transition}, translate ${liftMs}ms ${settle}` })
    } else {
      write(style, up)
    }

    if (up.scale !== own.scale) {
      grown.set(element, liftScale)
    }
  }

  /** Puts them down, as `drawn` says for each, and takes everything off once `ms` have passed. */
  const putDown = (ms: number, drawn: (entry: (typeof lifted)[number]) => Written) => {
    if (reduced) {
      lifted.forEach(({ restore }) => restore())

      return
    }

    for (const entry of lifted) {
      write(entry.style, drawn(entry))
      grown.delete(entry.element)
    }

    lifted.forEach(({ settle }) => settle(ms))
  }

  return {
    drop() {
      // A frame draws a dropped layer again as the move is written, which can take it out and put it back, and that
      // would end a transition as it starts; so it settles from the next frame.
      window.requestAnimationFrame(() =>
        putDown(dropMs, ({ own }) => {
          const down = lift(false, { reduced, ms: dropMs, scale: own.scale, filter: own.filter })

          return {
            ...down,
            translate: own.translate,
            transition: `${down.transition}, translate ${dropMs}ms ${settle}`
          }
        })
      )
    },
    cancel(moveBack) {
      const before = lifted.map(({ element }) => element.getBoundingClientRect())
      moveBack()

      const fly = () => {
        const away = lifted.map(({ element, toOwn }, index) => {
          const after = element.getBoundingClientRect()

          return toOwn({ x: before[index]!.left - after.left, y: before[index]!.top - after.top })
        })

        // Where it was let go, at once, then back to where it was, settling as it goes.
        lifted.forEach(({ element, style, held }, index) => {
          const from = translated(held, away[index]!)

          if (!reduced && from) {
            write(style, { transition: "none", translate: from })
            element.getBoundingClientRect()
          }
        })

        putDown(cancelMs, ({ own }) => ({
          ...lift(false, { reduced, ms: cancelMs, scale: own.scale, filter: own.filter }),
          translate: own.translate,
          transition: ["scale", "filter", "translate"].map((name) => `${name} ${cancelMs}ms ${settle}`).join(", ")
        }))
      }

      // tldraw moves a board in its own animation frame, so one that hasn't moved yet is measured once it has.
      const moved = lifted.some(({ element }, index) => {
        const after = element.getBoundingClientRect()

        return after.left !== before[index]!.left || after.top !== before[index]!.top
      })

      if (moved || reduced) {
        fly()
      } else {
        window.requestAnimationFrame(fly)
      }
    }
  }
}

/**
 * The translate that keeps `at`, where an element was grabbed (in client pixels), under the pointer as it grows from
 * scale `from` to `to` about its own transform origin: its own `translate`, moved back by however far growing takes that
 * point. Growing evenly about any point takes its box's corner along with everything else, so it's drawn grown for a
 * moment to see where the corner goes, then drawn as it was, for the lift to ease from. `toOwn` turns a move on screen
 * into a change to its translate. Nothing for a translate that isn't in pixels.
 */
function pinned(
  element: HTMLElement | SVGElement,
  from: string,
  to: string,
  at: Point,
  toOwn: (by: Point) => Point,
  translate: string
): string | undefined {
  const { style } = element
  const was = element.getBoundingClientRect()
  style.setProperty("transition", "none", "important")
  style.setProperty("scale", to, "important")
  const now = element.getBoundingClientRect()
  style.setProperty("scale", from, "important")
  element.getBoundingClientRect()

  const goes = { x: now.left + liftScale * (at.x - was.left), y: now.top + liftScale * (at.y - was.top) }

  return translated(translate, toOwn({ x: at.x - goes.x, y: at.y - goes.y }))
}

/** What `styleElements` wrote over, by element and property: the value before the first wrote, and how many write. */
const styled = new WeakMap<CSSStyleDeclaration, Map<string, { value: string; priority: string; by: number }>>()

/**
 * Writes `values` on elements of the canvas's own, such as the look of where layers landed, until what it gives back is
 * called, which puts back what was there. Several drags can write one property, as two people's previews called off on
 * one layer; what was there before any of them comes back once the last lets go.
 */
export function styleElements(elements: readonly Element[], values: Readonly<Record<string, string>>): () => void {
  const written = elements.flatMap((element) => {
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
      return []
    }

    const { style } = element
    const properties = styled.get(style) ?? new Map<string, { value: string; priority: string; by: number }>()
    styled.set(style, properties)

    return Object.keys(values).map((name) => {
      const saved = properties.get(name) ?? {
        value: style.getPropertyValue(name),
        priority: style.getPropertyPriority(name),
        by: 0
      }

      saved.by++
      properties.set(name, saved)
      style.setProperty(name, values[name]!, "important")

      return { style, name, saved }
    })
  })

  let put = false

  return () => {
    if (put) {
      return
    }

    put = true

    for (const { style, name, saved } of written) {
      if (--saved.by > 0) {
        continue
      }

      styled.get(style)?.delete(name)

      if (saved.value) {
        style.setProperty(name, saved.value, saved.priority)
      } else {
        style.removeProperty(name)
      }
    }
  }
}
