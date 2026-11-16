import { TabsContent } from "@buildkitgg/shadcn"
import type { ComponentType } from "react"
import { useProject } from "../canvas/context.ts"
import { type PlacedView, type SectionTarget, sectionsFor, tabsAt } from "../extension-views.ts"
import { useExtensions } from "../extensions.ts"
import { ErrorBoundary } from "./ErrorBoundary.tsx"
import { ContributionIcon } from "./ExtensionIcons.tsx"
import { ExtensionView } from "./ExtensionView.tsx"
import { PanelSection } from "./PanelSection.tsx"
import type { PanelTab } from "./SidePanel.tsx"

/*
 * The tabs extensions add to the left and right panels (PAR-1094), after Parity's own, and the sections they add to the
 * Design tab, each holding one of the extension's declarative views.
 */

/** The tabs extensions add to a side panel. */
export function useExtensionTabs(side: "left" | "right"): PlacedView[] {
  return tabsAt(useExtensions(useProject()).extensions, side)
}

/** A side panel's tab for an extension's view: its title, and its icon, or the extension's logo without one. */
export function extensionPanelTab(view: PlacedView): PanelTab {
  const Icon: ComponentType<{ className?: string }> = ({ className }) => (
    <ContributionIcon name={view.icon} logo={view.extension.icon} className={className} />
  )

  return { value: view.id, label: view.title, icon: Icon }
}

/** What each of a side panel's extension tabs holds. */
export function ExtensionTabPanels({ views }: { views: PlacedView[] }) {
  const session = useProject()

  return views.map((view) => (
    <TabsContent key={view.id} value={view.id} className="min-h-0 overflow-x-hidden overflow-y-auto p-3">
      <ErrorBoundary name="extension.tab" label={view.title}>
        <ExtensionView session={session} view={view} size="panel" />
      </ErrorBoundary>
    </TabsContent>
  ))
}

/** The Design tab sections extensions add for what's selected, after Parity's own. */
export function ExtensionSections({ selected }: { selected: SectionTarget }) {
  const session = useProject()
  const sections = sectionsFor(useExtensions(session).extensions, selected)

  return sections.map((view) => (
    <PanelSection key={view.id} title={view.title}>
      <ErrorBoundary name="extension.section" label={view.title}>
        <ExtensionView session={session} view={view} size="panel" selected={selected.target} />
      </ErrorBoundary>
    </PanelSection>
  ))
}
