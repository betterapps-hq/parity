import type { ReactNode, Ref } from "react"
import { floatingBar } from "../toolbar-parts.tsx"
import { useWarp } from "./useWarp.ts"

interface WarpProps {
  /** Where the bar floats. */
  className: string
  /** What the bar is to a screen reader, for the side showing. */
  label: string
  /** Whether the away side shows rather than the home side. */
  warped: boolean
  /** The color the warp ripples and glows in. */
  color: string
  /** The side it starts on, with the warp's anchor (`data-warp-anchor`). */
  home: ReactNode
  away: ReactNode
}

/**
 * A floating bar with two sides stacked in its middle, which warps from one to the other (PAR-795). With reduced motion
 * it cross-fades.
 */
export function Warp({ className, label, warped, color, home, away }: WarpProps) {
  const { barRef, flashRef, glowRef, homeRef, awayRef, sizing } = useWarp(warped, color)

  return (
    <div className={className}>
      <div ref={barRef} role="toolbar" aria-label={label} className={`relative origin-bottom ${floatingBar}`}>
        <span
          ref={glowRef}
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0"
          style={{ boxShadow: "0 0 0 1.5px var(--warp), 0 10px 32px -6px var(--warp)" }}
        />
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
          <span
            ref={flashRef}
            className="absolute top-1/2 -mt-5 -ml-5 size-10 rounded-full opacity-0"
            style={{ background: "radial-gradient(circle, var(--warp) 0%, transparent 70%)" }}
          />
        </span>
        {/*
         * The wider side is clipped to the bar while its width springs, but 4px out, into the bar's padding, so a focused
         * button's 3px ring shows whole at either end. Overflow can't clip with a margin on one axis only, so a clip path
         * does it, with room above and below for the burst and its blur.
         */}
        <div className="relative grid h-8 grid-cols-[100%] [clip-path:inset(-3rem_-0.25rem)]" style={sizing}>
          <Side ref={homeRef} shown={!warped}>
            {home}
          </Side>
          <Side ref={awayRef} shown={warped}>
            {away}
          </Side>
        </div>
      </div>
    </div>
  )
}

interface SideProps {
  ref: Ref<HTMLDivElement>
  shown: boolean
  children: ReactNode
}

/**
 * One side of the bar, stacked over the other in the middle. The side that isn't showing goes once its parts have flown
 * out, and can't be reached by pointer, keyboard or screen reader.
 */
function Side({ ref, shown, children }: SideProps) {
  return (
    <div
      ref={ref}
      inert={!shown}
      className={`col-start-1 row-start-1 flex w-max items-stretch gap-0.5 [justify-self:unsafe_center] ${shown ? "opacity-100 motion-reduce:transition-opacity motion-reduce:duration-150" : "pointer-events-none opacity-0 transition-opacity delay-[400ms] duration-0 motion-reduce:delay-0 motion-reduce:duration-150"}`}
    >
      {children}
    </div>
  )
}
