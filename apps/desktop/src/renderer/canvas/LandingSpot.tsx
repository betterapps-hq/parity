import type { ReactNode } from "react"
import { landingEdge, landingOpacity } from "./drag-motion.ts"
import { kindColors } from "./kinds.tsx"

interface LandingSpotProps {
  color?: string
  radius?: number
  children: ReactNode
}

/**
 * Where something carried out of a layout would land: a faded copy of it with a dashed edge, which the layout makes room
 * for as it will once it's dropped. The canvas's own layer drag draws its copies the same way (`landingLook`), in the
 * layer color; someone else's drag draws it in their color.
 */
export function LandingSpot({ color = kindColors.layer, radius = 8, children }: LandingSpotProps) {
  const out = landingEdge.width + landingEdge.gap

  return (
    <div className="pointer-events-none relative h-full" style={{ opacity: landingOpacity }}>
      {children}
      <span
        className="absolute"
        style={{ inset: -out, borderRadius: radius + out, border: `${landingEdge.width}px dashed ${color}` }}
      />
    </div>
  )
}
