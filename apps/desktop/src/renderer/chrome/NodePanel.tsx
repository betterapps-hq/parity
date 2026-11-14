import type { NodeRef } from "@parity-app/core"
import { CircleDot } from "lucide-react"
import { useProject } from "../canvas/context.ts"
import { kindColors } from "../canvas/kinds.tsx"
import { useExtensions } from "../extensions.ts"
import { Field, FieldGrid } from "../inspector/controls/field-row.tsx"
import { projectNodes } from "../project-nodes.ts"
import { Name } from "./Name.tsx"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
import { Value } from "./RoutePanel.tsx"
import { headingIcon, headingName, SelectionHeading } from "./SelectionHeading.tsx"

/**
 * The Design tab for a node selected by ref that has no panel of its own (PAR-1092), as a story or an extension's node:
 * its name, its type as its extension names it, and the facts extensions set about it.
 */
export function NodePanel({ node: ref }: { node: NodeRef }) {
  const session = useProject()
  const { extensions } = useExtensions(session)
  const node = projectNodes(session).get(ref)
  const type = extensions.flatMap((each) => each.contributes.nodeTypes ?? []).find((each) => each.id === ref.type)
  const facts = extensions.flatMap((each) => each.facts[ref.key] ?? [])
  const kind = type?.name ?? ref.type.charAt(0).toUpperCase() + ref.type.slice(1)

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <SelectionHeading
          icon={<CircleDot className={headingIcon} />}
          color={type?.color ?? kindColors.screen}
          kind={kind}
          name={<Name className={`px-1.5 ${headingName}`}>{node?.name ?? ref.key}</Name>}
        />
      </div>
      {facts.length > 0 && (
        <PanelSection title={kind}>
          <FieldGrid>
            {facts.map((fact) => (
              <Field key={fact.id} label={fact.label}>
                <Value>{fact.value}</Value>
              </Field>
            ))}
          </FieldGrid>
        </PanelSection>
      )}
    </>
  )
}
