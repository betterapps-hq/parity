import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import { MonitorSmartphone, SlidersHorizontal } from "lucide-react"
import type { ReactNode } from "react"
import { ModesPanel } from "../../chrome/ModesPanel.tsx"
import { SidePanel } from "../../chrome/SidePanel.tsx"
import { ProjectStage } from "../../stories/fixtures.tsx"
import { CanvasSketch } from "./canvas-sketch.tsx"
import { ContainerPanel } from "./container-panel.tsx"
import { type SketchSetup, SketchProvider } from "./sketch-state.tsx"

export interface ContainerWorkspaceProps extends SketchSetup {
  zoom: number
}

/**
 * The window for the exploration: the canvas, and the inspector on the right. Its Design tab is the exploration; its
 * Modes tab is the shipped one, editing the project's modes, which the canvas draws.
 */
export function ContainerWorkspace({ zoom, ...setup }: ContainerWorkspaceProps) {
  return (
    <ProjectStage className="flex h-screen bg-background text-foreground">
      <SketchProvider setup={setup}>
        <CanvasSketch zoom={zoom} />
        <SidePanel
          side="right"
          label="Inspector"
          defaultTab="design"
          tabs={[
            { value: "design", label: "Design", icon: SlidersHorizontal },
            { value: "modes", label: "Modes", icon: MonitorSmartphone }
          ]}
        >
          <Scrolling value="design">
            <ContainerPanel />
          </Scrolling>
          <Scrolling value="modes">
            <ModesPanel />
          </Scrolling>
        </SidePanel>
      </SketchProvider>
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
