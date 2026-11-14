import { describeElement } from "@parity-app/layer-types"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { elementFamilyColors, elementFamilyTextColors, LayerIcon } from "../canvas/element-kinds.tsx"

/**
 * Tries an element: type a tag and a role, and see the layer it shows as, as Layers would list it, from
 * `describeElement` in `@parity-app/layer-types` (read-only viewer). Layers/Element types has the whole mapping.
 */
const meta = {
  title: "Parity/Layers/Demo",
  render: () => <TryAnElement />,
  decorators: [
    (Story) => (
      <div className="h-screen overflow-auto bg-background p-6 text-foreground">
        <Story />
      </div>
    )
  ]
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function TryAnElement() {
  const [tag, setTag] = useState("div")
  const [role, setRole] = useState("button")
  const element = tag.trim() || "div"
  const attributes: Record<string, string> = {}

  if (role.trim()) {
    attributes.role = role.trim()
  }

  const layer = describeElement({ tag: element, attributes })

  return (
    <section aria-label="Try an element" className="flex max-w-xl flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap gap-3">
        <Field id="try-tag" label="Tag" value={tag} onChange={setTag} />
        <Field id="try-role" label="Role" value={role} onChange={setRole} />
      </div>
      <div aria-label="Shows as" className="flex h-9 items-center gap-2 rounded-md bg-muted px-3 text-sm">
        <LayerIcon
          name={layer.icon}
          className="size-3.5 shrink-0"
          style={{ color: elementFamilyColors[layer.family] }}
          aria-hidden
        />
        <span className="font-mono">{element}</span>
        <span className="ml-auto text-xs" style={{ color: elementFamilyTextColors[layer.family] }}>
          {layer.name}
        </span>
      </div>
      <p aria-label="Panel shows" className="text-xs text-muted-foreground">
        {layer.name} · {layer.detail}: {layer.sections.join(", ")}
      </p>
    </section>
  )
}

function Field({
  id,
  label,
  value,
  onChange
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="h-8 w-40 rounded-md border bg-transparent px-2 font-mono text-sm text-foreground"
      />
    </div>
  )
}

/** A `div` whose role is `button` is a Button; without the role it's a Layout, and a `span` is Text. */
export const Demo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const shows = canvas.getByLabelText("Shows as")
    await expect(shows).toHaveTextContent("Button")
    await expect(canvas.getByLabelText("Panel shows")).toHaveTextContent("Button · button")

    // A role says what an element is; without one, its tag does.
    await userEvent.clear(canvas.getByLabelText("Role"))
    await expect(shows).toHaveTextContent("Layout")
    await userEvent.clear(canvas.getByLabelText("Tag"))
    await userEvent.type(canvas.getByLabelText("Tag"), "span")
    await expect(shows).toHaveTextContent("Text")
  }
}
