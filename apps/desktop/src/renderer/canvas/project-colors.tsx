import type { ProjectInfo } from "@parity-app/project"
import type { CSSProperties, ReactNode } from "react"
import { useProject } from "./context.ts"

/**
 * The colour a project's story files take, as their provider's manifest gives it (PAR-1131): `--canvas-story` for the
 * project's part of the window. Without one, they keep the stylesheet's, a screen's blue.
 */
export function storyColors(info: Pick<ProjectInfo, "entities">): CSSProperties {
  const color = Object.values(info.entities.looks ?? {}).find((look) => look.color)?.color

  // SAFETY: a custom property, which React sets as it's named and CSSProperties has no key for.
  return color ? ({ "--canvas-story": `light-dark(${color.light}, ${color.dark})` } as CSSProperties) : {}
}

/** A project's part of the window, in the project's own colours. */
export function ProjectColors({
  hidden,
  className,
  children
}: {
  hidden?: boolean
  className?: string
  children: ReactNode
}) {
  const { info } = useProject()

  return (
    <div hidden={hidden} className={className} style={storyColors(info)}>
      {children}
    </div>
  )
}
