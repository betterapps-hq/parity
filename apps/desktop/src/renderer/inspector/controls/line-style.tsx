import { AppSelect } from "../../chrome/AppSelect.tsx"

/** A line's style, as CSS names it for a border and an outline alike. */
export type LineStyle = "solid" | "dashed" | "dotted" | "double"

const lineStyles: { value: LineStyle; name: string }[] = [
  { value: "solid", name: "Solid" },
  { value: "dashed", name: "Dashed" },
  { value: "dotted", name: "Dotted" },
  { value: "double", name: "Double" }
]

/** A short line drawn in the style, before its name, so the menu shows each one. */
function Sample({ style }: { style: LineStyle }) {
  return (
    <span
      aria-hidden
      className="inline-block w-6 shrink-0 border-current"
      style={{ borderTopStyle: style, borderTopWidth: style === "double" ? 3 : 2 }}
    />
  )
}

/**
 * Style, Border's and Outline's: Solid, Dashed, Dotted or Double, each drawn beside its name. Unset is Solid, as a new
 * border or outline is.
 */
export function LineStyleField({
  label,
  value,
  onChange
}: {
  /** Its accessible name: Border style, Outline style. */
  label: string
  value: LineStyle | undefined
  onChange: (style: LineStyle) => void
}) {
  return (
    <AppSelect
      variant="panel"
      className="w-full"
      aria-label={label}
      value={value ?? "solid"}
      items={lineStyles.map(({ value: style, name }) => ({
        value: style,
        label: (
          <span className="flex items-center gap-2">
            <Sample style={style} />
            {name}
          </span>
        )
      }))}
      onValueChange={(next) => {
        if (next) {
          onChange(next)
        }
      }}
    />
  )
}
