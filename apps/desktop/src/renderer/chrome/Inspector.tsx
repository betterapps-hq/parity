import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import { Accessibility, CodeXml, MonitorSmartphone, SlidersHorizontal } from "lucide-react"
import { AccessibilityPanel } from "./AccessibilityPanel.tsx"
import { CodePanel } from "./CodePanel.tsx"
import { DesignTab } from "./DesignPanel.tsx"
import { ModesPanel } from "./ModesPanel.tsx"
import { SidePanel } from "./SidePanel.tsx"

/**
 * Right panel: what's selected, the project's modes, where the selected component's code is, and accessibility checks
 * of the selected design.
 */
export function Inspector() {
  return (
    <SidePanel
      side="right"
      label="Inspector"
      defaultTab="design"
      tabs={[
        { value: "design", label: "Design", icon: SlidersHorizontal },
        { value: "modes", label: "Modes", icon: MonitorSmartphone },
        { value: "code", label: "Code", icon: CodeXml },
        { value: "accessibility", label: "Accessibility", icon: Accessibility }
      ]}
    >
      <TabsContent value="design" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <DesignTab />
      </TabsContent>
      <TabsContent value="modes" className="min-h-0 overflow-x-hidden overflow-y-auto">
        <ModesPanel />
      </TabsContent>
      <TabsContent value="code" className="flex min-h-0 flex-col overflow-hidden">
        <CodePanel />
      </TabsContent>
      <TabsContent value="accessibility" className="flex min-h-0 flex-col overflow-hidden">
        <AccessibilityPanel />
      </TabsContent>
    </SidePanel>
  )
}
