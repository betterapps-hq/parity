import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import { Component, ImageIcon, Layers, Palette, Smile } from "lucide-react"
import { ComponentsPanel, IconsPanel, ImagesPanel } from "./AssetsPanel.tsx"
import { ErrorBoundary } from "./ErrorBoundary.tsx"
import { LayerTree } from "./LayerTree.tsx"
import { SidePanel } from "./SidePanel.tsx"
import { TokensPanel } from "./TokensPanel.tsx"

/**
 * Left panel: every design's layers; what can go into designs (components, icons and photos), each a tab of its own;
 * and the project's tokens.
 */
export function LeftPanel() {
  return (
    <SidePanel
      side="left"
      label="Layers, assets and tokens"
      defaultTab="layers"
      tabs={[
        { value: "layers", label: "Layers", icon: Layers },
        { value: "components", label: "Components", icon: Component },
        { value: "icons", label: "Icons", icon: Smile },
        { value: "images", label: "Images", icon: ImageIcon },
        { value: "tokens", label: "Tokens", icon: Palette }
      ]}
    >
      <TabsContent value="layers" className="flex min-h-0 flex-col">
        <ErrorBoundary name="left.layers" label="Layers">
          <LayerTree />
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="components" className="flex min-h-0 flex-col">
        <ErrorBoundary name="left.components" label="Components">
          <ComponentsPanel />
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="icons" className="flex min-h-0 flex-col">
        <ErrorBoundary name="left.icons" label="Icons">
          <IconsPanel />
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="images" className="flex min-h-0 flex-col">
        <ErrorBoundary name="left.images" label="Images">
          <ImagesPanel />
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="tokens" className="flex min-h-0 flex-col">
        <ErrorBoundary name="left.tokens" label="Tokens">
          <TokensPanel />
        </ErrorBoundary>
      </TabsContent>
    </SidePanel>
  )
}
