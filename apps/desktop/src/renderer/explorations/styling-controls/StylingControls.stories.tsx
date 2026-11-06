import type { Meta, StoryObj } from "@storybook/react-vite"
import { TokenColorEditor } from "./color-picker.tsx"
import { colorTokens } from "./data.ts"
import { StylingPrototype } from "./prototype.tsx"

/**
 * The styling controls designers expect from Figma, proposed for the inspector (PAR-186): a color picker with the
 * nearest token, opacity on a color, radius per corner, stroke per side, blur and backdrop blur, aspect ratio, a text
 * layer's tag, grid tracks and placement, baseline alignment and reversed order, and a typed frame size. The fields
 * follow PAR-652's design options pages (design-options-fields.md and design-options-values.md).
 *
 * Each story is the same prototype, a stand-in for Plans on the canvas and the inspector beside it, starting on one
 * control. Every control works: the stand-in redraws as it changes. A token shows as a chip, then what it comes to,
 * faintly (`lg 10px`), or in the hover where the field is narrow, as a corner's is. A color that isn't a token is kept
 * as typed and marked, with the nearest token one click away, and a project set to Tokens only refuses it. Input a field
 * can't read stays, outlined in the error color with the reason under it; Escape or leaving puts the value back and
 * says so.
 */
const meta = {
  title: "Parity/Explorations/Styling controls",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/**
 * Plans, a card with a translucent fill, per-corner radius and a backdrop blur over shapes behind it, so the fill's
 * opacity (`bg-card/70`) and the blur show. Fill, radius and blur tokens show as chips. Radius per corner is a toggle
 * beside its row, with the corners laid out where they are on the layer. Stroke's sides are Figma's menu after Width:
 * All, Top, Bottom, Left, Right or Custom; this card has a bottom stroke only. Custom's four fields are narrow, so their
 * unit shows on hover. Stroke widths switch between px and rem. Stroke's − takes it off, and its + adds `border-border`
 * at 1px, as a layer without a stroke starts.
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
 * The fill's picker on Custom: the saturation and brightness square, the hue and opacity strips, the eyedropper, and
 * the model menu (Hex, RGB, HSL, HSB, OKLCH) with its fields; a color picked in OKLCH is written as `oklch()`. Custom
 * edits the fill as you go, as a plain color. Below, the nearest token, with Use to swap it in, and In this design,
 * the colors the design already uses. Drag in the square to see the nearest token follow.
 */
export const PickingAColor: Story = {
  render: () => <StylingPrototype start={{ draft: { background: "chart-2" }, fillPicker: "custom" }} />
}

/**
 * Plans filled with a plain blue, #2f6fed, that isn't one of the project's tokens. Fill shows it in short form,
 * `2F6FED`, with a hollow mark after it: its menu has Use nearest (blue-600), Create token, which names a token with
 * this color as its value, and Allow here, which asks why and fills the mark, with the reason in its hover. The reason
 * is kept with the value, so it moves with the layer. Opacity is part of a plain color (#2f6fed80), where a
 * token's is written after its name. The picker opens on Custom for a plain color, and on Tokens for a token.
 */
export const PlainColor: Story = {
  render: () => <StylingPrototype start={{ draft: { background: "#2f6fed", radius: "radius-lg" } }} />
}

/**
 * The same plain blue in a project set to Tokens only: Fill is outlined in the error color, with "Not a token. Nearest:
 * blue-600" under it, and the picker's Custom tab doesn't change the fill; it offers only the nearest token. The hollow
 * mark's menu still has Allow here, which asks why and keeps the blue as an exception, with the reason in the filled
 * mark's hover.
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
 * Plans as a grid: three columns, Fill, Fill ×2 and 120–Fill (at least 120px, then a share), and one Hug row. Each
 * track is a chip, in words, that opens to Fill, Fixed, Hug, Min, Max or Range (CSS's `minmax()`) and its size; + adds
 * one. A Fill track is drawn as `minmax(0, 1fr)`, as `grid-cols-3` writes it, so long content can't widen it.
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
 * Pro plan selected inside Plans' grid. Its Size has the rows a grid adds: W and H (Fill stretches it across its cell),
 * Align self and Justify self, which show what they come to while unset (Stretch, muted, or Left once W is Hug), then
 * Columns and Rows, each how many it spans with the line it starts at beside it. A
 * negative start counts from the end, and All spans every track, as a header across the grid does. Size's More has End
 * lines, which places it by its start and end lines instead (`2 / 4`), and Area, for a grid with named areas. Click Pro
 * plan on the canvas to go back to Plans, whose three equal columns show as a count with Edit tracks beside it.
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
 * Baseline sits under the box, on the text's first line or its last (`items-baseline-last`). It shows for a horizontal
 * layout, where it means something; switch to vertical with it on and it stays, dimmed, saying it does nothing.
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
 * the ratio the layer has and frees H, which shows as Auto, set by Aspect ratio. The ratio shows as its own row:
 * `16:9 Video`, typed as 16:9, 16/9, 16x9 or 1.78, with named ratios in its menu; type `wide` to see a ratio refused.
 * Typing H while locked changes W to keep the ratio; choosing Hug or Fill for H unlocks it. Unlock to fix the height
 * where the ratio left it.
 *
 * W and H are size fields whose unit opens one menu: Fixed, Hug or Fill; px, % or rem; Min and Max content under More
 * units; and Add min and Add max, which each add a row under the size. A mode shows what it comes to after it, faintly
 * (Hug 249). Up and Down step a length to the next whole spacing step, 4px, and make a mode Fixed at its size first.
 * The tag is at the top of Text.
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
