import type { ComponentProp } from "@parity-app/core"
import { useProject } from "../canvas/context.ts"
import { useComponents } from "../components-store.ts"
import { Field, FieldGrid } from "../inspector/controls/field-row.tsx"
import { PanelSection } from "./PanelSection.tsx"

/**
 * What the project's code says of one of its components, read-only, since its board draws the code rather than a
 * design: its file, the export it's drawn from, and the props it declares itself and its variants, each with its type
 * and default. What it passes through to its element, its attributes and handlers, is left out.
 */
export function ComponentSourceSection({ component }: { component: string }) {
  const session = useProject()
  const source = session.info.sources[component]
  const info = useComponents(session.components)[component]
  const props = (info?.props ?? []).filter((prop) => prop.group === "variant" || prop.group === "own")

  return (
    <>
      <PanelSection title="Component">
        {source ? (
          <FieldGrid>
            <Field label="File">
              <Value>{source.path}</Value>
            </Field>
            <Field label="Export">
              <Value>{source.export}</Value>
            </Field>
          </FieldGrid>
        ) : (
          <p className="text-sm text-muted-foreground">This component is no longer in the project.</p>
        )}
      </PanelSection>
      {props.length > 0 && (
        <PanelSection title="Props">
          <FieldGrid>
            {props.map((prop) => (
              <Field key={prop.name} label={prop.required ? `${prop.name} *` : prop.name}>
                <Value>{propType(prop)}</Value>
              </Field>
            ))}
          </FieldGrid>
        </PanelSection>
      )}
    </>
  )
}

/** A prop's type as the source writes it, its options for a variant, and its default when it has one. */
function propType(prop: ComponentProp): string {
  const type = prop.options?.map(String).join(" | ") ?? prop.type ?? prop.kind

  return prop.default === undefined ? type : `${type} = ${String(prop.default)}`
}

/** A value the panel shows but doesn't edit, selectable to copy, its whole text on hover when it's cut off. */
function Value({ children }: { children: string }) {
  return (
    <span className="block min-w-0 truncate py-1 text-sm select-text" title={children}>
      {children}
    </span>
  )
}
