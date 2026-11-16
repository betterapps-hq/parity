import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import { Component, ImagePlay, Layers, Palette, Smile } from "lucide-react"
import { MediaPanel } from "../media/MediaPanel.tsx"
import { ComponentsPanel, IconsPanel } from "./AssetsPanel.tsx"
import { ErrorBoundary } from "./ErrorBoundary.tsx"
import { ExtensionTabPanels, extensionPanelTab, useExtensionTabs } from "./ExtensionTabs.tsx"
import { LayerTree } from "./LayerTree.tsx"
import { SidePanel } from "./SidePanel.tsx"
import { TokensPanel } from "./TokensPanel.tsx"

/**
 * Left panel: every design's layers; what can go into designs (components, icons and media), each a tab of its own;
 * and the project's tokens; then the tabs extensions add.
 */
export function LeftPanel() {
  const added = useExtensionTabs("left")

  return (
    <SidePanel
      side="left"
      label="Layers, assets and tokens"
      defaultTab="layers"
      tabs={[
        { value: "layers", label: "Layers", icon: Layers },
        { value: "components", label: "Components", icon: Component },
        { value: "icons", label: "Icons", icon: Smile },
        { value: "media", label: "Media", icon: ImagePlay },
        { value: "tokens", label: "Tokens", icon: Palette },
        ...added.map(extensionPanelTab)
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
      <TabsContent value="media" className="flex min-h-0 flex-col">
        <ErrorBoundary name="left.media" label="Media">
          <MediaPanel />
        </ErrorBoundary>
      </TabsContent>
      <TabsContent value="tokens" className="flex min-h-0 flex-col">
        <ErrorBoundary name="left.tokens" label="Tokens">
          <TokensPanel />
        </ErrorBoundary>
      </TabsContent>
      <ExtensionTabPanels views={added} />
    </SidePanel>
  )
}
