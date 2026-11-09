import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { kindColors } from "../../canvas/kinds.tsx"
import { spacingColor } from "../../canvas/SpacingHandles.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { BoxModel, type Measured, type SpacingColors, SpacingPreview, type SpacingHover } from "./box-model.tsx"
import { ProjectTokens } from "./field-parts.tsx"
import { HighlightProvider } from "./highlight.tsx"
import { Playground } from "./playground.tsx"
import { type Sides, sidesWrites } from "./sides-writes.ts"
import { mergeWrites } from "./writes.ts"

/**
 * Spacing as one box (PAR-186, PAR-652's Spacing), an exploration: margin's ring around padding's around the layer's
 * size, as DevTools and Webflow lay them out, in place of Padding's and Margin's rows. Each side shows its measurement
 * and unit where the side is (`16px`, `10%`, `Auto`), a token's shaded as Webflow shades a variable's. Hovering one
 * opens its field in a popover after a moment, and pressing it or Enter opens it at once: the field every side has,
 * with the token's name and value, its unit and the app's maths, and the keys that reach both sides or all four.
 * Hovering a side highlights it in the preview. Padding is shaded as the canvas shades it, hatched pink, and margin,
 * which the canvas doesn't draw yet, in the same pink within a dashed edge, until Margin colors picks its own.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Box model",
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

/** The colors already on the canvas, which margin's mustn't be mistaken for. */
const taken = [
  { name: "Screens and layers", color: kindColors.layer },
  { name: "Components", color: kindColors.component },
  { name: "Modes", color: kindColors.mode },
  { name: "Agents", color: kindColors.agent },
  // TabOrderOverlay's trail.
  { name: "Tab order", color: "#f97316" },
  { name: "Padding and gaps", color: spacingColor }
]

/** The green DevTools shades padding in, softer and yellower than modes'. */
const devToolsGreen = "#93c47d"

/** Each pair of colors padding and margin could take, with where it comes from and what it would clash with. */
const pairs: { name: string; note: string; colors: SpacingColors }[] = [
  {
    name: "Green and pink",
    note: "DevTools' green for padding, and the pink padding has today for margin.",
    colors: { padding: devToolsGreen, margin: spacingColor }
  },
  {
    name: "Pink and green",
    note: "Padding keeps its pink, and margin takes DevTools' green.",
    colors: { padding: spacingColor, margin: devToolsGreen }
  },
  {
    name: "Pink and cyan",
    note: "Cyan isn't used on the canvas yet.",
    colors: { padding: spacingColor, margin: "oklch(0.72 0.13 215)" }
  },
  {
    name: "Green and purple",
    note: "The colors modes and components already have.",
    colors: { padding: kindColors.mode, margin: kindColors.component }
  }
]

/** One pair: the box in its colors, and the selected layer drawn in them, both working. */
function Pair({ name, note, colors }: (typeof pairs)[number]) {
  const [padding, setPadding] = useState<Sides>([px(16), px(24), px(16), px(24)])
  const [margin, setMargin] = useState<Sides>([px(12), px(12), px(12), px(12)])
  const [hover, setHover] = useState<SpacingHover>()
  const [measured, setMeasured] = useState<Measured>()
  return (
    <section aria-label={name} className="flex w-80 shrink-0 flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium">{name}</h2>
        {/* Two lines for each note, so the boxes line up across the row. */}
        <p className="min-h-8 text-xs text-muted-foreground">{note}</p>
      </div>
      <BoxModel
        padding={padding}
        margin={margin}
        measuredMargin={measured?.margin.map(Math.round)}
        size={measured?.content ?? { width: 0, height: 0 }}
        colors={colors}
        onPadding={(next) => setPadding(next)}
        onMargin={(next) => setMargin(next)}
        onHover={setHover}
      />
      <div className="grid place-items-center rounded-md border bg-muted/40 py-4">
        <SpacingPreview
          padding={padding}
          margin={margin}
          hover={hover}
          colors={colors}
          selected
          onMeasure={setMeasured}
        />
      </div>
    </section>
  )
}

/**
 * Margin in a color of its own, as the canvas will draw it once margin has handles: each pair that could tell it from
 * padding, the box and the selected layer drawn in it, both working, with the colors the canvas already uses above.
 */
export const MarginColors: Story = {
  render: () => (
    <TooltipProvider>
      <ProjectTokens>
        <HighlightProvider>
          <div className="flex h-screen flex-col gap-4 overflow-y-auto bg-background p-6 text-foreground">
            <section aria-label="On the canvas" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="font-medium">On the canvas</span>
              {taken.map(({ name, color }) => (
                <span key={name} className="flex items-center gap-1.5 text-muted-foreground">
                  <span aria-hidden className="size-3 rounded-sm" style={{ background: color }} />
                  {name}
                </span>
              ))}
            </section>
            <div className="flex flex-wrap items-start gap-4">
              {pairs.map((pair) => (
                <Pair key={pair.name} {...pair} />
              ))}
            </div>
          </div>
        </HighlightProvider>
      </ProjectTokens>
    </TooltipProvider>
  )
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
