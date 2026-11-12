import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { ClassTagsField } from "./class-tags.tsx"
import { Changed as MarkChanged } from "./field-parts.tsx"
import { Field, FieldGrid } from "./field-row.tsx"
import { Playground } from "./playground.tsx"

/**
 * Class names as tags, as a component's or an instance's `className` prop is drawn (PAR-1021): each class a tag in
 * code with an × that always shows, its variants faint before the utility. Type after the tags and press Space, Enter
 * or Tab to add one; paste several at once; Backspace in the empty input takes the last back to edit.
 */
const meta = {
  title: "Parity/Inspector/Controls/Fields/Class names",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function ClassNames({ start }: { start: string[] }) {
  const [classes, setClasses] = useState(start)
  const written = classes.join(" ")

  return (
    <Playground
      writes={{
        stored: written === "" ? undefined : written,
        css: [],
        tailwind: classes,
        markup: written === "" ? "<Button />" : `<Button className="${written}" />`
      }}
    >
      <FieldGrid>
        <Field label="ClassName">
          <ClassTagsField label="ClassName" classes={classes} onChange={setClasses} />
        </Field>
      </FieldGrid>
    </Playground>
  )
}

/** Button's two classes: `w-full`, and `sm:w-auto` with its variant faint. */
export const Classes: Story = { render: () => <ClassNames start={["w-full", "sm:w-auto"]} /> }

/** Enough classes to wrap onto a second line. */
export const Wrapping: Story = {
  render: () => (
    <ClassNames start={["inline-flex", "items-center", "gap-2", "rounded-md", "px-4", "py-2", "hover:bg-primary/90"]} />
  )
}

/** None yet: the empty box says Add classes. */
export const Empty: Story = { render: () => <ClassNames start={[]} /> }

/** Changed in the state being edited (PAR-1020): the change mark on the box's corner. */
export const Changed: Story = {
  render: () => (
    <MarkChanged>
      <ClassNames start={["w-full", "sm:w-auto"]} />
    </MarkChanged>
  )
}
