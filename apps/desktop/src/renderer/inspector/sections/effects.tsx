import { PanelGroup } from "../../chrome/PanelSection.tsx"
import { FilterList } from "../controls/filter-list.tsx"
import { ShadowList } from "../controls/shadow-list.tsx"
import { filterEntriesOf, filterStyleOf, shadowEntriesOf, shadowStyleOf } from "./effects-values.ts"
import type { SectionProps } from "./section-edits.ts"

/**
 * Effects (PAR-933): the approved Shadow list, then the Filter list under it as Filters, editing the layers' `boxShadow`,
 * `filter` and `backdropFilter`, with the project's own colors, shadows and blurs. Each list's edit replaces every
 * selected layer's list, as a mixed list says it will. Transform is in Position.
 */
export function EffectsSection({ editor, edit }: SectionProps) {
  const { style, mixed } = editor.selection
  const shadowsMixed = mixed.includes("boxShadow") || mixed.includes("filter")
  const filtersMixed = mixed.includes("filter") || mixed.includes("backdropFilter")

  return (
    <PanelGroup title="Effects">
      <ShadowList
        entries={shadowsMixed ? [] : shadowEntriesOf(style)}
        mixed={shadowsMixed}
        onChange={(entries) => edit("shadow", (layer) => shadowStyleOf(entries, layer), "Change shadows")}
      />
      <FilterList
        entries={filtersMixed ? [] : filterEntriesOf(style)}
        title="Filters"
        dropShadows={false}
        tokensOnly
        onChange={(entries) => edit("filters", (layer) => filterStyleOf(entries, layer), "Change filters")}
      />
    </PanelGroup>
  )
}
