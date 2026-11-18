import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { AppSelect } from "../../chrome/AppSelect.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { BoxModel, type Measured, SpacingPreview, type SpacingHover, ValueFill } from "./box-model.tsx"
import { Field } from "./field-row.tsx"
import { Playground } from "./playground.tsx"
import { type Sides, sidesWrites } from "./sides-writes.ts"
import { mergeWrites } from "./writes.ts"

/**
 * Spacing as one box (PAR-186, PAR-652's Spacing): margin's ring around padding's around the layer's size, as DevTools
 * and Webflow lay them out. Spacing's Fields are the other way, kept for where rows suit better. Each side shows its
 * measurement and unit where the side is (`16px`, `10%`, `Auto`), on a faint fill that lightens on hover, a token's
 * shaded as Webflow shades a variable's.
 * Hovering one opens its field in a popover after a moment, and pressing it or Enter opens it at once: the field every
 * side has, with the token's name and value, its unit and the app's maths, and the keys that reach both sides or all
 * four. Hovering a side highlights it in the preview. Padding is hatched in modes' green and margin is flat pink, the
 * pink the canvas draws padding in today, within a dashed edge.
 */
const meta = {
  title: "Parity/Inspector/Rows/Box model",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Box sizing's two keywords; unset is Border box, as Tailwind sets it on everything. */
const boxSizings: { value: "border-box" | "content-box"; label: string }[] = [
  { value: "border-box", label: "Border box" },
  { value: "content-box", label: "Content box" }
]

const px = (number: number) => ({ number })
const none: Sides = [undefined, undefined, undefined, undefined]

function Spacing({
  padding: startPadding,
  margin: startMargin = none,
  border: startBorder,
  sizing = false
}: {
  padding: Sides
  margin?: Sides
  /** A border's widths, which put its ring between margin and padding. */
  border?: Sides
  /** Shows Box sizing under the box, with Plans 200px wide in the preview so its effect shows. */
  sizing?: boolean
}) {
  const [padding, setPadding] = useState(startPadding)
  const [margin, setMargin] = useState(startMargin)
  const [border, setBorder] = useState(startBorder)
  const [boxSizing, setBoxSizing] = useState<"border-box" | "content-box">()
  const [hover, setHover] = useState<SpacingHover>()
  const [measured, setMeasured] = useState<Measured>()

  return (
    <Playground
      writes={mergeWrites({
        padding: sidesWrites("padding", padding),
        margin: sidesWrites("margin", margin),
        ...(border && { border: sidesWrites("border", border) }),
        ...(boxSizing && { boxSizing: { stored: { keyword: boxSizing }, css: [`box-sizing: ${boxSizing}`] } })
      })}
      preview={
        <SpacingPreview
          padding={padding}
          margin={margin}
          border={border}
          hover={hover}
          width={sizing ? 200 : undefined}
          boxSizing={boxSizing}
          onMeasure={setMeasured}
        />
      }
    >
      <PanelSection title="Spacing">
        <div className="flex flex-col gap-2.5">
          <BoxModel
            padding={padding}
            margin={margin}
            border={border}
            px={border === undefined}
            measuredMargin={measured?.margin.map(Math.round)}
            size={measured?.content ?? { width: 0, height: 0 }}
            onPadding={(next) => setPadding(next)}
            onMargin={(next) => setMargin(next)}
            onBorder={(next) => setBorder(next)}
            onHover={setHover}
          />
          {sizing && (
            <Field label="Box sizing">
              <AppSelect
                variant="panel"
                className="w-full"
                aria-label="Box sizing"
                value={boxSizing ?? "border-box"}
                items={boxSizings}
                onValueChange={(next) => {
                  if (next) {
                    setBoxSizing(next)
                  }
                }}
              />
            </Field>
          )}
        </div>
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

/** FillStrengths, with what the control stores and writes as CSS beside it, updated as it's used. */
export const Demo: Story = { ...FillStrengths, parameters: { demo: true } }

/** Padding alone: margin's sides are unset, 0 and faint. */
export const PaddingOnly: Story = { render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} /> }

/** A margin of 8 above and below, around the padding. */
export const WithMargin: Story = {
  render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} margin={[px(8), undefined, px(8), undefined]} />
}

/** Auto across: margin's sides say Auto, and their popovers say what it comes to. */
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

/**
 * With a border, as DevTools draws one: its ring, a plain edge, between margin and padding, so the box shows everything
 * that adds to the layer's size. Each side's width opens its field, with the border-width tokens, as padding's do.
 */
export const WithBorder: Story = {
  render: () => (
    <Spacing
      padding={[px(16), px(24), px(16), px(24)]}
      margin={[px(8), undefined, px(8), undefined]}
      border={[px(1), px(1), px(1), px(1)]}
      sizing
    />
  )
}

/** WithBorder, with what the control stores and writes as CSS beside it, and the preview's card growing with it. */
export const WithBorderDemo: Story = { ...WithBorder, name: "With border demo", parameters: { demo: true } }

/** A divider: a border along the bottom alone, 2px, the other sides unset and faint. */
export const BorderBelow: Story = {
  render: () => <Spacing padding={[px(12), px(16), px(12), px(16)]} border={[undefined, undefined, px(2), undefined]} />
}
