import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { ColorInput } from "./color-picker.tsx"
import { usedColors } from "./data.ts"
import { Field } from "./field-row.tsx"
import { CardPreview, Playground, useDraft } from "./playground.tsx"
import { colorWrites, inState, mixedWrites, type Writes } from "./writes.ts"

/**
 * The color field (PAR-186, PAR-652's Color type), on its own: a token is a chip; a value of its own shows in short
 * form with a mark, as every field takes one (call 1). It types like a text field with the chip in it: click beside the
 * chip to type a hex or a token's name, and Backspace removes it. A click on the chip focuses the field, and once
 * it's focused opens the picker, as the swatch does.
 * Beside it, what it stores and what it writes as CSS and as Tailwind.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Color field",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

interface ColorFieldProps {
  value?: string
  alpha?: number
  allowed?: string
  tokensOnly?: boolean
  mixed?: boolean
  theme?: { name: string; value: string }
  /** Set on Hover, where the first state's value is `card`. */
  hover?: boolean
}

function ColorField({ value, alpha, allowed, tokensOnly, mixed, theme, hover = false }: ColorFieldProps) {
  const [draft, set] = useDraft({ background: value, backgroundAlpha: alpha, backgroundAllowed: allowed })
  const [changed, setChanged] = useState(hover)
  const [mixedNow, setMixed] = useState(mixed ?? false)
  let writes: Writes = colorWrites("bg", draft.background, draft.backgroundAlpha, draft.backgroundAllowed)

  if (mixedNow && draft.background === undefined) {
    writes = mixedWrites
  }

  if (changed) {
    writes = inState(writes, "hover")
  }

  if (theme && draft.background !== undefined) {
    writes = {
      // SAFETY: a color that's set stores an object (`{ token }` or `{ value }`), and so does its Hover state.
      stored: { ...(writes.stored as object), themes: { dark: { token: theme.value } } },
      css: [...writes.css, `.dark & { background-color: var(--color-${theme.value}) }`],
      tailwind: [...writes.tailwind, `dark:bg-${theme.value}`]
    }
  }

  return (
    <Playground writes={writes} preview={<CardPreview draft={draft} />}>
      <Field
        label="Fill"
        changed={changed}
        onReset={() => {
          setChanged(false)
          set({ background: "card", backgroundAlpha: undefined, backgroundAllowed: undefined })
        }}
      >
        <ColorInput
          label="Fill"
          tokensOnly={tokensOnly}
          used={usedColors}
          value={draft.background}
          alpha={draft.backgroundAlpha}
          allowed={draft.backgroundAllowed}
          mixed={mixedNow}
          theme={theme}
          onAllow={(backgroundAllowed) => set({ backgroundAllowed })}
          onChange={(background, backgroundAlpha) => {
            setMixed(false)
            set({ background, backgroundAlpha, backgroundAllowed: undefined })
          }}
        />
      </Field>
    </Playground>
  )
}

/** A token, `primary`, as a chip. Click beside it and press Backspace, or use its ×, to remove it, then type `2f6fed`. */
export const Token: Story = { render: () => <ColorField value="primary" /> }

/** A token with its opacity after it, `bg-card/70`: the % field is the token's alpha, written after its name. */
export const TokenWithOpacity: Story = { render: () => <ColorField value="card" alpha={70} /> }

/**
 * A value of its own, #2f6fed, in short form with no mark: Tokens offers the nearest (blue-600) first, then Create
 * token. Its opacity is part of the color (`#2f6fed80`).
 */
export const PlainValue: Story = { render: () => <ColorField value="#2f6fed" /> }

/** The same blue allowed here, with a reason: the mark is filled, and its hint gives the reason, stored with the value. */
export const AllowedHere: Story = {
  render: () => <ColorField value="#2f6fed" allowed="Partner brand blue" />
}

/**
 * In a project set to Tokens only, the blue is refused: outlined in the error color, with the nearest token under it.
 * Allow here, from the mark, keeps it as an exception.
 */
export const RefusedByTokensOnly: Story = { render: () => <ColorField value="#2f6fed" tokensOnly /> }

/** Unset: None, muted, and nothing written. Click the dashed swatch to pick, or type. */
export const Unset: Story = { render: () => <ColorField /> }

/** Layers with different fills: Mixed, with the swatch split, until something's typed or picked for them all. */
export const Mixed: Story = { render: () => <ColorField mixed /> }

/** Set on Hover: the label takes the state color, with a reset arrow back to the first state's `card`. */
export const SetInAState: Story = { render: () => <ColorField value="primary" alpha={90} hover /> }

/** Set for the Dark theme too: a moon at the field's end, with the dark value in its hint, before the chevron. */
export const SetForATheme: Story = {
  render: () => <ColorField value="card" theme={{ name: "Dark", value: "secondary" }} />
}

/** A deprecated token, `brand-blue`: the chip carries a warning, whose hint names the replacement, and clicking swaps it in. */
export const Deprecated: Story = { render: () => <ColorField value="brand-blue" /> }

/** A token the project no longer has, `brand-old`: struck through, until another is chosen. */
export const MissingToken: Story = { render: () => <ColorField value="brand-old" /> }

/**
 * `blurple` typed and Enter pressed: it isn't a color, so the text stays, outlined, with the reason under it, and
 * nothing is stored. Escape puts `primary` back; leaving does too, and says why.
 */
export const InvalidAsTyped: Story = {
  render: () => <ColorField value="primary" />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Fill" })
    await userEvent.click(field)
    await userEvent.type(field, "blurple{Enter}")
  }
}
