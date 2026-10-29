import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { useProject } from "../canvas/context.ts"
import { useTokenList } from "../tokens-store.ts"
import { ChoiceInput, Field, NumberInput, Swatch, SwitchInput, TextInput, TokenInput, ValueInput } from "./fields.tsx"
import { InspectorStage, openInspector, PanelColumn, search, slowly, typing } from "./inspector-stories.tsx"
import { PanelSection } from "./PanelSection.tsx"

/**
 * The inspector's controls, one row each: a label, the control, and a reset button when a state changes the value.
 * Text and numbers commit on Enter or blur; choices, switches and tokens right away.
 */
const meta = {
  title: "Parity/Inspector/Fields",
  component: EveryField,
  args: { look: "set" },
  // A new look starts from that look's values.
  render: (args) => <EveryField key={args.look} {...args} />,
  loaders: [() => openInspector()],
  decorators: [
    (Story) => (
      <InspectorStage>
        <PanelColumn>
          <Story />
        </PanelColumn>
      </InspectorStage>
    )
  ]
} satisfies Meta<typeof EveryField>

export default meta
type Story = StoryObj<typeof meta>

/** How the rows look: values set, changed in a state, different across selected layers, or not set at all. */
type Look = "set" | "changed" | "mixed" | "unset"

const initial = {
  label: "Get started",
  description: "Start free, then upgrade when your team needs more room to work together.",
  id: "plan-call-to-action",
  opacity: 80 as number | undefined,
  lines: undefined as number | undefined,
  variant: "outline" as string | undefined,
  visible: true,
  json: { monthly: true, seats: [3, 10] } as unknown,
  color: "primary" as string | undefined,
  radius: "radius-lg" as string | undefined
}

/** Every kind of field, interactive, with its values kept here. */
function EveryField({ look, labels }: { look: Look; labels?: Partial<Record<keyof typeof initial, string>> }) {
  const tokens = useTokenList(useProject().tokens)
  const empty = look === "mixed" || look === "unset"
  const [values, setValues] = useState(
    empty
      ? {
          ...initial,
          label: "",
          description: "",
          id: "",
          opacity: undefined,
          json: "",
          variant: undefined,
          color: undefined,
          radius: undefined
        }
      : initial
  )
  const set = (change: Partial<typeof values>) => setValues((current) => ({ ...current, ...change }))
  const row = (name: keyof typeof initial, label: string, control: React.ReactNode, hint?: string) => (
    <Field
      label={labels?.[name] ?? label}
      hint={hint}
      changed={look === "changed"}
      mixed={look === "mixed"}
      onReset={() => set({ [name]: initial[name] })}
    >
      {control}
    </Field>
  )
  return (
    <PanelSection title="Fields">
      <div className="flex flex-col gap-1">
        {row("label", "Text", <TextInput value={values.label} onCommit={(label) => set({ label })} />)}
        {row(
          "description",
          "Long text",
          <TextInput multiline value={values.description} onCommit={(description) => set({ description })} />
        )}
        {row("id", "Code", <TextInput mono value={values.id} onCommit={(id) => set({ id })} />)}
        {row(
          "opacity",
          "Number",
          <NumberInput value={values.opacity} placeholder="100" suffix="%" onCommit={(opacity) => set({ opacity })} />
        )}
        {row(
          "lines",
          "No number",
          <NumberInput value={values.lines} placeholder="No limit" onCommit={(lines) => set({ lines })} />
        )}
        {row(
          "variant",
          "Choice",
          <ChoiceInput
            value={values.variant}
            placeholder="default (default)"
            options={["default", "outline", "secondary", "ghost", "destructive", "link"].map((value) => ({
              value,
              label: value
            }))}
            onChange={(variant) => set({ variant })}
          />
        )}
        {row("visible", "Switch", <SwitchInput value={values.visible} onChange={(visible) => set({ visible })} />)}
        {row("json", "Any value", <ValueInput value={values.json} onCommit={(json) => set({ json })} />)}
        {row(
          "color",
          "Color",
          <TokenInput
            value={values.color}
            tokens={tokens}
            categories={["color"]}
            onChange={(color) => set({ color })}
          />
        )}
        {row(
          "radius",
          "Token",
          <TokenInput
            value={values.radius}
            tokens={tokens}
            categories={["radius"]}
            onChange={(radius) => set({ radius })}
          />
        )}
      </div>
    </PanelSection>
  )
}

/** Every kind of field with a value: text, long text, code, numbers, a choice, a switch, JSON, and tokens. */
export const EveryKind: Story = {}

/** Nothing set: each control shows its placeholder or default, None for tokens. */
export const NothingSet: Story = { args: { look: "unset" } }

/** Every value changed in the state being edited: labels in the agent color, each row with a reset button. */
export const ChangedInAState: Story = { args: { look: "changed" } }

/** Several layers selected with different values: each control reads Mixed until one value is set for all. */
export const Mixed: Story = { args: { look: "mixed" } }

/** Labels too long for their column truncate; the full label shows on hover. */
export const LongLabels: Story = {
  args: {
    labels: {
      label: "aria-describedby",
      description: "Accessible description",
      id: "data-testid-for-the-checkout-flow",
      opacity: "Background opacity"
    }
  }
}

/** Any value input with each kind of value it can hold: a switch, a number, text, and JSON for the rest. */
export const AnyValue: Story = {
  render: () => (
    <PanelSection title="Any value">
      <div className="flex flex-col gap-1">
        {[true, 42, "Billed yearly", ["monthly", "yearly"], { seats: 3 }, null].map((value) => (
          <Field
            key={JSON.stringify(value)}
            label={value === null ? "null" : Array.isArray(value) ? "array" : typeof value}
          >
            <ValueInput value={value} onCommit={() => undefined} />
          </Field>
        ))}
      </div>
    </PanelSection>
  )
}

/** Swatches at the sizes the panel uses, for a few of the project's colors. */
export const Swatches: Story = {
  render: () => (
    <PanelSection title="Swatches">
      <div className="flex items-center gap-2 px-1">
        {["var(--primary)", "var(--destructive)", "var(--muted)", "#f5f5f5", "transparent"].map((color) => (
          <Swatch key={color} value={color} />
        ))}
        {["var(--primary)", "var(--chart-2)"].map((color) => (
          <Swatch key={color} value={color} className="size-6" />
        ))}
      </div>
    </PanelSection>
  )
}

/** A choice open: the default first, muted, then each option. */
export const ChoiceOpen: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("combobox"))
    await within(document.body).findByRole("listbox", undefined, slowly)
  }
}

/** A token picker open and searched: matching colors with swatches, grouped by where they come from. */
export const SearchingTokens: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /primary/ }))
    await search(await within(document.body).findByPlaceholderText("Search tokens", undefined, slowly), "muted")
  }
}

/** A token search that matches nothing. */
export const NoTokenMatches: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /radius-lg/ }))
    await search(await within(document.body).findByPlaceholderText("Search tokens", undefined, slowly), "huge")
  }
}

/** Typing in a text field: nothing is written until Enter or the field loses focus. */
export const Typing: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByDisplayValue("Get started")
    await userEvent.clear(input)
    await userEvent.type(input, "Start your free trial", typing)
  }
}
