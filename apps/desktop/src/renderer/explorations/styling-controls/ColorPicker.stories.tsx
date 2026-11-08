import type { Meta, StoryObj } from "@storybook/react-vite"
import { ColorInput, TokenColorEditor } from "./color-picker.tsx"
import { usedColors } from "./data.ts"
import { Field } from "./field-row.tsx"
import { CardPreview, Playground, useDraft } from "./playground.tsx"
import { colorTokens } from "./tokens.ts"
import { colorWrites } from "./writes.ts"

/**
 * The color picker (PAR-186), open on its own: the saturation and brightness square, hue and opacity strips, the
 * eyedropper, the model menu (Hex, RGB, HSL, HSB, OKLCH) and its fields, the nearest token, and the colors the design
 * already uses. Custom edits the color as you go; Tokens lists the project's colors. Its fields refuse what they can't
 * read, with the reason under them.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Color picker",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Picker({
  value,
  alpha,
  tab,
  model
}: {
  value: string
  alpha?: number
  tab: "tokens" | "custom"
  model?: "hex" | "oklch"
}) {
  const [draft, set] = useDraft({ background: value, backgroundAlpha: alpha })
  return (
    <Playground
      writes={colorWrites("bg", draft.background, draft.backgroundAlpha)}
      preview={<CardPreview draft={draft} />}
    >
      <Field label="Fill">
        <ColorInput
          label="Fill"
          used={usedColors}
          value={draft.background}
          alpha={draft.backgroundAlpha}
          open
          tab={tab}
          model={model}
          onChange={(background, backgroundAlpha) => set({ background, backgroundAlpha })}
        />
      </Field>
    </Playground>
  )
}

/**
 * Custom, from the token chart-2: drag in the square and the fill becomes a value of its own, with the nearest token
 * under the fields. Type `zz` into Hex to see it refused.
 */
export const Custom: Story = { render: () => <Picker value="chart-2" tab="custom" /> }

/** Custom in OKLCH: a color picked here is written as `oklch()`. */
export const CustomInOklch: Story = {
  render: () => <Picker value="oklch(0.623 0.188 259.8)" tab="custom" model="oklch" />
}

/** Tokens: the project's colors with swatches; the deprecated brand-blue is marked. The opacity stays at 50%. */
export const Tokens: Story = { render: () => <Picker value="secondary" alpha={50} tab="tokens" /> }

/** The Tokens panel's picker, editing chart-2's own value: the same square, strips and fields, saved on Save. */
export const EditingAToken: Story = {
  render: () => (
    <div className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <TokenColorEditor token={colorTokens.find((token) => token.name === "chart-2")!} />
    </div>
  )
}
