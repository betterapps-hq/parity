import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { EffectsSection } from "./controls.tsx"
import type { Draft } from "./data.ts"
import { CardPreview, Playground, useDraft } from "./playground.tsx"
import { blurWrites, mergeWrites, mixedWrites } from "./writes.ts"

/**
 * Layer blur and Background blur (PAR-186), PAR-652's names for `filter: blur()` and `backdrop-filter: blur()`, in
 * Effects: a title with + until an effect is added, and a − on each row to take it off. Each takes a blur token or a
 * value of its own, marked (call 1), typed with the app's maths and checked by `CSS.supports`. The preview's shapes
 * show what a background blur does through a translucent fill.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Layer and background blur",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Blurs({ start, tokensOnly, mixed }: { start: Draft; tokensOnly?: boolean; mixed?: boolean }) {
  const [draft, set] = useDraft(start)

  const merged = mergeWrites({
    filter: blurWrites("blur", draft.blur),
    backdropFilter: blurWrites("backdropBlur", draft.backdropBlur)
  })

  const writes = mixed && merged.stored === undefined ? mixedWrites : merged

  return (
    <Playground
      writes={writes}
      preview={<CardPreview draft={{ background: "card", backgroundAlpha: 60, radius: "radius-xl", ...draft }} />}
    >
      <EffectsSection draft={draft} set={set} tokensOnly={tokensOnly} mixed={mixed} />
    </Playground>
  )
}

/** Layer blur at `blur-sm`, 8px: the whole layer is blurred, its text too. */
export const LayerBlur: Story = { render: () => <Blurs start={{ blur: "blur-sm" }} /> }

/** Background blur at `blur-md`, 12px: what's behind the translucent card is blurred, and the card stays sharp. */
export const BackgroundBlur: Story = { render: () => <Blurs start={{ backdropBlur: "blur-md" }} /> }

/** Both at once, each stored under its own property. */
export const Both: Story = { render: () => <Blurs start={{ blur: "blur-xs", backdropBlur: "blur-xl" }} /> }

/** A value of its own, 6px, with no mark: Tokens offers blur-xs or blur-sm, the nearest, first. */
export const PlainValue: Story = { render: () => <Blurs start={{ backdropBlur: { px: 6 } }} /> }

/** No effects yet: Effects is a title with +, which offers Layer blur and Background blur. */
export const Empty: Story = { render: () => <Blurs start={{}} /> }

/** In a project set to Tokens only, 6px is refused, with the nearest token under it. */
export const RefusedByTokensOnly: Story = { render: () => <Blurs start={{ backdropBlur: { px: 6 } }} tokensOnly /> }

/** Layers with different background blurs: Mixed, until something's typed or chosen for them all. */
export const Mixed: Story = { render: () => <Blurs start={{}} mixed /> }

/** `soft` typed and Enter pressed: it's neither a length nor a blur token, so it's refused, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Blurs start={{ backdropBlur: "blur-md" }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Background blur" })
    await userEvent.type(field, "soft{Enter}")
  }
}
