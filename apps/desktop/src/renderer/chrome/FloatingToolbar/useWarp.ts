import { type CSSProperties, useLayoutEffect, useRef, useState } from "react"
import { asEasing, reducedMotion, springs } from "../../springs.ts"
import { playWarp, timing } from "./warp-motion.ts"

/**
 * Warps a bar between its two sides (see `warp-motion.ts`): `warped` shows the away side, and `color` is the ripple's
 * and the ring's as it does. Gives the refs for the bar's parts, and the style that springs its width to the showing
 * side's. Focus follows the side that's showing, to its picked control or its first.
 */
export function useWarp(warped: boolean, color: string) {
  const bar = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLSpanElement>(null)
  const glow = useRef<HTMLSpanElement>(null)
  const home = useRef<HTMLDivElement>(null)
  const away = useRef<HTMLDivElement>(null)
  const [widths, setWidths] = useState({ home: 0, away: 0 })

  // Each side's width, kept current as a side changes, as when a stamp's name shows.
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() =>
      setWidths({ home: home.current?.offsetWidth ?? 0, away: away.current?.offsetWidth ?? 0 })
    )

    for (const side of [home.current, away.current]) {
      if (side) {
        observer.observe(side)
      }
    }

    return () => observer.disconnect()
  }, [])

  // The warp, before the browser paints the switch.
  const previous = useRef(warped)

  useLayoutEffect(() => {
    if (previous.current === warped) {
      return
    }

    previous.current = warped

    const parts = {
      bar: bar.current,
      flash: flash.current,
      glow: glow.current,
      leaving: warped ? home.current : away.current,
      entering: warped ? away.current : home.current
    }

    if (!parts.bar || !parts.flash || !parts.glow || !parts.leaving || !parts.entering) {
      return
    }

    if (!reducedMotion()) {
      playWarp(
        { bar: parts.bar, flash: parts.flash, glow: parts.glow, leaving: parts.leaving, entering: parts.entering },
        warped ? "in" : "out",
        color
      )
    }

    const focus =
      parts.entering.querySelector<HTMLElement>("[aria-pressed='true']") ?? parts.entering.querySelector("button")

    focus?.focus({ preventScroll: true })
  }, [warped, color])

  const width = warped ? widths.away : widths.home

  const sizing: CSSProperties = {
    width: width || undefined,
    transition: reducedMotion()
      ? undefined
      : `width ${springs.width.duration}ms ${asEasing(springs.width)} ${timing[warped ? "in" : "out"].width}ms`
  }

  return { barRef: bar, flashRef: flash, glowRef: glow, homeRef: home, awayRef: away, sizing }
}
