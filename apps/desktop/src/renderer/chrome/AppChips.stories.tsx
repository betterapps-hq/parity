import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { Changed as MarkChanged } from "../inspector/controls/field-parts.tsx"
import { Field, FieldGrid } from "../inspector/controls/field-row.tsx"
import { AppChip, AppChips, type AppChipsGroup, AppChipsInput } from "./AppChips.tsx"
import { slowly } from "./inspector-stories.tsx"

/**
 * The app's chips (`AppChips`, `AppChip`, `AppChipsInput`), which every field of tags is built on: class names and a
 * slot's layer. What they show and add is each field's own story; these are what any chips box does.
 */
const meta = {
  title: "Parity/Fields/Parts/Chips",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** What the popup offers in these stories, in two groups. */
const groups: AppChipsGroup[] = [
  {
    label: "Colors",
    options: ["Red", "Green", "Blue"].map((label) => ({ value: label.toLowerCase(), label }))
  },
  {
    label: "Sizes",
    options: ["Small", "Medium", "Large"].map((label) => ({ value: label.toLowerCase(), label }))
  }
]

const labelOf = (value: string) =>
  groups.flatMap((group) => group.options).find((option) => option.value === value)?.label ?? value

/** A chips field in a row, keeping its own value, with the popup's options or without. */
function Chips({ start, withOptions = false }: { start: string[]; withOptions?: boolean }) {
  const [value, setValue] = useState(start)
  const [typed, setTyped] = useState("")

  return (
    <div className="w-80 p-4">
      <FieldGrid>
        <Field label="Tags">
          <AppChips
            value={value}
            onValueChange={setValue}
            inputValue={typed}
            onInputValueChange={setTyped}
            options={withOptions ? groups : undefined}
          >
            {value.map((each) => (
              <AppChip key={each} removeLabel={`Remove ${labelOf(each)}`}>
                <span className="truncate">{labelOf(each)}</span>
              </AppChip>
            ))}
            <AppChipsInput placeholder={value.length === 0 ? "Add tags" : undefined} />
          </AppChips>
        </Field>
      </FieldGrid>
    </div>
  )
}

/** Nothing in it: the box with its input's placeholder. */
export const Empty: Story = { render: () => <Chips start={[]} /> }

/** Enough chips to wrap onto more lines: the box grows to fit them. */
export const Wrapping: Story = {
  render: () => <Chips start={["red", "green", "blue", "small", "medium", "large", "a-chip-with-a-longer-name"]} />
}

/** A chip too long for the box truncates. */
export const LongChip: Story = {
  render: () => <Chips start={["everything-included-in-the-business-plan-listed-in-full"]} />
}

/** A chip's × removes it. */
export const Removing: Story = {
  render: () => <Chips start={["red", "small"]} />,
  play: async ({ canvasElement }) => {
    const box = within(canvasElement)
    await userEvent.click(box.getByRole("button", { name: "Remove Red" }))
    await expect(box.queryByText("Red")).toBeNull()
    await expect(box.getByText("Small")).toBeVisible()
  }
}

/** Backspace in the empty input removes the last chip. */
export const BackspaceRemovesTheLast: Story = {
  render: () => <Chips start={["red", "small"]} />,
  play: async ({ canvasElement }) => {
    const box = within(canvasElement)
    await userEvent.click(box.getByRole("combobox"))
    await userEvent.keyboard("{Backspace}")
    await expect(box.queryByText("Small")).toBeNull()
    await expect(box.getByText("Red")).toBeVisible()
  }
}

/** Typing searches the popup's options, in their groups; Enter picks the first match, which becomes a chip. */
export const Searching: Story = {
  render: () => <Chips start={[]} withOptions />,
  play: async ({ canvasElement }) => {
    const box = within(canvasElement)
    await userEvent.type(box.getByRole("combobox"), "me")
    const list = within(await within(document.body).findByRole("listbox", undefined, slowly))
    await expect(list.getByRole("option", { name: "Medium" })).toBeVisible()
    await expect(list.queryByRole("option", { name: "Red" })).toBeNull()
    await userEvent.click(list.getByRole("option", { name: "Medium" }))
    await expect(box.getByText("Medium")).toBeVisible()
  }
}

/** Typing what no option matches: the popup says so. */
export const NothingMatches: Story = {
  render: () => <Chips start={[]} withOptions />,
  play: async ({ canvasElement }) => {
    await userEvent.type(within(canvasElement).getByRole("combobox"), "purple")
    await expect(await within(document.body).findByText("No matches", undefined, slowly)).toBeVisible()
  }
}

/** Changed in the state being edited (PAR-1020): the change mark on the box's corner. */
export const Changed: Story = {
  render: () => (
    <MarkChanged>
      <Chips start={["red", "small"]} />
    </MarkChanged>
  )
}
