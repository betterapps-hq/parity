import { createContext, useContext } from "react"
import type { ProjectSession } from "../workspace.ts"

export const ProjectContext = createContext<ProjectSession | undefined>(undefined)

/** The project of the tab this component belongs to. */
export function useProject(): ProjectSession {
  const value = useContext(ProjectContext)
  if (!value) throw new Error("useProject must be used inside a project tab")
  return value
}
