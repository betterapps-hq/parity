import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { Field } from "./field-row.tsx"
import { FontFamilyField, resolveFont } from "./font-fields.tsx"
import { Playground } from "./playground.tsx"
import { projectFonts } from "./text-data.ts"
import { TextSample } from "./text-preview.tsx"
import { type FontValue, fontWrites } from "./text-writes.ts"

/**
 * Font family (PAR-186, design-options-values.md's Font family), Text's Font row on its own. The first family shows in
 * its own face, with +2 when the stack has fallbacks and the stack in the hint; a font token is a chip with Ag in the
 * font. Focused, it lists the fonts, set in each, the project's first; typing searches them, and moving through them
 * previews each on the text. Enter takes the highlighted font; a comma-separated stack is kept as typed. A font the
 * frame can't load is Missing, drawn in the fallback with its name struck through. Its chevron opens the font tokens,
 * as every token field's does: the nearest token first for a font of its own, then Create token and Allow here, and
 * Detach while a token's set. The list's More fonts are fonts
 * installed on this computer, standing in for Google Fonts, which the app adds to the project when one is chosen.
 */
const meta = {
  title: "Parity/Inspector/Controls/Unique/Font family",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const geist = projectFonts[0]!

function Font({ start, tokensOnly, mixed }: { start?: FontValue; tokensOnly?: boolean; mixed?: boolean }) {
  const [value, setValue] = useState(start)
  const [preview, setPreview] = useState<FontValue>()
  const shown = resolveFont(preview ?? value)

  return (
    <Playground writes={fontWrites(value)} preview={<TextSample style={{ fontFamily: shown?.stack ?? geist.stack }} />}>
      <Field label="Font" mixed={mixed && value === undefined}>
        <FontFamilyField
          value={value}
          inherited={{ font: geist, from: "Plans" }}
          mixed={mixed}
          tokensOnly={tokensOnly}
          onChange={setValue}
          onPreview={setPreview}
        />
      </Field>
    </Playground>
  )
}

/**
 * A font token, `sans`, as a chip. Click the field to search; Backspace takes it off. The chevron opens the font tokens,
 * with Detach, which keeps Geist as a stack of its own.
 */
export const Token: Story = { render: () => <Font start={{ token: "sans" }} /> }

/** Unset: Geist, muted, inherited from Plans, which the hint names. Nothing is written. */
export const Unset: Story = { render: () => <Font /> }

/** A font of its own, Segoe UI, picked from More fonts, with no mark: the chevron offers sans, the nearest, first. */
export const ValueOfItsOwn: Story = { render: () => <Font start={{ stack: '"Segoe UI", sans-serif' }} /> }

/** Segoe UI allowed here, with its reason in the chevron's list, which can stop allowing it. */
export const AllowedHere: Story = {
  render: () => <Font start={{ stack: '"Segoe UI", sans-serif', allow: "The partner's brand font" }} />
}

/** A stack typed as it's wanted, `Palatino Linotype, Georgia, serif`: the first family in its face, with +2. */
export const TypedStack: Story = { render: () => <Font start={{ stack: '"Palatino Linotype", Georgia, serif' }} /> }

/** Söhne, which the project doesn't have: drawn in sans-serif with its name struck through. Its mark replaces or adds it. */
export const MissingFont: Story = { render: () => <Font start={{ stack: "Söhne, sans-serif" }} /> }

/**
 * Locked to tokens (`tokensOnly`), as a company can ask so its apps match its design language. Unlocked, the default, any
 * font goes. Its list shows only the tokens, and Segoe UI, already there, is refused with the nearest token under it.
 */
export const LockedToTokens: Story = {
  render: () => <Font start={{ stack: '"Segoe UI", sans-serif' }} tokensOnly />
}

/** Layers with different fonts: Mixed, until a font is chosen for them all. */
export const Mixed: Story = { render: () => <Font mixed /> }

/** `geo` typed: the list narrows to Georgia, set in Georgia, and the text previews it. Enter takes it. */
export const Searching: Story = {
  render: () => <Font start={{ token: "sans" }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("combobox", { name: "Font" })
    await userEvent.click(field)
    await userEvent.type(field, "geo")
    await userEvent.keyboard("{ArrowDown}{ArrowUp}")
  }
}

/** `Inter` typed and Enter pressed: there's no such font here, so it stays, with how to keep it as a stack under it. */
export const InvalidAsTyped: Story = {
  render: () => <Font start={{ token: "sans" }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("combobox", { name: "Font" })
    await userEvent.click(field)
    await userEvent.type(field, "Inter{Enter}")
  }
}
