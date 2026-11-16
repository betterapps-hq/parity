import type { ReactNode } from "react"
import { landingEdge } from "./drag-motion.ts"
import { kindColors } from "./kinds.tsx"

interface LandingSpotProps {
  color?: string
  radius?: number
  children: ReactNode
}

/**
 * Where something carried out of a layout would land: an empty dashed outline the size of what it holds, which the
 * layout makes room for as it will once it's dropped. What it holds takes its place but isn't drawn, so what's carried
 * reads as moved rather than copied. The canvas's own layer drag draws its places the same way (`landingEdgeStyle`), in
 * the layer color; someone else's drag draws it in their color.
 */
export function LandingSpot({ color = kindColors.layer, radius = 8, children }: LandingSpotProps) {
  const out = landingEdge.width + landingEdge.gap

  return (
    <div className="pointer-events-none relative h-full">
      <div className="invisible h-full">{children}</div>
      <span
        className="absolute"
        style={{ inset: -out, borderRadius: radius + out, border: `${landingEdge.width}px dashed ${color}` }}
      />
    </div>
  )
}
