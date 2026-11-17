import { TabsContent } from "@buildkitgg/shadcn"
import { Layers, Route } from "lucide-react"
import { ErrorBoundary } from "../chrome/ErrorBoundary.tsx"
import { Inspector } from "../chrome/Inspector.tsx"
import { RouteLayerTree } from "../chrome/LayerTree.tsx"
import { SidePanel } from "../chrome/SidePanel.tsx"
import { ProjectCanvas, useOpenProject } from "./project-canvas.tsx"
import type { LensView } from "./registry.ts"

/**
 * The app's routes and their pages, on a canvas of their own (lens-layout.md): drawn the first time the lens shows, with
 * the lines of the app's page tree, and kept where they were after. Its Layers lists the routes; the inspector shows the
 * selected page, with its links to the other lenses.
 */
export const pagesLens: LensView<"pages"> = {
  id: "pages",
  name: "Pages",
  icon: "route",
  Icon: Route,
  order: 1,
  shortcut: "Ctrl+1",
  // A page is drawn from the app's code, so there's nothing to draw on it with.
  Canvas: ({ lens, visible }) => <ProjectCanvas lens={lens} draws="pages" visible={visible} tools={false} />,
  Panel: PagesPanel,
  Inspector: PagesInspector
}

function PagesPanel() {
  const { reopen } = useOpenProject()

  return (
    <ErrorBoundary name="left-panel" label="Left panel" onReopen={reopen} className="w-64 flex-none border-r">
      <SidePanel
        side="left"
        label="Pages"
        defaultTab="layers"
        tabs={[{ value: "layers", label: "Layers", icon: Layers }]}
      >
        <TabsContent value="layers" className="flex min-h-0 flex-col">
          <ErrorBoundary name="left.layers" label="Layers">
            <RouteLayerTree />
          </ErrorBoundary>
        </TabsContent>
      </SidePanel>
    </ErrorBoundary>
  )
}

function PagesInspector() {
  const { reopen } = useOpenProject()

  return (
    <ErrorBoundary name="inspector" label="Inspector" onReopen={reopen} className="w-72 flex-none border-l">
      <Inspector />
    </ErrorBoundary>
  )
}
