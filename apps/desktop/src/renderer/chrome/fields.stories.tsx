import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { useProject } from "../canvas/context.ts"
import { PixelField } from "../inspector/controls/controls.tsx"
import { NumberField } from "../inspector/controls/number-field.tsx"
import { useTokenList } from "../tokens-store.ts"
import { ChoiceInput, Field, Swatch, SwitchInput, TextInput, TokenInput, ValueInput } from "./fields.tsx"
import { InspectorStage, openInspector, PanelColumn, search, slowly, typing } from "./inspector-stories.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { booleanValue, numberValue, type PropValue, textValue } from "./prop-values.ts"

/**
 * The inspector's controls, one row each: a label, the control, and a reset button when a state changes the value.
 * Text and numbers commit on Enter or blur; choices, switches and tokens right away. Numbers and lengths are the Design
 * tab's own (`NumberField`, `PixelField`): they read units and maths, step with Up and Down, scrub by their label, and
 * say under the row what they couldn't read.
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

/** What kind of value a field holds, for its label. */
function kindOf(value: PropValue): string {
  if (value === null) {
    return "null"
  }

  if (Array.isArray(value)) {
    return "array"
  }

  if (booleanValue.safeParse(value).success) {
    return "boolean"
  }

  if (numberValue.safeParse(value).success) {
    return "number"
  }

  return textValue.safeParse(value).success ? "string" : "object"
}

type Story = StoryObj<typeof meta>

/** How the rows look: values set, changed in a state, different across selected layers, or not set at all. */
type Look = "set" | "changed" | "mixed" | "unset"

/** The value each row holds, typed as its control takes it, so a row can be cleared. */
interface Values {
  label: string
  description: string
  id: string
  opacity: number | undefined
  lines: number | undefined
  /** In pixels. */
  gap: number | undefined
  variant: string | undefined
  visible: boolean
  json: PropValue | undefined
  color: string | undefined
  radius: string | undefined
}

const initial: Values = {
  label: "Get started",
  description: "Start free, then upgrade when your team needs more room to work together.",
  id: "plan-call-to-action",
  opacity: 80,
  lines: undefined,
  gap: 16,
  variant: "outline",
  visible: true,
  json: { monthly: true, seats: [3, 10] },
  color: "primary",
  radius: "radius-lg"
}

/** Every kind of field, interactive, with its values kept here. */
function EveryField({ look, labels }: { look: Look; labels?: Partial<Record<keyof Values, string>> }) {
  const tokens = useTokenList(useProject().tokens)
  const empty = look === "mixed" || look === "unset"

  const [values, setValues] = useState<Values>(
    empty
      ? {
          ...initial,
          label: "",
          description: "",
          id: "",
          opacity: undefined,
          gap: undefined,
          json: "",
          variant: undefined,
          color: undefined,
          radius: undefined
        }
      : initial
  )

  const set = (change: Partial<Values>) => setValues((current) => ({ ...current, ...change }))

  const row = (name: keyof Values, label: string, control: React.ReactNode, hint?: string) => (
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
          <NumberField
            label={labels?.opacity ?? "Number"}
            min={0}
            max={100}
            unit="%"
            value={values.opacity}
            placeholder="100"
            mixed={look === "mixed"}
            onChange={(opacity) => set({ opacity })}
          />
        )}
        {row(
          "lines",
          "No number",
          <NumberField
            label="No number"
            whole
            min={1}
            value={values.lines}
            placeholder="No limit"
            unsetIs={1}
            onChange={(lines) => set({ lines })}
          />
        )}
        {row(
          "gap",
          "Length",
          <PixelField
            label="Length"
            spacing
            value={values.gap}
            mixed={look === "mixed"}
            onChange={(gap) => set({ gap })}
          />
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
            label="Color"
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
            label="Token"
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

/**
 * Every kind of field with a value: text, long text, code, numbers, a choice, a switch, JSON, and tokens. Each row's
 * label names its control; a token picker keeps its own name, which says the value too.
 */
export const EveryKind: Story = {
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement)

    for (const name of ["Text", "Long text", "Code", "Number", "No number", "Length", "Any value"]) {
      await expect(panel.getByRole("textbox", { name })).toBeVisible()
    }

    await expect(panel.getByRole("combobox", { name: "Choice" })).toBeVisible()
    await expect(panel.getByRole("switch", { name: "Switch" })).toBeChecked()
    await expect(panel.getByRole("button", { name: "Color, primary" })).toBeVisible()
    await expect(panel.getByRole("button", { name: "Token, radius-lg" })).toBeVisible()
  }
}

/** Nothing set: each control shows its placeholder or default, None for tokens. */
export const NothingSet: Story = { args: { look: "unset" } }

/** Every value changed in the state being edited: each control with the change dot, each row with a reset button. */
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

/** One value of each kind the any value input holds. */
const anyValues: PropValue[] = [true, 42, "Billed yearly", ["monthly", "yearly"], { seats: 3 }, null]

/** Any value input with each kind of value it can hold: a switch, a number, text, and JSON for the rest. */
export const AnyValue: Story = {
  render: () => (
    <PanelSection title="Any value">
      <div className="flex flex-col gap-1">
        {anyValues.map((value) => (
          <Field key={JSON.stringify(value)} label={kindOf(value)}>
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
    await userEvent.click(within(canvasElement).getByRole("combobox", { name: "Choice" }))
    await within(document.body).findByRole("listbox", undefined, slowly)
  }
}

/** A token picker open and searched: matching colors with swatches, grouped by where they come from. */
export const SearchingTokens: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Color, / }))
    await search(await within(document.body).findByPlaceholderText("Search tokens", undefined, slowly), "muted")
  }
}

/** A token search that matches nothing. */
export const NoTokenMatches: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Token, / }))
    await search(await within(document.body).findByPlaceholderText("Search tokens", undefined, slowly), "huge")
  }
}

/** Typing in a text field: nothing is written until Enter or the field loses focus. */
export const Typing: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", { name: "Text" })
    await userEvent.clear(input)
    await userEvent.type(input, "Start your free trial", typing)
  }
}

/** Maths in a number field: 50-10 in the percentage gives 40, and Enter makes it and leaves the field. */
export const TypingMaths: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", { name: "Number" })
    await userEvent.tripleClick(input)
    await userEvent.keyboard("50-10{Enter}")
    await expect(input).toHaveValue("40")
    await expect(input).not.toHaveFocus()
  }
}

/** A length off the spacing scale stays as typed: 281 is 281px. */
export const KeepsAnyLength: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", { name: "Length" })
    await userEvent.tripleClick(input)
    await userEvent.keyboard("281{Enter}")
    await expect(input).toHaveValue("281")
  }
}

/** Input a field can't read stays as typed, marked, with the reason under it. */
export const CantRead: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", { name: "Length" })
    await userEvent.tripleClick(input)
    await userEvent.keyboard("16em{Enter}")
    await expect(input).toHaveValue("16em")
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await within(canvasElement).findByText(/"em" isn't a unit/)
  }
}

/** Up and Down step a value, Shift by ten: a length one step of the spacing scale, a number by 1. */
export const Stepping: Story = {
  play: async ({ canvasElement }) => {
    const length = within(canvasElement).getByRole("textbox", { name: "Length" })
    await userEvent.click(length)
    await userEvent.keyboard("{ArrowUp}")
    await expect(length).toHaveValue("20")
    await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}")
    await expect(length).toHaveValue("60")
    const number = within(canvasElement).getByRole("textbox", { name: "Number" })
    await userEvent.click(number)
    await userEvent.keyboard("{ArrowDown}")
    await expect(number).toHaveValue("79")
  }
}
