import { TabsContent } from "@buildkitgg/shadcn"
import { Component, Layers } from "lucide-react"
import { ErrorBoundary } from "../chrome/ErrorBoundary.tsx"
import { Inspector } from "../chrome/Inspector.tsx"
import { ComponentLayerTree } from "../chrome/LayerTree.tsx"
import { SidePanel } from "../chrome/SidePanel.tsx"
import { ProjectCanvas, useOpenProject } from "./project-canvas.tsx"
import type { LensView } from "./registry.ts"
import { useLensWorkspace } from "./shell.ts"

/**
 * The project's components, on a canvas of their own (lens-layout.md): each on its board with its states side by side,
 * drawn the first time the lens shows and kept where they were after. Its Layers lists them; the inspector shows the
 * selected component, with its props and where it's used.
 */
export const componentsLens: LensView<"components"> = {
  id: "components",
  name: "Components",
  icon: "component",
  Icon: Component,
  order: 3,
  shortcut: "Ctrl+3",
  // A board is drawn from the project's code, so there's nothing to draw on it with.
  Canvas: ({ lens, visible }) => <ProjectCanvas lens={lens} draws="components" visible={visible} tools={false} />,
  Panel: ComponentsPanel,
  Inspector: ComponentsInspector
}

function ComponentsPanel() {
  const { reopen } = useOpenProject()
  const lenses = useLensWorkspace()

  return (
    <ErrorBoundary name="left-panel" label="Left panel" onReopen={reopen} className="w-64 flex-none border-r">
      <SidePanel
        side="left"
        label="Components"
        defaultTab="layers"
        tabs={[{ value: "layers", label: "Layers", icon: Layers }]}
        // Components, assets, tokens and extensions' tabs are in Screens' panel, so asking for one shows Screens.
        onOtherTab={() => lenses.followLink("screens", false)}
      >
        <TabsContent value="layers" className="flex min-h-0 flex-col">
          <ErrorBoundary name="left.layers" label="Layers">
            <ComponentLayerTree />
          </ErrorBoundary>
        </TabsContent>
      </SidePanel>
    </ErrorBoundary>
  )
}

function ComponentsInspector() {
  const { reopen } = useOpenProject()

  return (
    <ErrorBoundary name="inspector" label="Inspector" onReopen={reopen} className="w-72 flex-none border-l">
      <Inspector />
    </ErrorBoundary>
  )
}
