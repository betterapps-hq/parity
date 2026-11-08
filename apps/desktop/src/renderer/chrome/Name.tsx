import { Input } from "@buildkitgg/shadcn-baseui-kit"
import type { ComponentProps, ReactNode } from "react"

/**
 * A design, layer, component, state, mode or project name that stands on its own (a row, a board's title, the
 * selection's label, a tab), in Inter's letters for names, so I, l and 1 can't be mistaken (docs/typography.md). It sets
 * the letters and truncates; the role around it sets the size and weight. A name inside a sentence ("Export Pricing")
 * takes the sentence's letters instead.
 */
export function Name({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`name-text truncate ${className}`}>{children}</span>
}

/**
 * A field that edits a name, or searches by one (Layers, Tokens), in the same letters as the name shows in. Every other
 * field keeps Inter's plain letters.
 */
export function NameInput({ className = "", ...props }: ComponentProps<typeof Input>) {
  return <Input {...props} className={`name-text ${className}`} />
}
