import {
  elementFamilies,
  elementFamilyNames,
  type ElementType,
  elementType,
  elementTypeFamilies,
  elementTypeNames,
  elementTypeRoles,
  elementTypes,
  elementTypeTags
} from "@parity-app/editor"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { elementFamilyColors, elementFamilyTextColors, elementTypeIcons } from "../canvas/element-kinds.tsx"

/**
 * How each element a component or page draws shows as a layer (read-only viewer): the layer is the element, and its
 * type, from its tag or its role, gives it an icon; its type's family gives it a color. Type a tag and a role to see what
 * an element shows as.
 */
const meta = {
  title: "Parity/Layers/Element types",
  render: () => <ElementTypes />,
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

function ElementTypes() {
  const [tag, setTag] = useState("div")
  const [role, setRole] = useState("button")
  const tried = elementType(tag.trim() || "div", role.trim() ? { role: role.trim() } : {})

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <section aria-label="Try an element" className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <label htmlFor="try-tag">Tag</label>
          <input
            id="try-tag"
            value={tag}
            onChange={(event) => setTag(event.currentTarget.value)}
            className="h-8 w-40 rounded-md border bg-transparent px-2 font-mono text-sm text-foreground"
          />
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <label htmlFor="try-role">Role</label>
          <input
            id="try-role"
            value={role}
            onChange={(event) => setRole(event.currentTarget.value)}
            className="h-8 w-40 rounded-md border bg-transparent px-2 font-mono text-sm text-foreground"
          />
        </div>
        <LayerRow type={tried} name={tag.trim() || "div"} />
      </section>
      {elementFamilies.map((family) => (
        <section key={family} aria-labelledby={`family-${family}`} className="flex flex-col gap-2">
          <h2 id={`family-${family}`} className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className="size-3 rounded-full" style={{ background: elementFamilyColors[family] }} />
            {elementFamilyNames[family]}
          </h2>
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-40 py-1 font-normal">Type</th>
                <th className="py-1 font-normal">Tags</th>
                <th className="w-72 py-1 font-normal">Roles</th>
              </tr>
            </thead>
            <tbody>
              {elementTypes
                .filter((type) => elementTypeFamilies[type] === family)
                .map((type) => (
                  <tr key={type} aria-current={type === tried} className="border-t align-top aria-current:bg-accent">
                    <td className="py-2">
                      <TypeName type={type} />
                    </td>
                    <td className="py-2">
                      <Codes values={elementTypeTags[type]} />
                    </td>
                    <td className="py-2">
                      <Codes values={elementTypeRoles[type]} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}

/** A type's icon in its family's color, and its name in the family's text color. */
function TypeName({ type }: { type: ElementType }) {
  const Icon = elementTypeIcons[type]
  const family = elementTypeFamilies[type]

  return (
    <span className="flex items-center gap-2 font-medium" style={{ color: elementFamilyTextColors[family] }}>
      <Icon className="size-4 shrink-0" style={{ color: elementFamilyColors[family] }} aria-hidden />
      {elementTypeNames[type]}
    </span>
  )
}

/** An element as Layers would list it: its type's icon, its name, and its type. */
function LayerRow({ type, name }: { type: ElementType; name: string }) {
  const Icon = elementTypeIcons[type]
  const family = elementTypeFamilies[type]

  return (
    <div aria-label="Shows as" className="flex h-9 min-w-56 items-center gap-2 rounded-md bg-muted px-3 text-sm">
      <Icon className="size-3.5 shrink-0" style={{ color: elementFamilyColors[family] }} aria-hidden />
      <span className="font-mono">{name}</span>
      <span className="ml-auto text-xs" style={{ color: elementFamilyTextColors[family] }}>
        {elementTypeNames[type]}
      </span>
    </div>
  )
}

function Codes({ values }: { values: readonly string[] }) {
  if (values.length === 0) {
    return <span className="text-muted-foreground">None</span>
  }

  return (
    <span className="flex flex-wrap gap-1">
      {values.map((value) => (
        <code key={value} className="rounded bg-muted px-1.5 py-0.5 text-xs">
          {value}
        </code>
      ))}
    </span>
  )
}

/** Every family and its types, with a `div` whose role is `button` tried. */
export const ElementTypesStory: Story = {
  name: "Element types",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const shows = canvas.getByLabelText("Shows as")
    await expect(shows).toHaveTextContent("Input")

    // A role says what an element is; without one, its tag does.
    await userEvent.clear(canvas.getByLabelText("Role"))
    await expect(shows).toHaveTextContent("Layout")
    await userEvent.clear(canvas.getByLabelText("Tag"))
    await userEvent.type(canvas.getByLabelText("Tag"), "span")
    await expect(shows).toHaveTextContent("Text")
  }
}
