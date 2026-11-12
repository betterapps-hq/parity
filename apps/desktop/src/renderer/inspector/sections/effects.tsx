import { useMemo } from "react"
import { PanelGroup } from "../../chrome/PanelSection.tsx"
import type { StyleEditor } from "../../chrome/style-editor.ts"
import { ProjectTokens } from "../controls/field-parts.tsx"
import { FilterList } from "../controls/filter-list.tsx"
import { ShadowList } from "../controls/shadow-list.tsx"
import { effectTokenSets } from "./effect-tokens.ts"
import { filterEntriesOf, filterStyleOf, shadowEntriesOf, shadowStyleOf } from "./effects-values.ts"

/**
 * Effects (PAR-933): the approved Shadow list, then the Filter list under it as Filters, editing the layers' `boxShadow`,
 * `filter` and `backdropFilter`, with the project's own colors, shadows and blurs. Each list's edit replaces every
 * selected layer's list, as a mixed list says it will. Transform is in Position.
 */
export function EffectsSection({ editor }: { editor: StyleEditor }) {
  const { style, mixed } = editor.selection
  const sets = useMemo(() => effectTokenSets(editor.tokens), [editor.tokens])

  // ProjectTokens takes the project's tokens when it's made, so it's made again when they change.
  const tokensKey = useMemo(
    () => editor.tokens.map((token) => `${token.name}=${JSON.stringify(token.values)}`).join(),
    [editor.tokens]
  )

  const shadowsMixed = mixed.includes("boxShadow") || mixed.includes("filter")
  const filtersMixed = mixed.includes("filter") || mixed.includes("backdropFilter")

  return (
    <ProjectTokens key={tokensKey} tokens={sets}>
      <PanelGroup title="Effects">
        <ShadowList
          entries={shadowsMixed ? [] : shadowEntriesOf(style)}
          mixed={shadowsMixed}
          onChange={(entries) => editor.set("shadow", (layer) => shadowStyleOf(entries, layer), "Change shadows")}
        />
        <FilterList
          entries={filtersMixed ? [] : filterEntriesOf(style)}
          title="Filters"
          dropShadows={false}
          tokensOnly
          onChange={(entries) => editor.set("filters", (layer) => filterStyleOf(entries, layer), "Change filters")}
        />
      </PanelGroup>
    </ProjectTokens>
  )
}
