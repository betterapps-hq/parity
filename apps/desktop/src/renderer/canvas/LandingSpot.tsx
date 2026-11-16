import type { ReactNode } from "react"
import { kindColors } from "./kinds.tsx"

interface LandingSpotProps {
  color?: string
  radius?: number
  children: ReactNode
}

/**
 * Where something carried out of a layout would land: a faded copy of it with a dashed edge, which the layout makes room
 * for as it will once it's dropped. It's what the canvas's own layer drag draws today, in the layer color; someone
 * else's drag draws it in their color.
 */
export function LandingSpot({ color = kindColors.layer, radius = 8, children }: LandingSpotProps) {
  return (
    <div className="pointer-events-none relative h-full opacity-55">
      {children}
      <span
        className="absolute -inset-[2.5px]"
        style={{ borderRadius: radius + 2.5, border: `1.5px dashed ${color}` }}
      />
    </div>
  )
}
