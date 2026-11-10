import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import {
  Accessibility,
  Component,
  ImagePlay,
  Layers,
  MonitorSmartphone,
  Palette,
  SlidersHorizontal,
  Smile
} from "lucide-react"
import type { ReactNode } from "react"
import { AccessibilityPanel } from "../../chrome/AccessibilityPanel.tsx"
import { ComponentsPanel, IconsPanel } from "../../chrome/AssetsPanel.tsx"
import { ModesPanel } from "../../chrome/ModesPanel.tsx"
import { SidePanel } from "../../chrome/SidePanel.tsx"
import { TokensPanel } from "../../chrome/TokensPanel.tsx"
import { MediaPanel } from "../../media/MediaPanel.tsx"
import { ProjectStage } from "../../stories/fixtures.tsx"
import { CanvasSketch } from "./canvas-sketch.tsx"
import { ContainerLayers } from "./container-layers.tsx"
import { ContainerTab } from "./container-panel.tsx"

/**
 * The window as the app lays it out, for the active project: Layers on the left, a sketch of the canvas, and the
 * inspector on the right. The Layers tab and the inspector's Design tab are the explorations; every other tab is the
 * shipped one, as LeftPanel and Inspector put them together.
 */
export function Workspace() {
  return (
    <ProjectStage className="flex h-screen bg-background text-foreground">
      <SidePanel
        side="left"
        label="Layers, assets and tokens"
        defaultTab="layers"
        tabs={[
          { value: "layers", label: "Layers", icon: Layers },
          { value: "components", label: "Components", icon: Component },
          { value: "icons", label: "Icons", icon: Smile },
          { value: "media", label: "Media", icon: ImagePlay },
          { value: "tokens", label: "Tokens", icon: Palette }
        ]}
      >
        <Scrolling value="layers">
          <ContainerLayers />
        </Scrolling>
        <TabsContent value="components" className="flex min-h-0 flex-col">
          <ComponentsPanel />
        </TabsContent>
        <TabsContent value="icons" className="flex min-h-0 flex-col">
          <IconsPanel />
        </TabsContent>
        <TabsContent value="media" className="flex min-h-0 flex-col">
          <MediaPanel />
        </TabsContent>
        <TabsContent value="tokens" className="flex min-h-0 flex-col">
          <TokensPanel />
        </TabsContent>
      </SidePanel>
      <CanvasSketch />
      <SidePanel
        side="right"
        label="Inspector"
        defaultTab="design"
        tabs={[
          { value: "design", label: "Design", icon: SlidersHorizontal },
          { value: "modes", label: "Modes", icon: MonitorSmartphone },
          { value: "accessibility", label: "Accessibility", icon: Accessibility }
        ]}
      >
        <Scrolling value="design">
          <ContainerTab />
        </Scrolling>
        <Scrolling value="modes">
          <ModesPanel />
        </Scrolling>
        <Scrolling value="accessibility">
          <AccessibilityPanel />
        </Scrolling>
      </SidePanel>
    </ProjectStage>
  )
}

function Scrolling({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent value={value} className="min-h-0 overflow-x-hidden overflow-y-auto">
      {children}
    </TabsContent>
  )
}
