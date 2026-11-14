import type { ReactNode } from "react"
import { useProject } from "../canvas/context.ts"
import type { ContainerEntry } from "../design-store.ts"
import { Field, FieldGrid } from "../inspector/controls/field-row.tsx"
import { type PropRow, PropRows } from "../inspector/controls/instance-section.tsx"
import { LayerHeader } from "./LayerPanel.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { textValue } from "./prop-values.ts"
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

/**
 * A page's path params as its props: the value each is drawn with, which only the canvas keeps, as how it shows the
 * page, never the app's code. An unset one shows the param's name, which the page is drawn with.
 */
export function RouteProps({ entry, route: id }: { entry: ContainerEntry; route: string }) {
  const { info, store } = useProject()
  const params = info.routes.find((each) => each.id === id)?.params ?? []
  const values = entry.container.view?.params ?? {}

  if (params.length === 0) {
    return null
  }

  const rows: PropRow[] = params.map((name) => ({ type: "text", name, value: values[name], placeholder: name }))

  return (
    <PanelSection title="Props">
      <FieldGrid>
        <PropRows
          rows={rows}
          onChange={(name, value) =>
            store.updateView(entry.key, `Change ${name}`, (view) => {
              const next = { ...view.params }
              // Each row is text, so a value is too.
              const text = textValue.safeParse(value)

              if (text.success && text.data !== "") {
                next[name] = text.data
              } else {
                delete next[name]
              }

              return { ...view, params: next }
            })
          }
        />
      </FieldGrid>
    </PanelSection>
  )
}

/** A value the panel shows but doesn't edit, selectable to copy. */
function Value({ children }: { children: ReactNode }) {
  return <span className="block min-w-0 truncate py-1 text-sm select-text">{children}</span>
}
