import { useMemo, useState } from "react"
import { px } from "../../lengths.ts"
import { comesTo } from "../../token-values.ts"
import { TransformSection as ApprovedTransform } from "../controls/transform.tsx"
import { transformOf, transformValueOf } from "./effects-values.ts"
import type { SectionProps } from "./section-edits.ts"

/**
 * Transform (PAR-933), the approved section, inside Position: + adds it, then Move, Scale with its flips, and the rest,
 * editing the layers' `translate`, `scale` and `transformOrigin`. It moves how the layer is drawn, not where the layout puts it.
 */
export function TransformSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const byName = useMemo(() => new Map(editor.tokens.map((token) => [token.name, token])), [editor.tokens])

  const tokenPx = (name: string) => {
    const value = comesTo(byName, name)

    return value === undefined ? undefined : px(value)
  }

  // Scale X and Y apart is the panel's until they differ, which the transform then says.
  const [apart, setApart] = useState(false)
  const transform = transformValueOf(style, editor.unit, tokenPx)
  const linked = !apart && transform.scaleLinked !== false

  return (
    <ApprovedTransform
      value={{ ...transform, scaleLinked: linked ? undefined : false }}
      mixed={editor.selection.differs("transform")}
      onChange={(value) => {
        setApart(value.scaleLinked === false)
        edit("transform", (layer) => transformOf(value, layer, editor.unit, tokenPx), "Change transform")
      }}
    />
  )
}
