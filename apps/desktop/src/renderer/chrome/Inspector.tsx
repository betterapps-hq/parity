import { Accessibility, MonitorSmartphone, SlidersHorizontal } from "lucide-react"
import { TabsContent } from "@/components/ui/tabs"
import { AccessibilityPanel } from "./AccessibilityPanel.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { ModesPanel } from "./ModesPanel.tsx"
import { SidePanel } from "./SidePanel.tsx"

/** Right panel: what's selected, the project's modes, and accessibility checks of the selected design. */
export function Inspector() {
  return (
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
      <TabsContent value="design" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <DesignTab />
      </TabsContent>
      <TabsContent value="modes" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <ModesPanel />
      </TabsContent>
      <TabsContent value="accessibility" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <AccessibilityPanel />
      </TabsContent>
    </SidePanel>
  )
}
