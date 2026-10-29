import { Component, ImageIcon, Layers, Palette, Smile } from "lucide-react"
import { TabsContent } from "@/components/ui/tabs"
import { ComponentsPanel, IconsPanel, ImagesPanel } from "./AssetsPanel.tsx"
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
      <TabsContent value="layers" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <LayerTree />
      </TabsContent>
      <TabsContent value="components" className="flex min-h-0 flex-col">
        <ComponentsPanel />
      </TabsContent>
      <TabsContent value="icons" className="flex min-h-0 flex-col">
        <IconsPanel />
      </TabsContent>
      <TabsContent value="images" className="flex min-h-0 flex-col">
        <ImagesPanel />
      </TabsContent>
      <TabsContent value="tokens" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <TokensPanel />
      </TabsContent>
    </SidePanel>
  )
}
