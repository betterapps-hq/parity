import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { Field } from "../../chrome/fields.tsx"
import { type Basis, evaluateLength, ExpressionField, expressionWrites, fillTokens } from "./expression.tsx"
import { Playground } from "./playground.tsx"
import { TextSample } from "./text-preview.tsx"

/**
 * Expression (PAR-186, design-options-values.md's Expression). `=` in any field opens an expression, widened to the
 * row, with completion for `calc()`, `min()`, `max()`, `clamp()`, `color-mix()` and tokens inside `var()`, each `var()`
 * drawn as a token chip and what it comes to beside it. At rest it's the function's name and what it comes to
 * (`clamp 25.6`), or `ƒ` in a field under 96px. A `clamp()` opens its three fields: least, preferred and most. Enter
 * checks it with `CSS.supports` and stores it in its simplest form, so `calc(var(--spacing) * 18)` is a step.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Expression",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const parentWidth = 680

function Expr({
  label,
  property,
  prefix,
  start,
  kind = "length",
  basis = { percent: parentWidth },
  narrow
}: {
  label: string
  property: string
  prefix: string
  start?: string
  kind?: "length" | "color"
  basis?: Basis
  narrow?: boolean
}) {
  const [value, setValue] = useState(start)
  const px = value === undefined || kind === "color" ? undefined : evaluateLength(value, basis)
  const length = typeof px === "number" ? px : undefined
  let preview = (
    <div className="flex w-[340px] flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">Plans, {parentWidth} wide, drawn at half size</span>
      <div className="h-16 rounded-md border border-dashed bg-white p-0">
        <div className="h-full rounded-md bg-[#2563eb]/80" style={{ width: (length ?? 0) / 2 }} />
      </div>
    </div>
  )
  if (property === "font-size") preview = <TextSample style={{ fontSize: length }} />
  if (property === "padding-top") {
    preview = (
      <div className="w-60 rounded-md border bg-white text-neutral-900" style={{ paddingTop: length }}>
        <div className="border-t border-dashed border-[#f54900] p-2 text-xs">Content starts here</div>
      </div>
    )
  }
  if (kind === "color") {
    preview = (
      <div className="size-40 rounded-xl border" style={{ background: value ? fillTokens(value) : undefined }} />
    )
  }
  return (
    <Playground writes={expressionWrites(property, prefix, value)} preview={preview}>
      <Field label={label}>
        <div className={narrow ? "w-20" : undefined}>
          <ExpressionField
            label={label}
            property={property}
            kind={kind}
            value={value}
            basis={basis}
            narrow={narrow}
            onChange={setValue}
          />
        </div>
      </Field>
    </Playground>
  )
}

/** Width, `calc(100% - 2rem)`: calc and what it comes to in Plans, 648. Click it to edit the text. */
export const Calc: Story = {
  render: () => <Expr label="Width" property="width" prefix="w" start="calc(100% - 2rem)" />
}

/** Font size, `clamp(1rem, 2vw, 2rem)`: clicking it opens least, preferred and most, each typed with what it comes to. */
export const Clamp: Story = {
  render: () => (
    <Expr
      label="Font size"
      property="font-size"
      prefix="text"
      start="clamp(1rem, 2vw, 2rem)"
      basis={{ percent: 16, fontSize: 16 }}
    />
  )
}

/** Tokens inside: `calc(var(--container-md) - 2rem)`, the token drawn as a chip while it's edited. */
export const TokensInside: Story = {
  render: () => <Expr label="Width" property="width" prefix="w" start="calc(var(--container-md) - 2rem)" />
}

/** In a field under 96px, as a side is: ƒ, with the expression and what it comes to in its hint. */
export const Narrow: Story = {
  render: () => <Expr label="Top padding" property="padding-top" prefix="pt" start="max(1rem, 2vh)" narrow />
}

/** A plain length, 320: type = to open an expression. Here `min(100%, 40rem)` is typed and Enter pressed. */
export const TypingAnExpression: Story = {
  render: () => <Expr label="Width" property="width" prefix="w" start="320px" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole("textbox", { name: "Width" }), "=")
    const editor = await canvas.findByRole("combobox", { name: "Width expression" })
    await userEvent.type(editor, "min(100%, 40rem){Enter}")
  }
}

/** `cl` typed after =: completion offers clamp(); Tab or Enter takes it. */
export const Completion: Story = {
  render: () => <Expr label="Width" property="width" prefix="w" start="320px" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole("textbox", { name: "Width" }), "=")
    const editor = await canvas.findByRole("combobox", { name: "Width expression" })
    await userEvent.type(editor, "cl")
  }
}

/** `calc(var(--spacing) * 18)` typed: it comes to one step, so it's stored as `{ step: 18 }` and written `w-18`. */
export const SimplestForm: Story = {
  render: () => <Expr label="Width" property="width" prefix="w" start="320px" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole("textbox", { name: "Width" }), "=")
    const editor = await canvas.findByRole("combobox", { name: "Width expression" })
    await userEvent.type(editor, "calc(var(--spacing) * 18){Enter}")
  }
}

/** A fill of `color-mix(in oklab, var(--color-primary) 50%, transparent)`: stored as primary at 50%, `bg-primary/50`. */
export const ColorMix: Story = {
  render: () => (
    <Expr
      label="Fill"
      property="background-color"
      prefix="bg"
      kind="color"
      start="color-mix(in oklab, var(--color-chart-2) 50%, transparent)"
    />
  )
}

/** `calc(100% - )` typed and Enter pressed: it isn't finished, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Expr label="Width" property="width" prefix="w" start="calc(100% - 2rem)" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "Width: calc(100% - 2rem)" }))
    const editor = await canvas.findByRole("combobox", { name: "Width expression" })
    await userEvent.clear(editor)
    await userEvent.type(editor, "calc(100% - ){Enter}")
  }
}
