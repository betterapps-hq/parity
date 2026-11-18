import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "./color-picker.tsx"
import { mixColor } from "./css-values.ts"
import { useTokenSets, useTokens, useUsedColors } from "./field-parts.tsx"
import { AllSidesGlyph, Field, OffsetGlyph, SectionButton } from "./field-row.tsx"
import { type LineStyle, LineStyleField } from "./line-style.tsx"
import { NumberField } from "./number-field.tsx"
import { Card, PreviewStage } from "./preview-card.tsx"
import { sideNumber, sideRules, type Sides, sidesWrites } from "./sides-writes.ts"
import { FourSidesField } from "./sides.tsx"
import { hexOf } from "./tokens.ts"
import { colorWrites, oneEverySide, type Writes } from "./writes.ts"

/*
 * Border and Outline, two sections where Stroke was one (PAR-932, PAR-1308), named as CSS names them. A border is part
 * of the box: it takes up room, so the layer grows and what's after it moves. An outline is drawn over the edge and
 * takes none, so nothing moves.
 */

/** A border as its section holds it: a color, a width for each side, and one style. */
export interface BorderValue {
  color?: string
  alpha?: number
  widths?: Sides
  style?: LineStyle
}

/** An outline as its section holds it: a color, one width, a style, and how far from the edge it's drawn. */
export interface OutlineValue {
  color?: string
  alpha?: number
  width?: number
  /** A border width token the width names, which the Width field shows until a number replaces it. */
  widthToken?: string
  style?: LineStyle
  offset?: number
}

/** The project's border color, as shadcn's theme names it, else its first color. */
function useNewColor() {
  const colors = useTokens("color").tokens

  return colors.find((token) => token.name === "border")?.name ?? colors[0]?.name ?? "border"
}

/**
 * Border: a title with + until it's set, which adds the project's usual border, `border border-border`, and − takes it
 * off. Then its width, one field or each side's, its style and its color, in the order CSS's `border` shorthand takes.
 */
export function BorderSection({ value, set }: { value: BorderValue; set: (next: BorderValue) => void }) {
  const newColor = useNewColor()
  const usedColors = useUsedColors()
  const bordered = value.color !== undefined || value.widths !== undefined

  const action = (
    <SectionButton
      adds={!bordered}
      what="border"
      onClick={() => set(bordered ? {} : { color: newColor, widths: oneEverySide })}
    />
  )

  return (
    <PanelSection title="Border" action={action}>
      {bordered && (
        <div className="flex flex-col gap-2.5">
          <FourSidesField
            label="Width"
            rules={sideRules.border}
            together="one"
            sides={value.widths ?? oneEverySide}
            onChange={(widths) => set({ ...value, widths })}
          />
          <Field label="Style">
            <LineStyleField label="Border style" value={value.style} onChange={(style) => set({ ...value, style })} />
          </Field>
          <Field label="Color">
            <ColorInput
              label="Border"
              used={usedColors}
              value={value.color}
              alpha={value.alpha}
              onChange={(color, alpha) => set({ ...value, color, alpha })}
            />
          </Field>
        </div>
      )}
    </PanelSection>
  )
}

/**
 * Outline: a title with + until it's set, which adds a 2px outline in the project's border color, and − takes it off.
 * Then its width, style and color, as `outline` takes them, and its offset: 0 draws it against the edge, outside; a positive offset leaves a gap, and a
 * negative one draws it inside the layer.
 */
export function OutlineSection({ value, set }: { value: OutlineValue; set: (next: OutlineValue) => void }) {
  const newColor = useNewColor()
  const usedColors = useUsedColors()
  const outlined = value.color !== undefined || value.width !== undefined || value.widthToken !== undefined

  const action = (
    <SectionButton adds={!outlined} what="outline" onClick={() => set(outlined ? {} : { color: newColor, width: 2 })} />
  )

  return (
    <PanelSection title="Outline" action={action}>
      {outlined && (
        <div className="flex flex-col gap-2.5">
          <Field label="Width" half>
            <NumberField
              label="Outline width"
              inner={<AllSidesGlyph />}
              whole
              min={0}
              unit="px"
              value={value.width}
              placeholder={value.widthToken ?? "1"}
              onChange={(width) => set({ ...value, width })}
            />
          </Field>
          <Field label="Style">
            <LineStyleField label="Outline style" value={value.style} onChange={(style) => set({ ...value, style })} />
          </Field>
          <Field label="Color">
            <ColorInput
              label="Outline"
              used={usedColors}
              value={value.color}
              alpha={value.alpha}
              onChange={(color, alpha) => set({ ...value, color, alpha })}
            />
          </Field>
          <Field label="Offset" half hint="Below 0 draws it inside the layer">
            <NumberField
              label="Outline offset"
              inner={<OffsetGlyph />}
              whole
              unit="px"
              value={value.offset}
              placeholder="0"
              onChange={(offset) => set({ ...value, offset })}
            />
          </Field>
        </div>
      )}
    </PanelSection>
  )
}

/** A border's CSS: its widths in the fewest properties, then its color and style. */
export function borderWrites(value: BorderValue): Writes {
  if (value.color === undefined && value.widths === undefined) {
    return { stored: undefined, css: [] }
  }

  const widths = sidesWrites("border", value.widths ?? oneEverySide)
  const color = colorWrites("border", value.color, value.alpha)
  const style = value.style && value.style !== "solid" ? [`border-style: ${value.style}`] : []

  return {
    stored: { widths: widths.stored, color: color.stored, ...(value.style && { style: { keyword: value.style } }) },
    css: [...widths.css, ...color.css, ...style]
  }
}

/** An outline's CSS: `outline` with its width, style and color, and `outline-offset` where it isn't 0. */
export function outlineWrites(value: OutlineValue): Writes {
  if (value.color === undefined && value.width === undefined) {
    return { stored: undefined, css: [] }
  }

  const color = colorWrites("border", value.color, value.alpha)
  const colorCss = color.css[0]?.replace("border-color: ", "") ?? "currentColor"
  const offset = value.offset ? [`outline-offset: ${value.offset}px`] : []

  return {
    stored: {
      width: { value: `${value.width ?? 1}px` },
      color: color.stored,
      ...(value.style && { style: { keyword: value.style } }),
      ...(value.offset && { offset: { value: `${value.offset}px` } })
    },
    css: [`outline: ${value.width ?? 1}px ${value.style ?? "solid"} ${colorCss}`, ...offset]
  }
}

/**
 * Plans with a line under it in a column, drawn with a border, an outline, or both: a border grows the card and moves
 * the line down; an outline leaves both where they are.
 */
export function LinePreview({ border, outline }: { border?: BorderValue; outline?: OutlineValue }) {
  const sets = useTokenSets()

  const colorOf = (color: string | undefined, alpha: number | undefined) =>
    mixColor(hexOf(color, sets.color), alpha) ?? "transparent"

  const widths = border?.widths?.map((side) => sideNumber(side, sets.borderWidth) ?? 0)
  const bordered = border !== undefined && (border.color !== undefined || border.widths !== undefined)
  const outlined = outline !== undefined && (outline.color !== undefined || outline.width !== undefined)

  return (
    <PreviewStage>
      <div className="relative flex flex-col items-center gap-2">
        <Card
          style={{
            background: hexOf("card", sets.color) ?? "#ffffff",
            borderRadius: 12,
            boxSizing: "content-box",
            width: 160,
            height: 80,
            ...(bordered && {
              borderColor: colorOf(border.color, border.alpha),
              borderStyle: border.style ?? "solid",
              borderWidth: (widths ?? [1, 1, 1, 1]).map((px) => `${px}px`).join(" ")
            }),
            ...(outlined && {
              outline: `${outline.width ?? 1}px ${outline.style ?? "solid"} ${colorOf(outline.color, outline.alpha)}`,
              outlineOffset: outline.offset ?? 0
            })
          }}
        />
        <div aria-hidden className="h-2 w-40 rounded-full bg-neutral-900/30" />
      </div>
    </PreviewStage>
  )
}
