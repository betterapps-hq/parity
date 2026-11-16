import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"
import { type SearchOption, SearchList } from "./field-parts.tsx"

/**
 * The list under a combobox that what's typed searches (`SearchList`), as Font's list, an expression's completions and a
 * CSS row's are: each option on a line, headed by its group where one starts, the highlighted one lit. The pointer
 * highlights on hover and picks on press; the input it's under moves the highlight with Up and Down.
 */
const meta = {
  title: "Parity/Fields/Parts/Search list",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const fonts: SearchOption[] = [
  { key: "font-sans", content: "font-sans", group: "Tokens" },
  { key: "font-mono", content: "font-mono", group: "Tokens" },
  { key: "Inter", content: "Inter", group: "Google Fonts" },
  { key: "Instrument Sans", content: "Instrument Sans", group: "Google Fonts" },
  { key: "IBM Plex Mono", content: "IBM Plex Mono", group: "Google Fonts" }
]

/** What a press picks, to check it. */
const picked = fn()

/** The list, its highlight kept here. */
function Fonts({ options }: { options: SearchOption[] }) {
  const [highlight, setHighlight] = useState(0)

  return (
    <div className="w-60 p-4">
      <SearchList
        id="fonts"
        label="Fonts"
        options={options}
        highlight={highlight}
        empty="No fonts match"
        className="relative"
        onHighlight={setHighlight}
        onPick={(index) => picked(options[index]?.key)}
      />
    </div>
  )
}

/** Two groups, each headed where it starts, the first option highlighted. */
export const Grouped: Story = { render: () => <Fonts options={fonts} /> }

/** Pressing an option picks it. */
export const Picking: Story = {
  render: () => <Fonts options={fonts} />,
  play: async ({ canvasElement }) => {
    picked.mockClear()
    await userEvent.click(within(canvasElement).getByRole("option", { name: "Inter" }))
    await expect(picked).toHaveBeenCalledWith("Inter")
  }
}

/** Nothing found: it says so. */
export const NothingFound: Story = { render: () => <Fonts options={[]} /> }
