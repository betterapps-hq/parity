import { PanelSection } from "../../chrome/PanelSection.tsx"
import { type Reading, tokenNamed, useTokens, ValueField } from "../controls/field-parts.tsx"
import { Field } from "../controls/field-row.tsx"
import { mixedOf, rowState, type SectionProps } from "./section-edits.ts"

/**
 * Effects: the one shadow token `NodeStyle` holds, on the shared field, as a pill from the project's shadows or None.
 * PAR-933 makes it the list of shadows, blurs and filters.
 */
export function EffectsSection({ editor, edit }: SectionProps) {
  const { style } = editor.selection
  const shadows = useTokens("shadow").tokens
  const token = shadows.find((each) => each.name === style.shadow)
  const set = (shadow: string | undefined) => edit("shadow", { shadow }, "Change shadow")

  const read = (text: string): Reading<string | undefined> => {
    if (text.trim() === "") {
      return { value: undefined }
    }

    const named = tokenNamed(shadows, text, "shadow-")

    return named ? { value: named.name } : { reason: "Enter a shadow token's name" }
  }

  return (
    <PanelSection title="Effects">
      <Field label="Shadow" {...rowState(editor, "shadow")}>
        <ValueField
          label="Shadow"
          shown={undefined}
          placeholder="None"
          mixed={mixedOf(editor)("shadow")}
          chip={
            style.shadow === undefined
              ? undefined
              : { name: style.shadow, token, namespace: "shadow-", onRemove: () => set(undefined), onReplace: set }
          }
          comesTo={token?.detail}
          tokens={{ list: shadows, current: style.shadow, none: "None", onPick: set }}
          locked={{ tokens: shadows, nearestTo: () => undefined }}
          read={read}
          onCommit={set}
        />
      </Field>
    </PanelSection>
  )
}
