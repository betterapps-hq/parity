import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import type { GradientPaint, PaintEntry, Stop } from "./lists-data.ts"
import { paintWrites } from "./lists-writes.ts"
import { PaintPreview, PaintStack } from "./paint-stack.tsx"
import { Playground, PreviewStage } from "./playground.tsx"
import type { GradientToken } from "./tokens.ts"
import { mixedWrites } from "./writes.ts"

/**
 * Fill's paint stack (PAR-652's Paint stack): solids, gradients and images, top first, as CSS paints them. Each entry is
 * its preview, its type and its value or token, which open its editor, then its alpha, the eye and −; with two fills or
 * more, drag the handle to reorder. A solid is the color field, whose swatch opens the color picker. The editor and the
 * picker start with the fill's five types by glyph, as Figma's fill picker does. + adds the
 * project's usual fill, `bg-background`, on top. A gradient's editor has the bar of stops (click to add, drag to move,
 * drag off to remove, drag the diamond for a color hint), the angle with its dial, Flip and Rotate 90°, Repeat, how
 * colors blend, and the Stops list; an image's has the project's images, the fit and its position in the box. The
 * bottom solid is written as `background-color`, the rest as `background-image` layers.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Paint stack",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

function Paints({
  start,
  mixed = false,
  tokensOnly,
  openId
}: {
  start: PaintEntry[]
  mixed?: boolean
  tokensOnly?: boolean
  openId?: string
}) {
  const [entries, setEntries] = useState(start)
  const [isMixed, setMixed] = useState(mixed)
  const [saved, setSaved] = useState<GradientToken[]>([])

  return (
    <Playground
      writes={isMixed ? mixedWrites : paintWrites(entries, saved)}
      preview={
        <PreviewStage>
          <PaintPreview entries={isMixed ? [] : entries} saved={saved} />
        </PreviewStage>
      }
    >
      <PaintStack
        entries={entries}
        mixed={isMixed}
        tokensOnly={tokensOnly}
        saved={saved}
        openId={openId}
        onSave={(token) => setSaved((list) => [...list, token])}
        onChange={(next) => {
          setMixed(false)
          setEntries(next)
        }}
      />
    </Playground>
  )
}

const stop = (id: string, position: number, color: string, alpha?: number, hint?: number): Stop => ({
  id,
  position,
  color,
  alpha,
  hint
})

const solid = (id: string, color: string, alpha?: number): PaintEntry => ({
  id,
  paint: { kind: "solid", color, alpha }
})

const gradient = (id: string, paint: GradientPaint): PaintEntry => ({ id, paint })

const blueToTeal: GradientPaint = {
  kind: "linear",
  angle: 90,
  stops: [stop("a", 0, "blue-500"), stop("b", 100, "teal-600")]
}

/** No fills yet: Fill is a title with +, which adds `bg-background` on top. */
export const Empty: Story = { render: () => <Paints start={[]} /> }

/** One solid, a token: `bg-card`, written as the background color. Its alpha is the % after the chip. */
export const Solid: Story = { render: () => <Paints start={[solid("fill", "card")]} /> }

/** A solid of its own, #2f6fed at 80%, with no mark: Tokens offers the nearest first, then Create token. */
export const SolidOffTheSystem: Story = { render: () => <Paints start={[solid("fill", "#2f6fed", 80)]} /> }

/** In a project set to Tokens only, the blue is refused, with the nearest token under it. */
export const RefusedByTokensOnly: Story = {
  render: () => <Paints start={[solid("fill", "#2f6fed")]} tokensOnly />
}

/**
 * A linear gradient over the card color, its editor open: `bg-card bg-linear-to-r from-blue-500 to-teal-600`. Click the
 * bar to add a stop, drag one off to remove it, and type an angle such as 45, `0.25turn` or `to bottom`.
 */
export const LinearGradient: Story = {
  render: () => <Paints start={[gradient("top", blueToTeal), solid("base", "card")]} openId="top" />
}

/** Three stops at 45°: `bg-linear-45 from-blue-500 via-chart-4 via-40% to-chart-1`, the middle stop moved to 40%. */
export const ThreeStops: Story = {
  render: () => (
    <Paints
      start={[
        gradient("top", {
          kind: "linear",
          angle: 45,
          stops: [stop("a", 0, "blue-500"), stop("b", 40, "chart-4"), stop("c", 100, "chart-1")]
        })
      ]}
      openId="top"
    />
  )
}

/**
 * Four stops and a color hint between the first two: too long for Tailwind's from, via and to, so it's written inside
 * the utility (`bg-linear-[…]`), and Save as token offers to name it.
 */
export const LongGradient: Story = {
  render: () => (
    <Paints
      start={[
        gradient("top", {
          kind: "linear",
          angle: 25,
          stops: [
            stop("a", 5, "destructive", undefined, 30),
            stop("b", 60, "chart-4"),
            stop("c", 90, "teal-600"),
            stop("d", 100, "blue-600")
          ]
        })
      ]}
      openId="top"
    />
  )
}

/** Radial, centered at 30% 20%: `bg-radial-[at_30%_20%]`, fading the card's color out. */
export const RadialGradient: Story = {
  render: () => (
    <Paints
      start={[
        gradient("top", {
          kind: "radial",
          angle: 0,
          center: [30, 20],
          stops: [stop("a", 0, "chart-4"), stop("b", 100, "chart-4", 0)]
        }),
        solid("base", "card")
      ]}
      openId="top"
    />
  )
}

/** Angular from 90°, `conic-gradient` in CSS: `bg-conic-90`. */
export const AngularGradient: Story = {
  render: () => (
    <Paints
      start={[
        gradient("top", {
          kind: "angular",
          angle: 90,
          stops: [stop("a", 0, "chart-1"), stop("b", 50, "chart-2"), stop("c", 100, "chart-1")]
        })
      ]}
      openId="top"
    />
  )
}

/** Repeating stripes, blended in OKLCH: written as an arbitrary value, since there's no repeating utility. */
export const Repeating: Story = {
  render: () => (
    <Paints
      start={[
        gradient("top", {
          kind: "linear",
          angle: 135,
          repeat: true,
          interpolation: "oklch",
          stops: [stop("a", 0, "muted"), stop("b", 10, "muted"), stop("c", 10, "card"), stop("d", 20, "card")]
        })
      ]}
      openId="top"
    />
  )
}

/** A gradient token, `gradient-brand`, as a chip: `bg-(image:--gradient-brand)`. Editing a stop detaches it. */
export const FromAGradientToken: Story = {
  render: () => <Paints start={[gradient("top", { ...blueToTeal, token: "gradient-brand" })]} openId="top" />
}

/** An image over the card color, filling the box from its center: `bg-[url(/images/hero.jpg)] bg-cover bg-center`. */
export const ImageFill: Story = {
  render: () => (
    <Paints
      start={[
        { id: "top", paint: { kind: "image", src: "/images/hero.jpg", fit: "fill", position: [50, 50] } },
        solid("base", "card")
      ]}
      openId="top"
    />
  )
}

/** A pattern tiled at its own size, from the top left: `bg-auto bg-top-left bg-repeat`. */
export const ImageTiled: Story = {
  render: () => (
    <Paints
      start={[{ id: "top", paint: { kind: "image", src: "/images/pattern.svg", fit: "tile", position: [0, 0] } }]}
    />
  )
}

/**
 * A translucent solid and a gradient over an image: more than one layer above the bottom, which Tailwind's utilities
 * can't hold, so they're one arbitrary `bg-[…]`, and the section says so. A solid above the bottom is
 * `linear-gradient(c, c)`.
 */
export const SeveralLayers: Story = {
  render: () => (
    <Paints
      start={[
        solid("tint", "primary", 20),
        gradient("fade", { kind: "linear", angle: 180, stops: [stop("a", 0, "card", 0), stop("b", 100, "card")] }),
        { id: "photo", paint: { kind: "image", src: "/images/team.png", fit: "fill", position: [50, 50] } }
      ]}
    />
  )
}

/** The gradient's eye is off: it stays in the file but isn't drawn or written, so only `bg-card` is. */
export const Hidden: Story = {
  render: () => <Paints start={[{ ...gradient("top", blueToTeal), off: true }, solid("base", "card")]} />
}

/** Layers with different fills: "Several fills", until + replaces them all with one. */
export const Mixed: Story = { render: () => <Paints start={[]} mixed /> }

/** `sideways` typed as the angle and Enter pressed: it isn't an angle, so it stays, outlined, with the reason under it. */
export const InvalidAsTyped: Story = {
  render: () => <Paints start={[gradient("top", blueToTeal)]} openId="top" />,
  play: async ({ canvasElement }) => {
    const field = await within(canvasElement.ownerDocument.body).findByRole("textbox", { name: "Angle" })
    await userEvent.clear(field)
    await userEvent.type(field, "sideways{Enter}")
  }
}
