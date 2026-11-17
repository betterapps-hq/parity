import { Component } from "lucide-react"
import type { ShownPreview } from "./offeredLibraries.ts"
import { SectionHeading } from "./SectionHeading.tsx"

/** Every component, by family, with how many parts each has. */
export function Families({ families, total }: { families: ShownPreview["families"]; total: number }) {
  return (
    <section aria-labelledby="library-components" className="mx-6 mt-8">
      <SectionHeading id="library-components" icon={Component} title="Components" count={total} />
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {families.map((family) => (
          <li key={family.name} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
            {family.name}
            {family.count > 1 && <span className="text-muted-foreground tabular-nums">{family.count}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
