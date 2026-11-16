import type { Palette } from "@parity-app/presence-colors"
import { useId } from "react"
import { pointerPath } from "../agent/AgentPointer.tsx"

/**
 * A person's arrow: the agents' arrowhead and gradient, rimmed in white, with an ordinary shadow. It doesn't glow or
 * breathe; only an agent's does. It presses in while they drag.
 */
export function PersonPointer({ palette, pressed }: { palette: Palette; pressed?: boolean }) {
  const fill = `person-pointer-${useId().replaceAll(/[^\w-]/g, "")}`
  const [from, through, to] = palette.stops

  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      aria-hidden
      className="relative -mt-0.5 -ml-0.5 origin-top-left transition-transform duration-150"
      style={{ filter: "drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.35))", transform: pressed ? "scale(0.82)" : undefined }}
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
