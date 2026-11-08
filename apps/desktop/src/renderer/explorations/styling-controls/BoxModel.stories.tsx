import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Ellipsis } from "lucide-react"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { BoxModel, type Measured, SpacingPreview, type SpacingHover } from "./box-model.tsx"
import { Playground } from "./playground.tsx"
import { type Sides, sideRules, sidesWrites } from "./sides-writes.ts"
import { FourSidesField } from "./sides.tsx"
import { mergeWrites } from "./writes.ts"

/**
 * The box-model widget (PAR-186, PAR-652's Spacing), opened from Custom in Padding's sides menu: padding's ring
 * around the layer's size, and margin's ring around that once a margin is set or Margin is added from Spacing's More.
 * Each side is a field where the side is, typed, stepped and scrubbed as any side (Alt reaches the opposite side,
 * Alt+Shift all four), and hovering it highlights the side in the preview, as DevTools' box model does. Margin's row
 * shows under Padding's too, the same value in two places.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Box model",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const px = (number: number) => ({ number })
const none: Sides = [undefined, undefined, undefined, undefined]

function Spacing({
  padding: startPadding,
  margin: startMargin = none,
  marginAdded = false
}: {
  padding: Sides
  margin?: Sides
  marginAdded?: boolean
}) {
  const [padding, setPadding] = useState(startPadding)
  const [margin, setMargin] = useState(startMargin)
  const [added, setAdded] = useState(marginAdded)
  const [hover, setHover] = useState<SpacingHover>()
  const [measured, setMeasured] = useState<Measured>()
  const showMargin = added || margin.some((side) => side !== undefined)
  const widget = (
    <BoxModel
      padding={padding}
      margin={margin}
      showMargin={showMargin}
      measuredMargin={measured?.margin.map(Math.round)}
      size={measured?.content ?? { width: 0, height: 0 }}
      onPadding={(next) => setPadding(next)}
      onMargin={(next) => setMargin(next)}
      onHover={setHover}
    />
  )
  return (
    <Playground
      writes={mergeWrites({ padding: sidesWrites("padding", padding), margin: sidesWrites("margin", margin) })}
      preview={<SpacingPreview padding={padding} margin={margin} hover={hover} onMeasure={setMeasured} />}
    >
      <PanelSection
        title="Spacing"
        action={
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More spacing options"
              className="grid size-6 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
            >
              <Ellipsis className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuCheckboxItem
                className="text-xs"
                checked={showMargin}
                disabled={margin.some((side) => side !== undefined)}
                onCheckedChange={setAdded}
              >
                Margin
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <div className="flex flex-col gap-1">
          <FourSidesField
            label="Padding"
            rules={sideRules.padding}
            sides={padding}
            atLeastTwo
            startForm="four"
            customView={widget}
            onChange={(next) => setPadding(next)}
            onHover={(sides) => setHover(sides && { box: "padding", sides })}
          />
          {showMargin && (
            <FourSidesField
              label="Margin"
              rules={sideRules.margin}
              sides={margin}
              measured={measured?.margin.map(Math.round)}
              onChange={(next) => setMargin(next)}
              onHover={(sides) => setHover(sides && { box: "margin", sides })}
            />
          )}
        </div>
      </PanelSection>
    </Playground>
  )
}

/** Padding alone: its ring around Plans' size. Margin's ring shows once Margin is added from Spacing's More. */
export const PaddingOnly: Story = { render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} /> }

/** A margin of 8 above and below: margin's ring around padding's, and Margin's row under Padding's. */
export const WithMargin: Story = {
  render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} margin={[px(8), undefined, px(8), undefined]} />
}

/** Auto across: margin's sides say Auto, with what they come to in their hint. */
export const AutoMargin: Story = {
  render: () => <Spacing padding={[px(12), px(12), px(12), px(12)]} margin={[undefined, "auto", undefined, "auto"]} />
}

/** Margin added from More, still unset: its ring shows with 0 on every side. */
export const MarginAdded: Story = { render: () => <Spacing padding={[px(16), px(16), px(16), px(16)]} marginAdded /> }

/** `-8` typed into the top padding: padding can't be negative, so it's refused, with the reason under the widget. */
export const InvalidAsTyped: Story = {
  render: () => <Spacing padding={[px(16), px(24), px(16), px(24)]} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Top padding" })
    await userEvent.clear(field)
    await userEvent.type(field, "-8{Enter}")
  }
}

/** The widget's numbers in the same rules as every side: a token's chip in place of a number. */
export const Token: Story = {
  render: () => <Spacing padding={[px(16), { token: "spacing-gutter" }, px(16), { token: "spacing-gutter" }]} />
}
