import { ToggleGroup, ToggleGroupItem } from "@buildkitgg/shadcn"
import { AppSelect } from "../AppSelect.tsx"

export function ThemePicker({
  themes,
  theme,
  onTheme
}: {
  themes: { value: string; label: string }[]
  theme: string
  onTheme: (theme: string) => void
}) {
  if (themes.length > 2) {
    return (
      <AppSelect
        variant="panel"
        aria-label="Theme"
        items={themes}
        value={theme}
        onValueChange={(next) => {
          if (next) {
            onTheme(next)
          }
        }}
      />
    )
  }

  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      aria-label="Theme"
      value={[theme]}
      onValueChange={(next: string[]) => {
        if (next[0]) {
          onTheme(next[0])
        }
      }}
      className="bg-background"
    >
      {themes.map((each) => (
        <ToggleGroupItem key={each.value} value={each.value} className="text-xs">
          {each.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
