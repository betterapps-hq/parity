import { useMemo, useState } from "react"
import { px } from "../../lengths.ts"
import { comesTo } from "../../token-values.ts"
import { ProjectTokens } from "../controls/field-parts.tsx"
import { TransformSection as ApprovedTransform } from "../controls/transform.tsx"
import { effectTokenSets } from "./effect-tokens.ts"
import { transformOf, transformValueOf } from "./effects-values.ts"
import type { SectionProps } from "./section-edits.ts"

/**
 * Transform (PAR-933), the approved section, inside Position: + adds it, then Move, Scale with its flips, and the rest,
 * editing the layers' `transform`. It moves how the layer is drawn, not where the layout puts it.
 */
export function TransformSection({ editor }: SectionProps) {
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

  // Scale X and Y apart is the panel's until they differ, which the transform then says.
  const [apart, setApart] = useState(false)
  const transform = transformValueOf(style.transform, editor.unit, tokenPx)
  const linked = !apart && transform.scaleLinked !== false

  return (
    <ProjectTokens key={tokensKey} tokens={sets}>
      <ApprovedTransform
        value={{ ...transform, scaleLinked: linked ? undefined : false }}
        mixed={mixed.includes("transform")}
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
