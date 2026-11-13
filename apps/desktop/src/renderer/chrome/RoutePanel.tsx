import type { ReactNode } from "react"
import { useProject } from "../canvas/context.ts"
import { Field, FieldGrid } from "../inspector/controls/field-row.tsx"
import { LayerHeader } from "./LayerPanel.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { useSelectedLayer } from "./selected-layer.ts"

/**
 * What a route draws, selected in a page's layers (PAR-1076): its header, then what the app's router says of the route.
 */
export function RoutePanel() {
  const layer = useSelectedLayer()
  const node = layer?.node

  return (
    <>
      <LayerHeader />
      {node?.type === "route" && <RouteSection route={node.route} />}
    </>
  )
}

/**
 * What the app's router says of a route, read-only, since a route is the project's code rather than a design: its path,
 * its params, its file, the component it draws, and whether it loads data or can redirect before it draws. A page and
 * each layer of it show their route's.
 */
export function RouteSection({ route: id }: { route: string }) {
  const { info } = useProject()
  const route = info.routes.find((each) => each.id === id)

  return (
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
  )
}

/** A value the panel shows but doesn't edit, selectable to copy. */
function Value({ children }: { children: ReactNode }) {
  return <span className="block min-w-0 truncate py-1 text-sm select-text">{children}</span>
}
