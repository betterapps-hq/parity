import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { LayerPreview, SizeSection } from "./controls.tsx"
import type { Draft } from "./data.ts"
import type { TokensShown } from "./field-parts.tsx"
import { Playground, useDraft } from "./playground.tsx"
import { sizeRowWrites } from "./writes.ts"

/**
 * Size and aspect ratio (PAR-186, PAR-652's Size type), on its own. W and H take a length (typed with the app's maths
 * and units, `spacing-4` included), a percentage of the parent, or a word: Hug, Fill, Min content or Max content, each
 * a chip with what it comes to faintly. The chevron at each field's end opens Sizing, which lists the words after
 * Fixed, then Add min and Add max; the unit, after a number, is only ever a unit. Grid placement's W and H are this
 * field too. Dragging a label scrubs; Up and Down step a whole spacing step. The lock keeps the ratio the layer has,
 * freeing H (Auto, set by Aspect ratio), with the ratio in its own row.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Controls/Size and aspect ratio",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Size({ start }: { start: Draft }) {
  const [draft, set] = useDraft({ background: "card", radius: "radius-xl", gap: { number: 12 }, ...start })

  return (
    <Playground writes={sizeRowWrites(draft)} preview={<LayerPreview draft={draft} />}>
      <SizeSection draft={draft} set={set} />
    </Playground>
  )
}

/** Fixed at 520 by 520 pixels, written as spacing steps (`w-130`). Up on W makes it 524. */
export const Fixed: Story = { render: () => <Size start={{ width: 520, height: 520 }} /> }

/** W at the project's container-md token, 448 pixels, as its pill; Sizing lists the tokens under the words. */
export const Token: Story = { render: () => <Size start={{ width: { token: "container-md" }, height: 320 }} /> }

/**
 * Three ways Sizing could hold the tokens, to compare: all listed under the words, as now; folded under a Tokens row
 * that opens them, with the nearest still shown; and listed with a search above them, as Font's list searches.
 */
export const SizingMenuOptions: Story = {
  render: () => (
    <div className="flex flex-wrap items-start gap-6 bg-background p-6 text-foreground">
      {(
        [
          ["listed", "Listed"],
          ["folded", "Folded"],
          ["searched", "Searched"]
        ] as const
      ).map(([shown, name]) => (
        <SizingOption key={shown} name={name} shown={shown} />
      ))}
    </div>
  )
}

function SizingOption({ name, shown }: { name: string; shown: TokensShown }) {
  const [draft, set] = useDraft({ width: 520, height: 320 })

  return (
    <div className="flex w-72 flex-col gap-2">
      <p className="text-sm font-medium">{name}</p>
      <div className="rounded-lg border">
        <SizeSection draft={draft} set={set} tokensShown={shown} />
      </div>
    </div>
  )
}

/** W hugs its content: a Hug chip, with what that comes to after it. */
export const Hug: Story = { render: () => <Size start={{ width: "hug" }} /> }

/** W fills its parent, `w-full`. */
export const Fill: Story = { render: () => <Size start={{ width: "fill" }} /> }

/** Half the parent, typed `50%`, written as Tailwind's fraction (`w-1/2`, call 10). */
export const Percent: Story = { render: () => <Size start={{ width: { percent: 50 } }} /> }

/** Min content, from Sizing: as narrow as its longest word. */
export const MinContent: Story = { render: () => <Size start={{ width: "min" }} /> }

/** Locked at 16:9: H is Auto, set by Aspect ratio, as its hint and Sizing say, and the ratio is its own row. */
export const AspectLocked: Story = { render: () => <Size start={{ width: 480, aspect: "16 / 9" }} /> }

/** Fill, kept between 320 and 640 pixels by a min and a max, each its own row with − to take it off. */
export const MinAndMax: Story = { render: () => <Size start={{ width: "fill", minWidth: 320, maxWidth: 640 }} /> }

/** `wide` typed into W and Enter pressed: it isn't a size, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Size start={{ width: 520 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Width" })
    await userEvent.clear(field)
    await userEvent.type(field, "wide{Enter}")
  }
}
