import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { Field } from "../inspector/controls/field-row.tsx"
import { AppSelect } from "./AppSelect.tsx"
import { PanelColumn, slowly } from "./inspector-stories.tsx"

const overflows = [
  { value: "hidden", label: "Hidden" },
  { value: "auto", label: "Scroll" }
]

const editors = [
  { value: "auto", label: "Automatic" },
  { value: "code", label: "VS Code" },
  { value: "cursor", label: "Cursor" },
  { value: "zed", label: "Zed" }
]

/** A panel's select in its row, at the field's 12px, with an item that leaves the value unset. */
function PanelSelect() {
  const [overflow, setOverflow] = useState<string | null>(null)

  return (
    <PanelColumn>
      <div className="p-3">
        <Field label="Overflow">
          <AppSelect
            variant="panel"
            className="w-full"
            none="Visible"
            items={overflows}
            value={overflow}
            onValueChange={setOverflow}
          />
        </Field>
      </div>
    </PanelColumn>
  )
}

/** A dialog's select, at the kit's 13px. */
function DialogSelect() {
  const [editor, setEditor] = useState<string | null>("auto")

  return (
    <div className="p-6">
      <AppSelect
        variant="dialog"
        size="sm"
        aria-label="Editor"
        className="w-36"
        items={editors}
        value={editor}
        onValueChange={setEditor}
      />
    </div>
  )
}

/** The app's select, open: its items sit in a group that insets them 4px from the popup's edge. */
const meta = {
  title: "Parity/Chrome/Select",
  component: AppSelect
} satisfies Meta<typeof AppSelect>

export default meta

type Story = StoryObj<typeof meta>

/** Opens the select named `name` and checks its items are inset 4px and read at `size`. */
async function opensInset(canvasElement: HTMLElement, name: string, size: string) {
  await userEvent.click(within(canvasElement).getByRole("combobox", { name }))
  const listbox = await within(document.body).findByRole("listbox", undefined, slowly)
  const group = within(listbox).getByRole("group")
  await expect(getComputedStyle(group).padding).toBe("4px")
  await expect(getComputedStyle(within(group).getAllByRole("option")[0]!).fontSize).toBe(size)
}

/** In a panel, named by its row's label: the unset item reads Visible, and the items are 12px. */
export const InAPanel: Story = {
  args: { variant: "panel", items: overflows },
  render: () => <PanelSelect />,
  play: async ({ canvasElement }) => opensInset(canvasElement, "Overflow", "12px")
}

/** In a dialog, named by its own label: the kit's 13px. */
export const InADialog: Story = {
  args: { variant: "dialog", items: editors },
  render: () => <DialogSelect />,
  play: async ({ canvasElement }) => opensInset(canvasElement, "Editor", "13px")
}
