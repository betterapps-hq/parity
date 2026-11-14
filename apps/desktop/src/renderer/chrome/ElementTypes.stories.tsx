import {
  elementFamilies,
  elementFamilyNames,
  type ElementType,
  elementTypeFamilies,
  elementTypeIcons,
  elementTypeInputTypes,
  elementTypeNames,
  elementTypeRoles,
  elementTypes,
  elementTypeSections,
  elementTypeTags
} from "@parity-app/layer-types"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { elementFamilyColors, elementFamilyTextColors, LayerIcon } from "../canvas/element-kinds.tsx"

/**
 * How each element a component or page draws shows as a layer (read-only viewer), drawn from `@parity-app/layer-types`
 * alone, so a change to the mapping changes this picture: each family with its color, and each type in it with its
 * icon, the tags, `<input>` types and roles that make an element that type, and the sections its panel shows. Layers/Demo tries one.
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
  return (
    <div className="flex max-w-6xl flex-col gap-8">
      {elementFamilies.map((family) => (
        <section key={family} aria-labelledby={`family-${family}`} className="flex flex-col gap-2">
          <h2 id={`family-${family}`} className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden className="size-3 rounded-full" style={{ background: elementFamilyColors[family] }} />
            {elementFamilyNames[family]}
          </h2>
          <table className="w-full table-fixed border-collapse text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-36 py-1 font-normal">Type</th>
                <th className="py-1 font-normal">Tags</th>
                <th className="w-64 py-1 font-normal">Roles</th>
                <th className="w-64 py-1 font-normal">Sections</th>
              </tr>
            </thead>
            <tbody>
              {elementTypes
                .filter((type) => elementTypeFamilies[type] === family)
                .map((type) => (
                  <tr key={type} className="border-t align-top">
                    <td className="py-2">
                      <TypeName type={type} />
                    </td>
                    <td className="py-2">
                      <Codes
                        values={[
                          ...elementTypeTags[type],
                          ...elementTypeInputTypes[type].map((input) => `input[type=${input}]`)
                        ]}
                      />
                    </td>
                    <td className="py-2">
                      <Codes values={elementTypeRoles[type]} />
                    </td>
                    <td className="py-2">
                      <Codes values={elementTypeSections[type]} />
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
  const family = elementTypeFamilies[type]

  return (
    <span className="flex items-center gap-2 font-medium" style={{ color: elementFamilyTextColors[family] }}>
      <LayerIcon
        name={elementTypeIcons[type]}
        className="size-4 shrink-0"
        style={{ color: elementFamilyColors[family] }}
        aria-hidden
      />
      {elementTypeNames[type]}
    </span>
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

/** Every family, and each of its types with its tags, roles and sections. */
export const ElementTypesStory: Story = { name: "Element types" }
