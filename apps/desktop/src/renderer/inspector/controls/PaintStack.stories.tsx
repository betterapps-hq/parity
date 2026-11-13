import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { expect, userEvent, within } from "storybook/test"
import type { GradientPaint, PaintEntry, Stop } from "./lists-data.ts"
import { paintWrites } from "./lists-writes.ts"
import { PaintPreview, PaintStack } from "./paint-stack.tsx"
import { Playground } from "./playground.tsx"
import { PreviewStage } from "./preview-card.tsx"
import { gradientTokens } from "./stand-in-tokens.ts"
import { mixedWrites } from "./writes.ts"

/**
 * Fill's paint stack (PAR-652's Paint stack): solids, gradients and images, top first, as CSS paints them. Each entry is
 * its preview, its type and its value or token, which open its editor, then its alpha, the eye and −; with two fills or
 * more, drag the handle to reorder. A solid is the color field, whose swatch opens the color picker. + is a menu of the
 * five types, each drawn as the fill it adds, in the project's palette (`bg-blue-600`, or white to blue-600); the fill
 * goes on top with its editor open. A gradient's editor names its kind in a menu, then its token, on the shared field,
 * then the bar of stops (click to add, drag to move, drag off to remove, drag the diamond for a color hint; from the
 * keyboard the stops and diamonds are sliders), its settings named above each (the angle
 * with its dial, the center, how colors blend, Repeat), and apart from them the Stops list, with Flip.
 * An image's searches the project's images and Unsplash's, takes one dropped, pasted or uploaded, then has the fit and
 * its position in the box. An image dropped on the section adds an image fill. The bottom solid is written as
 * `background-color`, the rest as `background-image` layers.
 */
const meta = {
  title: "Parity/Inspector/Lists/Paint stack",
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
  // The order a fill's being carried over, drawn before it's let go; what's written stays as it is till then.
  const [carried, setCarried] = useState<PaintEntry[]>()

  return (
    <Playground
      writes={isMixed ? mixedWrites : paintWrites(entries, gradientTokens)}
      preview={
        <PreviewStage>
          <PaintPreview entries={isMixed ? [] : (carried ?? entries)} />
        </PreviewStage>
      }
    >
      <PaintStack
        entries={entries}
        mixed={isMixed}
        tokensOnly={tokensOnly}
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

/** No fills yet: Fill is a title with +, a menu of the five types, each drawn as the fill it adds. */
export const Empty: Story = { render: () => <Paints start={[]} /> }

/** One solid, a token: `bg-card`, written as the background color. Its alpha is the % after the chip. */
export const Solid: Story = { render: () => <Paints start={[solid("fill", "card")]} /> }

/** A solid of its own, #2f6fed at 80%, with no mark: Tokens offers the nearest first, then Create token. */
export const SolidOffTheSystem: Story = { render: () => <Paints start={[solid("fill", "#2f6fed", 80)]} /> }

/**
 * Locked to tokens (`tokensOnly`), as a company can ask so its apps match its design language. Unlocked, the default, a
 * fill takes any color. The solid's picker is only the tokens, typing searches them, and the blue already there is
 * refused with the nearest token under it.
 */
export const LockedToTokens: Story = {
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
 * the utility (`bg-linear-[…]`), and Create token, under it and in the token's list, makes it a token by the name
 * given.
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

/**
 * A gradient token, `gradient-brand`, as a chip in the editor's Token field, as any token field holds one: its list
 * offers the others, Custom and Detach, Up and Down step through them, and editing a stop detaches it:
 * `bg-(image:--gradient-brand)`.
 */
export const FromAGradientToken: Story = {
  render: () => <Paints start={[gradient("top", { ...blueToTeal, token: "gradient-brand" })]} openId="top" />
}

/**
 * An image over the card color, filling the box from its center: `bg-[url(/images/hero.jpg)] bg-cover bg-center`. Its
 * editor searches the project's images and Unsplash's (drawn stand-ins until it's connected), with Upload first; drop or
 * paste an image anywhere on it, or on the Fill section to add a fill, and it's copied into the project and used.
 */
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
 * can't hold, so they're one arbitrary `bg-[…]`. A solid above the bottom is
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

/**
 * The bar of stops from the keyboard: Enter on the bar adds a stop in the widest gap, at 50%, rather than where a
 * pointer would; the stops are sliders that the arrow keys move; and Home centers a midpoint moved off the middle.
 */
export const StopsFromTheKeyboard: Story = {
  render: () => <Paints start={[gradient("top", blueToTeal)]} openId="top" />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body)
    const bar = await page.findByRole("button", { name: "Add a stop" })
    bar.focus()
    await userEvent.keyboard("{Enter}")
    const added = await page.findByRole("slider", { name: "Stop 2" })
    await expect(added).toHaveAttribute("aria-valuenow", "50")
    added.focus()
    await userEvent.keyboard("{ArrowRight}")
    await expect(added).toHaveAttribute("aria-valuenow", "51")
    const midpoint = page.getByRole("slider", { name: "Midpoint between stop 1 and 2" })
    midpoint.focus()
    await userEvent.keyboard("{ArrowLeft}")
    await expect(midpoint).toHaveAttribute("aria-valuetext", "25%")
    await userEvent.keyboard("{Home}")
    await expect(midpoint).toHaveAttribute("aria-valuetext", "26%, centered")
  }
}
