import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { BoxModel, type Measured, SpacingPreview, type SpacingHover, ValueFill } from "./box-model.tsx"
import { Playground } from "./playground.tsx"
import { type Sides, sidesWrites } from "./sides-writes.ts"
import { mergeWrites } from "./writes.ts"

/**
 * Spacing as one box (PAR-186, PAR-652's Spacing): margin's ring around padding's around the layer's size, as DevTools
 * and Webflow lay them out. Spacing's Fields are the other way, kept for where rows suit better. Each side shows its
 * measurement and unit where the side is (`16px`, `10%`, `Auto`), a token's shaded as Webflow shades a variable's.
 * Hovering one opens its field in a popover after a moment, and pressing it or Enter opens it at once: the field every
 * side has, with the token's name and value, its unit and the app's maths, and the keys that reach both sides or all
 * four. Hovering a side highlights it in the preview. Padding is hatched in modes' green and margin is flat pink, the
 * pink the canvas draws padding in today, within a dashed edge.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Controls/Box model",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const px = (number: number) => ({ number })
const none: Sides = [undefined, undefined, undefined, undefined]

function Spacing({ padding: startPadding, margin: startMargin = none }: { padding: Sides; margin?: Sides }) {
  const [padding, setPadding] = useState(startPadding)
  const [margin, setMargin] = useState(startMargin)
  const [hover, setHover] = useState<SpacingHover>()
  const [measured, setMeasured] = useState<Measured>()

  return (
    <Playground
      writes={mergeWrites({ padding: sidesWrites("padding", padding), margin: sidesWrites("margin", margin) })}
      preview={<SpacingPreview padding={padding} margin={margin} hover={hover} onMeasure={setMeasured} />}
    >
      <PanelSection title="Spacing">
        <BoxModel
          padding={padding}
          margin={margin}
          measuredMargin={measured?.margin.map(Math.round)}
          size={measured?.content ?? { width: 0, height: 0 }}
          onPadding={(next) => setPadding(next)}
          onMargin={(next) => setMargin(next)}
          onHover={setHover}
        />
      </PanelSection>
    </Playground>
  )
}

/** How strong the fill each value rests on could be, to compare: 60% as now, 40% and 25%. Hover one to see it lighten. */
export const FillStrengths: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6 bg-background p-6 text-foreground">
      {(
        [
          ["bg-background/60", "60%"],
          ["bg-background/40", "40%"],
          ["bg-background/25", "25%"]
        ] as const
      ).map(([fill, name]) => (
        <div key={fill} className="flex w-80 flex-col gap-2">
          <p className="text-sm font-medium">{name}</p>
          <ValueFill value={fill}>
            <StrengthBox />
          </ValueFill>
        </div>
      ))}
    </div>
  )
}

function StrengthBox() {
  const [padding, setPadding] = useState<Sides>([px(16), px(24), px(16), px(24)])
  const [margin, setMargin] = useState<Sides>([px(8), undefined, px(8), undefined])

  return (
    <div className="rounded-lg border">
      <PanelSection title="Spacing">
        <BoxModel
          padding={padding}
          margin={margin}
          size={{ width: 232, height: 78 }}
          onPadding={(next) => setPadding(next)}
          onMargin={(next) => setMargin(next)}
        />
      </PanelSection>
    </div>
  )
}

/** Padding alone: margin's sides are unset, 0 and faint. */
export const PaddingOnly: Story = { render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} /> }

/** A margin of 8 above and below, around the padding. */
export const WithMargin: Story = {
  render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} margin={[px(8), undefined, px(8), undefined]} />
}

/** Auto across: margin's sides say Auto, and their names say what they come to. */
export const AutoMargin: Story = {
  render: () => <Spacing padding={[px(12), px(12), px(12), px(12)]} margin={[undefined, "auto", undefined, "auto"]} />
}

/** A token on the sides: its value, 24px, shaded as a token is; its popover names it, `spacing-gutter`. */
export const Token: Story = {
  render: () => <Spacing padding={[px(16), { token: "spacing-gutter" }, px(16), { token: "spacing-gutter" }]} />
}

/** The top padding pressed: its field opens in a popover, with its unit and tokens, and the side lights up. */
export const EditingASide: Story = {
  render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} margin={[px(8), undefined, px(8), undefined]} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Top padding/ }))
  }
}

/** `-8` typed into the top padding: padding can't be negative, so it's refused, with the reason under its field. */
export const InvalidAsTyped: Story = {
  render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Top padding/ }))
    const field = within(document.body).getByRole("textbox", { name: "Top padding" })
    await userEvent.clear(field)
    await userEvent.type(field, "-8{Enter}")
  }
}
