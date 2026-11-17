import type { ShownPreview } from "./offeredLibraries.ts"

/** What the file holds, counted: components, tokens, themes and breakpoints. */
export function Figures({ preview }: { preview: ShownPreview }) {
  const figures = [
    { count: preview.components, label: "components" },
    { count: preview.tokens.length, label: "tokens" },
    { count: preview.themes.length, label: preview.themes.length === 1 ? "theme" : "themes" },
    { count: preview.breakpoints.length, label: "breakpoints" }
  ].filter((figure) => figure.count > 0)

  return (
    <ul className="mx-6 mt-4 grid grid-cols-2 gap-3 @xl/detail:grid-cols-4">
      {figures.map((figure) => (
        <li key={figure.label} className="flex flex-col rounded-lg border px-4 py-3">
          <span className="text-2xl font-semibold tabular-nums">{figure.count}</span>
          <span className="text-xs text-muted-foreground">{figure.label}</span>
        </li>
      ))}
    </ul>
  )
}
