import { useMemo, useState } from "react"
import type { StyleEditor } from "../../chrome/style-editor.ts"
import { px } from "../../lengths.ts"
import { comesTo } from "../../token-values.ts"
import { ProjectTokens } from "../controls/field-parts.tsx"
import { FilterList } from "../controls/filter-list.tsx"
import { ShadowList } from "../controls/shadow-list.tsx"
import { TransformSection } from "../controls/transform.tsx"
import { effectTokenSets } from "./effect-tokens.ts"
import {
  filterEntriesOf,
  filterStyleOf,
  shadowEntriesOf,
  shadowStyleOf,
  transformOf,
  transformValueOf
} from "./effects-values.ts"

/**
 * Effects (PAR-933): the approved Shadow list, Filter list and Transform, editing the layers' `shadow`, `filter`,
 * `backdropFilter` and `transform`, with the project's own colors, shadows and blurs. Each list's edit replaces every
 * selected layer's list, as a mixed list says it will.
 */
export function EffectsSection({ editor }: { editor: StyleEditor }) {
  const { style, mixed } = editor.selection
  const sets = useMemo(() => effectTokenSets(editor.tokens), [editor.tokens])

  // ProjectTokens takes the project's tokens when it's made, so it's made again when they change.
  const tokensKey = useMemo(
    () => editor.tokens.map((token) => `${token.name}=${JSON.stringify(token.values)}`).join(),
    [editor.tokens]
  )

  const byName = useMemo(() => new Map(editor.tokens.map((token) => [token.name, token])), [editor.tokens])

  const tokenPx = (name: string) => {
    const value = comesTo(byName, name)

    return value === undefined ? undefined : px(value)
  }

  const shadowsMixed = mixed.includes("shadow") || mixed.includes("filter")
  const filtersMixed = mixed.includes("filter") || mixed.includes("backdropFilter")
  const transformMixed = mixed.includes("transform")

  // Scale X and Y apart is the panel's until they differ, which the transform then says.
  const [apart, setApart] = useState(false)
  const transform = transformValueOf(style.transform, editor.unit, tokenPx)
  const linked = !apart && transform.scaleLinked !== false

  return (
    <ProjectTokens key={tokensKey} tokens={sets}>
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
      <TransformSection
        value={{ ...transform, scaleLinked: linked ? undefined : false }}
        mixed={transformMixed}
        onChange={(value) => {
          setApart(value.scaleLinked === false)
          editor.set(
            "transform",
            (layer) => ({ transform: transformOf(value, layer.transform, editor.unit) }),
            "Change transform"
          )
        }}
      />
    </ProjectTokens>
  )
}
