import { createContext, useContext, useSyncExternalStore } from "react"
import type { ProjectSession } from "../workspace.ts"

export const ProjectContext = createContext<ProjectSession | undefined>(undefined)

/**
 * The project of the tab this component belongs to. It's the same object for as long as the tab is open, and the
 * component draws again whenever one of its parts that can change does, such as its info or its canvas.
 */
export function useProject(): ProjectSession {
  const value = useContext(ProjectContext)

  if (!value) {
    throw new Error("useProject must be used inside a project tab")
  }

  useSyncExternalStore(value.subscribe, value.getParts)

  return value
}
