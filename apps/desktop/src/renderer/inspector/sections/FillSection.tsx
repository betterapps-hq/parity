import { fillEdit } from "@parity-app/editor"
import { useState } from "react"
import { useTokens } from "../controls/field-parts.tsx"
import type { PaintEntry } from "../controls/lists-data.ts"
import { PaintStack } from "../controls/paint-stack.tsx"
import { entriesFromFill, paintsFromEntries } from "../paint-values.ts"
import type { SectionProps } from "./section-edits.ts"

/**
 * Fill: the selected layers' paint stack, colors, gradients and images, top first, on the approved Paint stack control
 * (PAR-931), written to the layers' `fills`.
 */
export function FillSection({ editor, edit }: SectionProps) {
  const { style, mixed } = editor.selection
  const gradients = useTokens("gradient").tokens
  // The control's own ids for the entries, kept while the document holds what they say, so an open editor stays open.
  const [held, setHeld] = useState<PaintEntry[]>([])
  const entries = entriesFromFill(style.fills, gradients, held)
  const fillOf = (next: PaintEntry[]) => fillEdit(paintsFromEntries(next, style.fills))

  return (
    <PaintStack
      entries={entries}
      mixed={mixed.includes("fills")}
      tokensOnly
      onPreview={(carried) =>
        carried ? editor.preview([{ row: "fill", edit: fillOf(carried), label: "Change fill" }]) : editor.endPreview()
      }
      onChange={(next) => {
        setHeld(next)
        edit("fill", fillOf(next), "Change fill")
      }}
    />
  )
}
