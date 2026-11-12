import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { type InstanceProp, InstanceSection } from "./instance-section.tsx"
import { Playground } from "./playground.tsx"

/**
 * Component instance: its props, drawn as the style sections draw their rows, with the component's name in the title
 * row and Swap, Reset overrides, Push to main and Detach in the menu beside it.
 */
const meta = {
  title: "Parity/Inspector/Controls/Controls/Component instance",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const statCard: InstanceProp[] = [
  { name: "label", type: "text", value: "Revenue" },
  { name: "value", type: "text", value: "$48,210" },
  { name: "showRising", type: "boolean", value: true },
  { name: "showFalling", type: "boolean", value: false },
  { name: "change", type: "text", value: "+12.4%" },
  { name: "note", type: "text", value: "Up from $42,890 last month" }
]

const button: InstanceProp[] = [
  {
    name: "variant",
    type: "variant",
    value: "destructive",
    default: "default",
    options: [
      { id: "default", name: "default" },
      { id: "destructive", name: "destructive" },
      { id: "outline", name: "outline" },
      { id: "ghost", name: "ghost" }
    ]
  },
  {
    name: "size",
    type: "variant",
    default: "default",
    options: [
      { id: "sm", name: "sm" },
      { id: "default", name: "default" },
      { id: "lg", name: "lg" }
    ]
  },
  { name: "asChild", type: "boolean", value: false },
  { name: "label", type: "text", default: "Continue" },
  { name: "count", type: "number", value: 3 }
]

const chart: InstanceProp[] = [
  { name: "title", type: "text", value: "Revenue by month" },
  { name: "height", type: "number", default: 240 },
  { name: "max", type: "number", value: 50000 },
  {
    name: "series",
    type: "value",
    value: [
      { label: "Jan", value: 32000 },
      { label: "Feb", value: 41000 }
    ]
  },
  { name: "options", type: "value", default: { legend: true } }
]

/** The JSX the instance writes, its props as attributes. */
function markup(component: string, props: readonly InstanceProp[]): string {
  const attributes = props.flatMap((prop) => {
    if (prop.type === "shown" || prop.value === undefined) {
      return []
    }

    if (prop.type === "value") {
      return `${prop.name}={${JSON.stringify(prop.value)}}`
    }

    if (prop.type === "boolean") {
      return prop.value ? prop.name : `${prop.name}={false}`
    }

    return prop.type === "number" ? `${prop.name}={${prop.value}}` : `${prop.name}="${prop.value}"`
  })

  const tag = component
    .split(/\s+/)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join("")

  return `<${tag}\n  ${attributes.join("\n  ")}\n/>`
}

function Instance({
  component,
  start,
  overrides = 0,
  changedProps = []
}: {
  component: string
  start: InstanceProp[]
  overrides?: number
  changedProps?: string[]
}) {
  const [props, setProps] = useState(start)
  const [changed, setChanged] = useState(changedProps)

  return (
    <Playground
      writes={{
        stored: Object.fromEntries(
          props.flatMap((prop) => (prop.type === "shown" || prop.value === undefined ? [] : [[prop.name, prop.value]]))
        ),
        css: [],
        tailwind: [],
        markup: markup(component, props)
      }}
    >
      <InstanceSection
        component={component}
        props={props}
        onGoTo={() => undefined}
        menu={{
          overrides,
          swappable: ["Stat card", "Plan card", "Button", "Badge"].flatMap((name) =>
            name === component ? [] : [{ id: name, name }]
          ),
          onSwap: () => undefined,
          onResetOverrides: () => undefined,
          onPush: () => undefined,
          onDetach: () => undefined
        }}
        changed={(name) => changed.includes(name)}
        onChange={(name, value) =>
          setProps((current) =>
            current.map((prop) =>
              // SAFETY: each row's control gives back a value of its own row's type, so the row keeps its type.
              prop.name === name ? ({ ...prop, value } as InstanceProp) : prop
            )
          )
        }
        onResetProp={(name) => {
          setChanged((current) => current.filter((each) => each !== name))
          setProps((current) =>
            current.map((prop) => start.find((each) => each.name === prop.name && each.name === name) ?? prop)
          )
        }}
      />
    </Playground>
  )
}

/** A stat card: text props in the field's box, the two on-or-off props as switch rows. */
export const StatCard: Story = { render: () => <Instance component="Stat card" start={statCard} /> }

/** Overridden: two layers inside differ, so the menu's Reset overrides says 2, and value changed in this state. */
export const Overridden: Story = {
  render: () => <Instance component="Stat card" start={statCard} overrides={2} changedProps={["value"]} />
}

/**
 * A button: its variants in Tag's select, a switch row, text and a number. Size and Label are unset, so they're empty
 * with the component's defaults, default and Continue, shown faintly, and the instance writes neither.
 */
export const Variants: Story = { render: () => <Instance component="Button" start={button} /> }

/**
 * A chart: numbers in the approved number field, which takes maths and says why it can't read what's typed, and an
 * object and a list as JSON a key to a line, read when it's left. Height and Options are unset, so their defaults show
 * faintly.
 */
export const Objects: Story = { render: () => <Instance component="Revenue chart" start={chart} /> }
