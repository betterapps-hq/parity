import type { ThemeVariable } from "@parity-app/extension"

/** The steps of the spacing scale, as Tailwind's utilities use them: `p-4` is four steps of `--spacing`. */
export const spacingScale = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64,
  72, 80, 96
]

/**
 * The theme's variables with the steps of its spacing scale after them, as `spacing-4` for `p-4`, each derived from
 * `--spacing`: the scale itself is one variable, and its steps are what designs use. One the theme defines itself is
 * left as it is.
 */
export function withSpacingSteps(theme: readonly ThemeVariable[]): ThemeVariable[] {
  const names = new Set(theme.map(({ name }) => name))

  if (!names.has("spacing")) {
    return [...theme]
  }

  const steps = spacingScale.flatMap((step): ThemeVariable[] => {
    const name = `spacing-${step}`

    if (names.has(name)) {
      return []
    }

    return [
      { name, value: step === 0 ? "0" : `calc(var(--spacing) * ${step})`, derived: { from: "spacing", factor: step } }
    ]
  })

  return [...theme, ...steps]
}
