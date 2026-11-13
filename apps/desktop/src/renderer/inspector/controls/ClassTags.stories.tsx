import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { ClassTagsField } from "./class-tags.tsx"
import { Field, FieldGrid } from "./field-row.tsx"
import { Playground } from "./playground.tsx"

/**
 * Class names as tags, as a component's or an instance's `className` prop is drawn (PAR-1021): each class a tag in
 * code with an × that always shows, its variants faint before the utility. Type after the tags and press Space, Enter
 * or Tab to add one; paste several at once; Backspace in the empty input takes the last back to edit.
 */
const meta = {
  title: "Parity/Inspector/Fields/Class names",
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

/** Classes, with what the control stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...Classes, parameters: { demo: true } }

/** None yet: the empty box says Add classes. */
export const Empty: Story = { render: () => <ClassNames start={[]} /> }
