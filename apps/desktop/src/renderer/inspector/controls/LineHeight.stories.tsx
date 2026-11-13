import type { Meta, StoryObj } from "@storybook/react-vite"
import { useState } from "react"
import { userEvent, within } from "storybook/test"
import { Field } from "./field-row.tsx"
import { LetterSpacingField, LineHeightField } from "./font-fields.tsx"
import { Playground } from "./playground.tsx"
import { leadingTokens, sizeTokens, trackingTokens } from "./stand-in-tokens.ts"
import { TextSample } from "./text-preview.tsx"
import { type LetterSpacing, letterSpacingWrites, type LineHeight, lineHeightWrites } from "./text-writes.ts"
import { type SizeToken } from "./tokens.ts"
import { mergeWrites } from "./writes.ts"

/**
 * Line height and letter spacing (PAR-186, design-options-values.md's Line height and letter spacing). Line height is
 * Auto for `normal`, a multiple with × (1.5), or pixels, where whole pixels are spacing steps (`leading-6`); a leading
 * token is a chip, and a typed % becomes its multiple. Unset beside a size token, the size's paired line height shows
 * faintly, labeled From size, and a set one is written beside the size (`text-sm/6`). A multiple above 4 asks whether
 * pixels were meant, and pixels below 4 a multiple. Letter spacing is a % of the font size, as Figma's is, written as
 * em, or px when typed in px; tracking tokens are chips. The unit after each opens its menu; the icons scrub. Each
 * story's text has the size its name gives (`text-sm` unless it says otherwise), set in Text's own Size field.
 */
const meta = {
  title: "Parity/Inspector/Rows/Line height and letter spacing",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

const sizeNamed = (name: string) => sizeTokens.find((size) => size.name === name)

/** The line height CSS draws, for the preview. */
function lineHeightCss(lineHeight: LineHeight | undefined, size: SizeToken | undefined): string | number | undefined {
  if (lineHeight === undefined) {
    return size ? `${size.lineHeight}px` : undefined
  }

  if ("keyword" in lineHeight) {
    return "normal"
  }

  if ("token" in lineHeight) {
    return leadingTokens.find((token) => token.name === lineHeight.token)?.multiple
  }

  if ("multiple" in lineHeight) {
    return lineHeight.multiple
  }

  return `${lineHeight.px}px`
}

function letterSpacingCss(spacing: LetterSpacing | undefined): string | undefined {
  if (spacing === undefined) {
    return undefined
  }

  if ("token" in spacing) {
    return `${trackingTokens.find((token) => token.name === spacing.token)?.em ?? 0}em`
  }

  return "em" in spacing ? `${spacing.em}em` : `${spacing.px}px`
}

function TextSpacing({
  size: sizeName,
  line,
  letter,
  mixed
}: {
  size?: string
  line?: LineHeight
  letter?: LetterSpacing
  mixed?: boolean
}) {
  const size = sizeName === undefined ? undefined : sizeNamed(sizeName)
  const fontSize = size?.px ?? 16
  const [lineHeight, setLineHeight] = useState(line)
  const [letterSpacing, setLetterSpacing] = useState(letter)

  return (
    <Playground
      writes={mergeWrites({
        lineHeight: lineHeightWrites(lineHeight, size),
        letterSpacing: letterSpacingWrites(letterSpacing)
      })}
      preview={
        <TextSample
          style={{
            fontSize,
            lineHeight: lineHeightCss(lineHeight, size),
            letterSpacing: letterSpacingCss(letterSpacing)
          }}
        />
      }
    >
      <Field label="Line height" mixed={mixed && lineHeight === undefined}>
        <LineHeightField value={lineHeight} size={size} fontSize={fontSize} mixed={mixed} onChange={setLineHeight} />
      </Field>
      <Field label="Letter spacing" mixed={mixed && letterSpacing === undefined}>
        <LetterSpacingField value={letterSpacing} fontSize={fontSize} mixed={mixed} onChange={setLetterSpacing} />
      </Field>
    </Playground>
  )
}

/** Unset beside `text-sm`: 1.429 shows faintly, labeled From size, since the size pairs a 20px line height. */
export const FromSize: Story = { render: () => <TextSpacing size="sm" /> }

/** FromSize, with what the control stores and writes as CSS and Tailwind beside it, updated as it's used. */
export const Demo: Story = { ...FromSize, parameters: { demo: true } }

/** 24px, a spacing step, beside `text-sm`: written `text-sm/6`. Up makes it 25px. */
export const Step: Story = { render: () => <TextSpacing size="sm" line={{ px: 24 }} /> }

/** A multiple, 1.5×: `text-sm/[1.5]`, a value of its own: Tokens offers leading-normal, the nearest, first. */
export const Multiple: Story = { render: () => <TextSpacing size="sm" line={{ multiple: 1.5 }} /> }

/** A leading token, `snug`, as a pill with what it comes to in its hint: `text-sm/snug`. Up and Down step the scale. */
export const Token: Story = { render: () => <TextSpacing size="sm" line={{ token: "snug" }} /> }

/** Auto, CSS's `normal`: the font's own line height. Choose it from the unit's menu, or type auto. */
export const Auto: Story = { render: () => <TextSpacing size="sm" line={{ keyword: "normal" }} /> }

/** Beside `display`, which pairs a weight and letter spacing too, the line height is its own class: `leading-7`. */
export const BesideASizeThatPairsMore: Story = { render: () => <TextSpacing size="display" line={{ px: 28 }} /> }

/** With no size token, it's written on its own: `leading-6`. */
export const NoSizeToken: Story = { render: () => <TextSpacing line={{ px: 24 }} /> }

/** `24` typed in ×: kept as 24×, with "Did you mean 24px?" and a button that makes it so. */
export const DidYouMeanPixels: Story = {
  render: () => <TextSpacing size="sm" line={{ multiple: 1.5 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Line height" })
    await userEvent.clear(field)
    await userEvent.type(field, "24{Enter}")
  }
}

/** `1.5` typed in px: kept as 1.5px, with "Did you mean 1.5×?". */
export const DidYouMeanMultiple: Story = {
  render: () => <TextSpacing size="sm" line={{ px: 24 }} />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Line height" })
    await userEvent.clear(field)
    await userEvent.type(field, "1.5{Enter}")
  }
}

/** `150%` typed: it becomes 1.5×, as it's written. */
export const PercentBecomesAMultiple: Story = {
  render: () => <TextSpacing size="sm" />,
  play: async ({ canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Line height" })
    await userEvent.type(field, "150%{Enter}")
  }
}

/** A tracking token, `tight`, as a chip, with −2.5% of the font size in its hint: `tracking-tight`. */
export const LetterSpacingToken: Story = { render: () => <TextSpacing size="sm" letter={{ token: "tight" }} /> }

/** 5% of the font size, written in em, `tracking-[0.05em]`: Tokens offers tracking-wider, the nearest, first. */
export const LetterSpacingPercent: Story = { render: () => <TextSpacing size="sm" letter={{ em: 0.05 }} /> }

/** −0.5px, typed in px, kept in px: `tracking-[-0.5px]`. */
export const LetterSpacingPixels: Story = { render: () => <TextSpacing size="sm" letter={{ px: -0.5 }} /> }

/** Layers with different line heights and letter spacing: Mixed in both, until something's typed. */
export const Mixed: Story = { render: () => <TextSpacing size="sm" mixed /> }
