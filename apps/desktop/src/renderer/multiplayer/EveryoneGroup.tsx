import type { ReactNode } from "react"
import { GroupLabel } from "../chrome/PanelSection.tsx"

interface EveryoneGroupProps {
  label: string
  children: ReactNode
}

/** A group in the list of everyone: People, then Agents. */
export function EveryoneGroup({ label, children }: EveryoneGroupProps) {
  return (
    <li className="flex flex-col">
      <GroupLabel className="px-2 pt-2 pb-1">{label}</GroupLabel>
      <ul className="flex flex-col">{children}</ul>
    </li>
  )
}
