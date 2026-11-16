import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import type { ProjectRoute } from "@parity-app/core"
import { refsSelection, type Selection } from "@parity-app/editor"
import { AppWindow, Server } from "lucide-react"
import { useProject } from "../canvas/context.ts"
import { routeRef } from "../canvas/route-pages.ts"
import { Field, FieldGrid } from "../inspector/controls/field-row.tsx"
import { markRoute, useMarkedRoutes } from "../route-marks.ts"
import type { ProjectSession } from "../workspace.ts"
import { Name } from "./Name.tsx"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
import { Value } from "./RoutePanel.tsx"
import { headingIcon, headingName, SelectionHeading } from "./SelectionHeading.tsx"

/**
 * The app's API routes (PAR-1174): routes that answer requests on the server and draw nothing, listed in Layers under
 * its pages and never on the canvas. Each can be marked as a page, and a page as an API route, where Parity read it
 * otherwise (PAR-1175, PAR-1176).
 */

/** The color API routes are drawn in, as nothing on the canvas is. */
const apiColor = "var(--muted-foreground)"

/** The project's routes as Parity read them, with the person's marks. */
export function useProjectRoutes(session: ProjectSession): ProjectRoute[] {
  return useMarkedRoutes(session.doc, session.info.routes)
}

/** The API route a selection holds, by ref, when it holds one and nothing else. */
export function selectedApiRoute(routes: readonly ProjectRoute[], selection: Selection): ProjectRoute | undefined {
  const ref = selection.refs?.length === 1 ? selection.refs[0] : undefined

  return ref?.type === "route" ? routes.find((route) => route.id === ref.key && route.kind === "api") : undefined
}

/** An API route's row in Layers: its path. A click selects it; its menu marks it as a page. */
export function ApiRouteLine({ route, selected }: { route: ProjectRoute; selected: boolean }) {
  const session = useProject()
  const read = session.info.routes.find((each) => each.id === route.id)
  const select = () => session.selection.set(refsSelection([routeRef(session.info, route.id)]))

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            id={`layer-api-${route.id}`}
            role="treeitem"
            aria-label={route.path}
            aria-selected={selected}
            aria-level={1}
            tabIndex={-1}
            onClick={select}
            onContextMenu={select}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                select()
              }
            }}
            className={`flex h-7 cursor-default items-center gap-1.5 pr-2 pl-[30px] ${selected ? "bg-accent" : "hover:bg-accent/40"}`}
          />
        }
      >
        <Server className="size-3.5 shrink-0" style={{ color: apiColor }} />
        <Name className="min-w-0 flex-1">{route.path}</Name>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52" aria-label={route.path}>
        <ContextMenuItem disabled={!read} onClick={() => read && markRoute(session.doc, read, "page")}>
          <AppWindow />
          Mark as page
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/** The menu item that marks a page as an API route, for a page's menus in Layers and on canvas. */
export function MarkAsApiItem({ route: id }: { route: string }) {
  const session = useProject()
  const read = session.info.routes.find((each) => each.id === id)

  // Only a page, as read or as marked: a layout or group holds pages, which an API route can't.
  if (!read || (read.kind !== "page" && read.kind !== "api")) {
    return null
  }

  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuItem onClick={() => markRoute(session.doc, read, "api")}>
        <Server />
        Mark as API route
      </ContextMenuItem>
    </>
  )
}

/**
 * An API route selected in Layers: what the app's router says of it, read-only, since it's the project's code. It draws
 * nothing, so it has no modes, states or Export.
 */
export function ApiRoutePanel({ route }: { route: ProjectRoute }) {
  const name = route.path

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <SelectionHeading
          icon={<Server className={headingIcon} />}
          color={apiColor}
          kind="API route"
          name={<Name className={`px-1.5 ${headingName}`}>{name}</Name>}
        />
      </div>
      <PanelSection title="Route">
        <FieldGrid>
          <Field label="Path">
            <Value>{route.path}</Value>
          </Field>
          <Field label="File">
            <Value>{route.file}</Value>
          </Field>
        </FieldGrid>
      </PanelSection>
    </>
  )
}
