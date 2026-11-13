import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import { PixelField } from "./controls.tsx"
import { Field } from "./field-row.tsx"
import { NumberField } from "./number-field.tsx"
import { Playground } from "./playground.tsx"
import { type Side, sideClass, sideCss, sideRules, sideStored } from "./sides-writes.ts"
import { SideField } from "./sides.tsx"
import { lengthWrites, type Writes } from "./writes.ts"

/**
 * The plain number fields (PAR-186): `NumberField` for counts and numbers without words, `PixelField` for lengths, and the
 * side field that offers tokens: committed on Enter or on leaving,
 * with a short label inside that scrubs when dragged, and a unit after it that stays while typing, until what's typed
 * brings its own. A length takes the app's maths and units (`+8`, `*2`, `1.5rem`, `spacing-4`) and is kept in pixels,
 * shown in px or rem as chosen from its unit's menu. A spacing length steps a whole spacing step (4px) on Up and Down;
 * others step by 1, or 10 with Shift. A narrow field keeps its unit too. What it can't read stays, outlined, with the
 * reason under it, whether Enter is pressed or the field is left; Escape puts the value back.
 */
const meta = {
  title: "Parity/Inspector/Fields/Number field",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function StoryField({
  label,
  inner,
  start,
  pixels = false,
  spacing = false,
  narrow = false,
  placeholder,
  min,
  writes
}: {
  label: string
  inner?: string
  start: number | undefined
  pixels?: boolean
  spacing?: boolean
  narrow?: boolean
  placeholder?: string
  min?: number
  writes: (value: number | undefined) => Writes
}) {
  const [value, setValue] = useState(start)

  return (
    <Playground writes={writes(value)}>
      <Field label={label}>
        <div className={narrow ? "w-20" : undefined}>
          {pixels ? (
            <PixelField
              label={label}
              inner={inner}
              spacing={spacing}
              narrow={narrow}
              value={value}
              placeholder={placeholder}
              min={min}
              onChange={setValue}
            />
          ) : (
            <NumberField
              label={label}
              inner={inner}
              whole
              min={min}
              narrow={narrow}
              value={value}
              placeholder={placeholder}
              onChange={setValue}
            />
          )}
        </div>
      </Field>
    </Playground>
  )
}

/** Outline offset in pixels, as Tailwind writes it: a number of pixels, not a spacing step. */
const outlineOffsetWrites = (px: number | undefined): Writes =>
  px === undefined
    ? { stored: undefined, css: [], tailwind: [] }
    : {
        stored: { value: `${px}px` },
        css: [`outline-offset: ${px}px`],
        tailwind: [Number.isInteger(px) ? `outline-offset-${px}` : `outline-offset-[${px}px]`]
      }

/** Gap on the side field, which offers the spacing tokens. */
function GapField({ start, tokensOnly = false }: { start: Side; tokensOnly?: boolean }) {
  const [value, setValue] = useState<Side>(start)

  const writes: Writes =
    value === undefined
      ? { stored: undefined, css: [], tailwind: [] }
      : {
          stored: sideStored("gap", value),
          css: [`gap: ${sideCss("gap", value)}`],
          tailwind: [sideClass("gap", "gap", value)]
        }

  return (
    <Playground writes={writes}>
      <Field label="Gap">
        <SideField
          label="Gap"
          rules={sideRules.gap}
          value={value}
          tokensOnly={tokensOnly}
          onChange={(next) => setValue(next)}
        />
      </Field>
    </Playground>
  )
}

const columnsWrites = (count: number | undefined): Writes =>
  count === undefined
    ? { stored: undefined, css: [], tailwind: [] }
    : {
        stored: { value: count },
        css: [`grid-template-columns: repeat(${count}, minmax(0, 1fr))`],
        tailwind: [`grid-cols-${count}`]
      }

/** A length a property takes in pixels alone, with no tokens: Outline offset at 2. Up makes it 3, Shift+Up 12. */
export const Plain: Story = {
  render: () => <StoryField label="Outline offset" start={2} pixels writes={outlineOffsetWrites} />
}

/** Plain, with what the control stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...Plain, parameters: { demo: true } }

/**
 * The same field where the property takes the project's spacing tokens, as Gap does: the chevron at its end lists
 * them, with the one nearest 18 first and Create token after them. Up steps a whole spacing step, 4px. Type `+8`,
 * `*2`, `1.5rem`, `spacing-6` or a token's name.
 */
export const WithTokens: Story = { render: () => <GapField start={{ number: 18 }} /> }

/** Holding a token, spacing-gutter, as its pill: what it comes to is in its hint, and its chevron offers Detach. */
export const Token: Story = { render: () => <GapField start={{ token: "spacing-gutter" }} /> }

/**
 * In a project set to Tokens only, 18 is refused: it shows in the error color, with the nearest token, spacing-inset,
 * one click away, and Allow here in its menu.
 */
export const LockedToTokens: Story = { render: () => <GapField start={{ number: 18 }} tokensOnly /> }

/** The selected layers differ: it says Mixed, and what's typed sets them all. */
export const Mixed: Story = {
  render: () => (
    <Playground writes={{ stored: undefined, css: [], tailwind: [] }}>
      <Field label="Outline offset">
        <PixelField label="Outline offset" mixed value={undefined} onChange={() => undefined} />
      </Field>
    </Playground>
  )
}

/** Shown in rem, 40rem: rem chosen from the unit's menu, and the value kept in pixels either way. */
export const InRem: Story = {
  render: () => (
    <StoryField label="Max width" start={640} pixels writes={(px) => lengthWrites("max-width", "max-w", px)} />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Max width unit: px" }))
    // The menu opens in a portal, outside the story's canvas.
    await userEvent.click(await within(document.body).findByRole("menuitemradio", { name: /^rem/ }))
  }
}

/** A narrow field, as a corner's or a stroke side's is: the unit still shows, and its message spans the row. */
export const Narrow: Story = {
  render: () => (
    <StoryField
      label="Top stroke width"
      inner="T"
      start={2}
      pixels
      narrow
      writes={(px) =>
        px === undefined
          ? { stored: undefined, css: [], tailwind: [] }
          : { stored: { value: `${px}px` }, css: [`border-top-width: ${px}px`], tailwind: [`border-t-${px}`] }
      }
    />
  )
}

/** A count, Columns: whole numbers only, at least 1, stepping by 1. */
export const Count: Story = {
  render: () => <StoryField label="Columns" start={3} min={1} writes={columnsWrites} />
}

/** Unset, with what it is unset in its placeholder: a max height that isn't set, None. */
export const Unset: Story = {
  render: () => (
    <StoryField
      label="Max height"
      start={undefined}
      pixels
      placeholder="None"
      writes={(px) => lengthWrites("max-height", "max-h", px)}
    />
  )
}

/** `wide` typed and Enter pressed: it isn't a length, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <StoryField label="Outline offset" start={2} pixels writes={outlineOffsetWrites} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Outline offset" })
    await userEvent.clear(field)
    await userEvent.type(field, "wide{Enter}")
    await expect(field).toHaveValue("wide")
    await expect(field).toHaveAttribute("aria-invalid", "true")
  }
}
