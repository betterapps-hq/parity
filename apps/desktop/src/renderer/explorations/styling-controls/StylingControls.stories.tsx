import type { Meta, StoryObj } from "@storybook/react-vite"
import { TokenColorEditor } from "./color-picker.tsx"
import { colorTokens } from "./data.ts"
import { StylingPrototype } from "./prototype.tsx"

/**
 * The styling controls designers expect from Figma, proposed for the inspector (PAR-186): a color picker that answers
 * with the nearest token, opacity on a token color, radius per corner, stroke per side, blur and backdrop blur, aspect
 * ratio, a text layer's tag, grid tracks and placement, baseline alignment and reversed order, and a typed frame size.
 *
 * Each story is the same prototype, a stand-in for Plans on the canvas and the inspector beside it, starting on one
 * control. Every control works: the stand-in redraws as it changes. Styles stay locked to the project's tokens, so a
 * freely picked color is answered with the token nearest it, and only the Tokens panel's picker writes a raw color,
 * into the token itself.
 */
const meta = {
  title: "Parity/Explorations/Styling controls",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * Plans, a card with a translucent fill, per-corner radius and a backdrop blur over shapes behind it, so the fill's
 * opacity (`bg-card/70`) and the blur show. Radius per corner and Stroke per side are toggles beside their rows, as
 * Padding's per side is; the corners sit where they are on the layer. Stroke widths switch between px and rem.
 */
export const Appearance: Story = {
  render: () => (
    <StylingPrototype
      start={{
        draft: {
          background: "card",
          backgroundAlpha: 70,
          radius: ["radius-2xl", "radius-2xl", "radius-sm", "radius-sm"],
          border: "border",
          borderWidth: [0, 0, 2, 0],
          backdropBlur: "blur-md"
        }
      }}
    />
  )
}

/**
 * The fill's picker on Custom: the saturation and brightness square, the hue strip, hex and HSB, and the eyedropper.
 * Below it, the token nearest the picked color, with Use for the color as it is and Use for the token; when they're
 * the same color, only the token is offered. In this design starts the square from a color the design already uses.
 * Drag in the square to see the suggestion follow.
 */
export const PickingAColor: Story = {
  render: () => <StylingPrototype start={{ draft: { background: "chart-2" }, fillPicker: "custom" }} />
}

/**
 * Plans filled with a plain blue, #2f6fed, that isn't one of the project's tokens. Its swatch is round rather than
 * square, the line under Fill says it isn't a token, and Use blue-600 there swaps in the nearest token in one click.
 * Opacity is written into the plain color's own alpha (#2f6fed80) rather than after a token's name.
 */
export const PlainColor: Story = {
  render: () => <StylingPrototype start={{ draft: { background: "#2f6fed", radius: "radius-lg" } }} />
}

/**
 * The same plain blue in a project set to Tokens only: the line under Fill turns red and says the project takes tokens
 * only, and the picker's Custom tab offers only the nearest token, never the color as it is.
 */
export const TokensOnly: Story = {
  render: () => (
    <StylingPrototype
      start={{ draft: { background: "#2f6fed", radius: "radius-lg" }, tokensOnly: true, fillPicker: "custom" }}
    />
  )
}

/** The fill's picker on Tokens: the project's colors with swatches. The opacity after the button stays as it was. */
export const PickingAToken: Story = {
  render: () => (
    <StylingPrototype start={{ draft: { background: "secondary", backgroundAlpha: 50 }, fillPicker: "tokens" }} />
  )
}

/** The Tokens panel's picker on primary: the same square, strip and fields, writing the token's own value on Save. */
export const EditingAColorToken: Story = {
  render: () => (
    <div className="grid h-screen place-items-center bg-background text-foreground">
      <TokenColorEditor token={colorTokens.find((token) => token.name === "chart-2")!} />
    </div>
  )
}

/**
 * Plans as a grid: three columns of 1fr, 2fr and at least 120px, and one auto row. Each track is a chip that opens to
 * Fill, Fixed, Hug, Min, Max or Range (CSS's `minmax()`, at least a length, then a share) and its size; + adds one.
 * Fixed and Range lengths are typed in px or rem. Equal Fill columns show as a count instead, as Grid placement's do,
 * until Edit tracks opens this list.
 */
export const GridTracks: Story = {
  render: () => (
    <StylingPrototype
      start={{
        draft: {
          background: "muted",
          radius: "radius-lg",
          columns: [
            { kind: "fr", value: 1 },
            { kind: "fr", value: 2 },
            { kind: "range", min: 120, max: 1 }
          ],
          rows: [{ kind: "auto" }]
        }
      }}
    />
  )
}

/**
 * Plans as a responsive grid: Repeat to fit, beside Columns, lays out as many columns as fit, each at least 160px, so
 * the grid reflows as the frame narrows (CSS's `repeat(auto-fit, minmax(160px, 1fr))`, Webflow's auto-fit). Figma has
 * no such grid. Turn it off to go back to a list of tracks.
 */
export const RepeatToFit: Story = {
  render: () => (
    <StylingPrototype start={{ draft: { background: "muted", radius: "radius-lg", columns: { fit: 160 } } }} />
  )
}

/**
 * Pro plan selected inside Plans' grid: the column and row it starts at and how many it spans, in place of Align self.
 * A negative start counts from the end, and All spans every column, as a header across the grid does. Click Pro plan
 * on the canvas to go back to Plans, whose three equal columns show as a count with Edit tracks beside it.
 */
export const GridPlacement: Story = {
  render: () => (
    <StylingPrototype
      start={{
        child: true,
        draft: {
          background: "muted",
          radius: "radius-lg",
          columns: [
            { kind: "fr", value: 1 },
            { kind: "fr", value: 1 },
            { kind: "fr", value: 1 }
          ],
          colStart: 2,
          colSpan: 2
        }
      }}
    />
  )
}

/**
 * Plans as a horizontal row, reversed and aligned on its text's baseline: Pro plan's larger text lines up with the
 * others' first line. Reverse direction is set from Layout's More (the dots in its title) and then shows beside Wrap.
 * The nine-spot box stays as it looks: its left spots are still the left, though a reversed row writes flex-end there.
 * Baseline sits under the box, and shows only for a horizontal layout, where it means something.
 */
export const BaselineAndReverse: Story = {
  render: () => (
    <StylingPrototype
      start={{
        draft: {
          background: "muted",
          radius: "radius-lg",
          direction: "row",
          reverse: true,
          justify: "start",
          align: "baseline"
        }
      }}
    />
  )
}

/**
 * Plans locked at 16:9, with the headline as Heading 2. The lock sits between W and H, as in Figma UI3; locking keeps
 * the ratio the layer has, leaves H to it (Auto), and shows the ratio as its own row with named ratios. Typing H while
 * locked changes W to keep the ratio. Unlock to fix the height where the ratio left it. The tag is at the top of Text.
 */
export const AspectRatioAndTag: Story = {
  render: () => (
    <StylingPrototype start={{ draft: { background: "muted", radius: "radius-lg", aspect: "16 / 9", tag: "h2" } }} />
  )
}

/**
 * Pricing's frame in Desktop, typed: width and height, with presets. Height left empty hugs the content. The unit after
 * a size switches it between px and rem, as the canvas's type box does, so 1280px shows as 80rem; either can be typed.
 */
export const FrameSize: Story = { render: () => <StylingPrototype start={{ draft: {}, frame: true }} /> }
