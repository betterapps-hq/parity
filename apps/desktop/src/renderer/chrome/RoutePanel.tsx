import type { ReactNode } from "react"
import { useProject } from "../canvas/context.ts"
import { Field, FieldGrid } from "../inspector/controls/field-row.tsx"
import { LayerHeader } from "./LayerPanel.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { useSelectedLayer } from "./selected-layer.ts"

/**
 * A Route layer's Design panel (PAR-1076): its header, then what the app's router says of the route, read-only, since a
 * route is the project's code rather than a design: its path, its params, its file, the component it draws, and whether
 * it loads data or can redirect before it draws.
 */
export function RoutePanel() {
  const layer = useSelectedLayer()
  const { info } = useProject()
  const node = layer?.node
  const route = node?.type === "route" ? info.routes.find((each) => each.id === node.route) : undefined

  return (
    <>
      <LayerHeader />
      <PanelSection title="Route">
        {route ? (
          <FieldGrid>
            <Field label="Path">
              <Value>{route.path}</Value>
            </Field>
            {route.params.length > 0 && (
              <Field label="Params">
                <Value>{route.params.join(", ")}</Value>
              </Field>
            )}
            <Field label="File">
              <Value>{route.file}</Value>
            </Field>
            {route.component && (
              <Field label="Component">
                <Value>{route.component}</Value>
              </Field>
            )}
            <Field label="Loads data">
              <Value>{route.loads ? "Yes" : "No"}</Value>
            </Field>
            <Field label="Can redirect">
              <Value>{route.guards ? "Yes" : "No"}</Value>
            </Field>
          </FieldGrid>
        ) : (
          <p className="text-sm text-muted-foreground">This route is no longer in the app.</p>
        )}
      </PanelSection>
    </>
  )
}

/** A value the panel shows but doesn't edit, selectable to copy. */
function Value({ children }: { children: ReactNode }) {
  return <span className="block min-w-0 truncate py-1 text-sm select-text">{children}</span>
}
