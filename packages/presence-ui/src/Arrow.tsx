import { type CSSProperties, useId } from "react"

/** An arrowhead with a rounded tip and corners, pointing up and left from its tip at (3, 3). */
export const pointerPath =
  "M4.2 3.1C3.5 2.8 2.8 3.5 3.1 4.2L9.4 19.6C9.7 20.4 10.8 20.3 11 19.5L12.6 13.4C12.7 13 13 12.7 13.4 12.6L19.5 11C20.3 10.8 20.4 9.7 19.6 9.4Z"

interface ArrowProps {
  stops: readonly [string, string, string]
  pressed?: boolean
  /** Its color's glow around the arrow, for an agent. */
  glow?: string
  className?: string
}

/**
 * The arrow people and agents point with: filled with their gradient and rimmed in white, so it reads on any design,
 * over an ordinary shadow. It presses in while they drag.
 */
export function Arrow({ stops, pressed, glow, className = "" }: ArrowProps) {
  const fill = `pointer-${useId().replaceAll(/[^\w-]/g, "")}`
  const [from, through, to] = stops
  const shadow = "drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35))"

  const style: CSSProperties = {
    filter: glow ? `${shadow} drop-shadow(0 0 5px color-mix(in oklch, ${glow} 55%, transparent))` : shadow,
    transform: pressed ? "scale(0.82)" : undefined
  }

  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden
      className={`relative -mt-0.5 -ml-0.5 origin-top-left transition-transform duration-150 motion-reduce:transition-none ${className}`}
      style={style}
    >
      <defs>
        <linearGradient id={fill} x1="4" y1="4" x2="15" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={from} />
          <stop offset="0.55" stopColor={through} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path
        d={pointerPath}
        fill={`url(#${fill})`}
        stroke="white"
        strokeWidth="2.2"
        strokeLinejoin="round"
        paintOrder="stroke"
      />
    </svg>
  )
}
