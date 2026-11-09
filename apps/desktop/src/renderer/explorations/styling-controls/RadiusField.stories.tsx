import type { Meta, StoryObj } from "@storybook/react-vite"
import { userEvent, within } from "storybook/test"
import { AppearanceSection } from "./controls.tsx"
import type { Draft } from "./data.ts"
import { CardPreview, Playground, useDraft } from "./playground.tsx"
import { inState, mixedWrites, radiusWrites } from "./writes.ts"

/**
 * Radius (PAR-186, PAR-652's Appearance), on its own: one field under its name, and each corner, laid out where the
 * corners are, once Each corner at the end of the name's row is pressed. It opens pressed when the corners differ, and
 * the one field says Mixed if they still differ when it's closed. Each takes a radius token or a value of its own
 * (call 1) in px or as a percentage of the layer's size, as Framer and Webflow take (`50%`); the unit's menu switches
 * between them, keeping the number. It's typed with the app's maths (`+2`, `*2`, `0.5rem`) and checked by
 * `CSS.supports` before it's stored. A
 * corner's field is narrow, so what it comes to is in its hint; its unit still shows. The button beside Each
 * corner opens Corner shape, marked † as Chromium only. Up and Down step a token through the scale.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Radius",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

function Radius({
  start,
  tokensOnly,
  mixed,
  hover = false
}: {
  start: Draft
  tokensOnly?: boolean
  mixed?: boolean
  hover?: boolean
}) {
  const [draft, set] = useDraft(start)
  const written = mixed && draft.radius === undefined ? mixedWrites : radiusWrites(draft.radius, draft.cornerShape)
  return (
    <Playground
      writes={hover ? inState(written, "hover") : written}
      preview={<CardPreview draft={{ ...draft, background: "card" }} cornerShape={draft.cornerShape} />}
    >
      <AppearanceSection
        draft={draft}
        set={set}
        tokensOnly={tokensOnly}
        mixed={mixed && draft.radius === undefined}
        changed={hover ? { onReset: () => set({ radius: "radius-lg" }) } : undefined}
      />
    </Playground>
  )
}

/** A token, `radius-lg`, as a pill named lg, whose hint says radius-lg and what it comes to. */
export const Token: Story = { render: () => <Radius start={{ radius: "radius-lg" }} /> }

/** Each corner its own, laid out where it is: the top two at 2xl, the bottom two at sm. */
export const PerCorner: Story = {
  render: () => <Radius start={{ radius: ["radius-2xl", "radius-2xl", "radius-sm", "radius-sm"] }} />
}

/** A value of its own, 12px, with no mark: Tokens offers the nearest (radius-lg) first, then Create token. */
export const PlainValue: Story = { render: () => <Radius start={{ radius: { px: 12 } }} /> }

/**
 * 50%, typed or from the unit's menu: half the card's width across and half its height down, so the 200 by 120 card is
 * an ellipse (a square would be a circle), written `rounded-[50%]`. Unlike radius-full's pill, it rounds the sides too.
 */
export const Percentage: Story = { render: () => <Radius start={{ radius: { percent: 50 } }} /> }

/** 12px allowed here, with its reason in Tokens, which can stop allowing it. */
export const AllowedHere: Story = {
  render: () => <Radius start={{ radius: { px: 12, allow: "Matches the photo frame" } }} />
}

/** In a project set to Tokens only, 12px is refused, with the nearest token under it. */
export const RefusedByTokensOnly: Story = { render: () => <Radius start={{ radius: { px: 12 } }} tokensOnly /> }

/** Unset: 0, muted. The token button shows on hover. */
export const Unset: Story = { render: () => <Radius start={{}} /> }

/** Layers with different radii: Mixed, until something's typed or chosen for them all. */
export const Mixed: Story = { render: () => <Radius start={{}} mixed /> }

/** Set on Hover: the label takes the state color, with a reset arrow back to `radius-lg`. */
export const SetInAState: Story = { render: () => <Radius start={{ radius: "radius-xl" }} hover /> }

/** A replaced token, `radius-card`: its pill is amber, and Tokens offers radius-xl in its place first. */
export const Deprecated: Story = { render: () => <Radius start={{ radius: "radius-card" }} /> }

/** A token the project no longer has, `radius-pill`: its pill is red until another is chosen. */
export const MissingToken: Story = { render: () => <Radius start={{ radius: "radius-pill" }} /> }

/** A squircle: Corner shape, from the button beside Each corner, is Chromium only (†); others draw round corners. */
export const CornerShape: Story = {
  render: () => <Radius start={{ radius: "radius-2xl", cornerShape: "squircle" }} />
}

/** `-4` typed and Enter pressed: CSS takes no negative radius, so it's refused, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Radius start={{ radius: { px: 12 } }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Radius" })
    await userEvent.clear(field)
    await userEvent.type(field, "-4{Enter}")
  }
}
