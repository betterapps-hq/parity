import type { Meta, StoryObj } from "@storybook/react-vite"
import { useEffect, useState } from "react"
import { userEvent, within } from "storybook/test"
import { useTokenSets } from "./field-parts.tsx"
import type { ShadowEntry, ShadowLayer } from "./lists-data.ts"
import { shadowWrites } from "./lists-writes.ts"
import { Playground } from "./playground.tsx"
import { PreviewStage } from "./preview-card.tsx"
import { ShadowList, ShadowPreview } from "./shadow-list.tsx"
import { standInTokenSets as tokenSets } from "./stand-in-tokens.ts"
import { type TokenSets } from "./tokens.ts"
import { mixedWrites } from "./writes.ts"

/**
 * Effects' shadow list (PAR-652's Shadow list): drop shadows, inner shadows and rings, listed Inside then Outside, top
 * first as Tailwind paints them, each dragged within its group by the handle a group of two or more has. + adds a drop shadow, `shadow-sm`, on top of the drop
 * shadows; the section's menu adds an inner shadow, a ring, or a drop shadow that follows the shape. Each entry's row,
 * its card, type and token or numbers, opens its editor: its type menu, then the token, or X, Y, blur, spread and color
 * with the offset pad to drag. A shadow token is a chip
 * whose layers fold under a disclosure (Composite token): its color can be overridden, shown with the change dot, a
 * reset arrow and a dot on the chip, and the rest offers Detach. It's written into Tailwind's four box-shadow slots,
 * or as one arbitrary value when it doesn't fit them.
 */
const meta = {
  title: "Parity/Inspector/Lists/Shadow list",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/**
 * Hands the story's project tokens up from inside its Playground, so what it writes knows a shadow token made with
 * Create token.
 */
function ShareTokens({ onSets }: { onSets: (sets: TokenSets) => void }) {
  const sets = useTokenSets()

  useEffect(() => onSets(sets), [sets, onSets])

  return null
}

function Shadows({
  start,
  mixed = false,
  tokensOnly,
  text,
  openId
}: {
  start: ShadowEntry[]
  mixed?: boolean
  tokensOnly?: boolean
  /** A text layer, with or without a fill. */
  text?: { hasFill: boolean }
  openId?: string
}) {
  const [entries, setEntries] = useState(start)
  const [isMixed, setMixed] = useState(mixed)
  const [sets, setSets] = useState(tokenSets)
  const [shadowOf, setShadowOf] = useState<"text" | "box">("text")
  // The order a shadow's being carried over, drawn before it's let go; what's written stays as it is till then.
  const [carried, setCarried] = useState<ShadowEntry[]>()
  const onText = text !== undefined && shadowOf === "text"

  return (
    <Playground
      writes={
        isMixed
          ? mixedWrites
          : shadowWrites(entries, {
              shadowOfText: onText,
              tokens: [...sets.shadow, ...sets.insetShadow, ...sets.dropShadow, ...sets.textShadow]
            })
      }
      preview={
        <PreviewStage>
          <ShadowPreview
            entries={isMixed ? [] : (carried ?? entries)}
            onText={onText}
            filled={text === undefined || text.hasFill}
          />
        </PreviewStage>
      }
    >
      <ShareTokens onSets={setSets} />
      <ShadowList
        entries={entries}
        mixed={isMixed}
        tokensOnly={tokensOnly}
        text={text && { hasFill: text.hasFill, shadowOf, onShadowOf: setShadowOf }}
        openId={openId}
        onPreview={setCarried}
        onChange={(next) => {
          setMixed(false)
          setEntries(next)
        }}
      />
    </Playground>
  )
}

const black = (alpha: number): Pick<ShadowLayer, "color" | "alpha"> => ({ color: "black", alpha })
const custom: ShadowLayer = { x: 0, y: 4, blur: 12, spread: -2, ...black(10) }

const drop = (id: string, token: string): ShadowEntry => ({ id, kind: "drop", token, layer: custom })
const inner: ShadowEntry = { id: "inner", kind: "inner", token: "inset-shadow-sm", layer: custom }

const ring: ShadowEntry = {
  id: "ring",
  kind: "ring",
  width: 1,
  layer: { ...custom, color: "border", alpha: undefined }
}

/** No shadows yet: Effects is a title with +, and the menu beside it adds an inner shadow, a ring or a drop shadow. */
export const Empty: Story = { render: () => <Shadows start={[]} /> }

/** A shadow token, `shadow-md`, as a chip; its numbers are in its hint and its editor. */
export const Token: Story = { render: () => <Shadows start={[drop("md", "shadow-md")]} /> }

/** Token, with what the control stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...Token, parameters: { demo: true } }

/**
 * A composite token with a part overridden: `shadow-lg`'s color set to primary at 20% on this layer. The color's field
 * has the change dot and its reset arrow, and the chip has a dot: `shadow-lg shadow-primary/20`.
 */
export const TokenWithOverriddenColor: Story = {
  render: () => (
    <Shadows start={[{ ...drop("lg", "shadow-lg"), colorOverride: { color: "primary", alpha: 20 } }]} openId="lg" />
  )
}

/**
 * A shadow of its own, its editor open: drag in the offset pad to set X and Y, or type them with the app's maths. Its
 * color is the `black` token at 10%, as Tailwind's shadows are: `shadow-[0_4px_12px_-2px_…]`.
 */
export const CustomShadow: Story = {
  render: () => <Shadows start={[{ id: "own", kind: "drop", layer: custom }]} openId="own" />
}

/** An inner shadow, a ring and a drop shadow, one in each slot in Tailwind's order: `inset-shadow-sm ring-1 ring-border shadow-md`. */
export const InsideAndOutside: Story = {
  render: () => <Shadows start={[inner, ring, drop("md", "shadow-md")]} />
}

/** A ring drawn inside the edge, a 2px `inset-ring-2 inset-ring-primary`, listed Inside. */
export const InsetRing: Story = {
  render: () => (
    <Shadows
      start={[
        { id: "ring", kind: "ring", width: 2, inset: true, layer: { ...custom, color: "primary", alpha: undefined } }
      ]}
      openId="ring"
    />
  )
}

/**
 * Two drop shadows: Tailwind's shadow slot holds one, so they're written as one arbitrary value, and the list offers
 * Create token, which makes them one token by the name given.
 */
export const TwoDropShadows: Story = {
  render: () => (
    <Shadows
      start={[
        drop("sm", "shadow-sm"),
        { id: "glow", kind: "drop", layer: { x: 0, y: 0, blur: 24, spread: 0, color: "blue-500", alpha: 40 } }
      ]}
    />
  )
}

/** A drop shadow dragged above the ring: not the order Tailwind paints in, so it's one arbitrary value. */
export const OutOfTailwindsOrder: Story = {
  render: () => <Shadows start={[drop("md", "shadow-md"), ring]} />
}

/**
 * A drop shadow that follows the shape: the filter's `drop-shadow-md`, listed after the box shadows, since it's drawn
 * under them all.
 */
export const FollowsTheOutline: Story = {
  render: () => (
    <Shadows
      start={[ring, { id: "follow", kind: "drop", follow: true, token: "drop-shadow-md", layer: custom }]}
      openId="follow"
    />
  )
}

/** The drop shadow's eye is off: kept in the file but not drawn or written, so only the ring is. */
export const Hidden: Story = {
  render: () => <Shadows start={[ring, { ...drop("md", "shadow-md"), off: true }]} />
}

/** On a text layer with no fill: Drop shadow shadows the letters (`text-shadow-md`) and offers text shadow tokens. */
export const OnText: Story = {
  render: () => <Shadows start={[drop("text", "text-shadow-md")]} text={{ hasFill: false }} openId="text" />
}

/** On a text layer with a fill: Shadow of picks the letters (`text-shadow`) or the fill's box (`box-shadow`). */
export const OnTextWithAFill: Story = {
  render: () => <Shadows start={[drop("text", "text-shadow-sm")]} text={{ hasFill: true }} openId="text" />
}

/** A shadow colored #2f6fed at 40%, a value of its own: its color field's Tokens offers the nearest first. */
export const ColorOffTheSystem: Story = {
  render: () => (
    <Shadows
      start={[{ id: "own", kind: "drop", layer: { x: 0, y: 8, blur: 24, spread: -4, color: "#2f6fed", alpha: 40 } }]}
      openId="own"
    />
  )
}

/**
 * Locked to tokens (`tokensOnly`), as a company can ask so its apps match its design language. Unlocked, the default, a
 * shadow's color can be any. Its color picker is only the tokens, and the blue already there is refused with the nearest
 * token under it.
 */
export const LockedToTokens: Story = {
  render: () => (
    <Shadows
      start={[{ id: "own", kind: "drop", layer: { x: 0, y: 8, blur: 24, spread: -4, color: "#2f6fed", alpha: 40 } }]}
      tokensOnly
      openId="own"
    />
  )
}

/** Layers with different shadows: "Several shadows", until + replaces them all with one. */
export const Mixed: Story = { render: () => <Shadows start={[]} mixed /> }

/** `soft` typed as X and Enter pressed: it isn't a length, so it stays, outlined, with the reason under the row. */
export const InvalidAsTyped: Story = {
  render: () => <Shadows start={[{ id: "own", kind: "drop", layer: custom }]} openId="own" />,
  play: async ({ canvasElement }) => {
    const field = await within(canvasElement.ownerDocument.body).findByRole("textbox", { name: "X offset" })
    await userEvent.clear(field)
    await userEvent.type(field, "soft{Enter}")
  }
}
