import type { FrameSkeleton as Skeleton } from "@parity/core"
import { memo } from "react"

/**
 * A frame's skeleton (see frame-skeletons.ts), stretched over what holds it: the frame's boxes as a few paths, in front
 * of its background.
 */
export const FrameSkeleton = memo(function FrameSkeleton({
  skeleton,
  className = "frame-skeleton"
}: {
  skeleton: Skeleton
  className?: string
}) {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${skeleton.width} ${skeleton.height}`}
      preserveAspectRatio="none"
      aria-hidden
      style={skeleton.background ? { background: skeleton.background } : undefined}
    >
      {skeleton.layers.map((layer, index) => (
        <path
          // Layers are only ever replaced whole, with the skeleton.
          key={index}
          d={layer.path}
          style={{ fill: layer.fill ?? "none", stroke: layer.stroke, opacity: layer.opacity }}
        />
      ))}
    </svg>
  )
})
