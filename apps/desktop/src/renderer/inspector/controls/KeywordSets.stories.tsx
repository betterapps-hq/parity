import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useState } from "react"
import { Changed as MarkChanged, DoesNothing } from "./field-parts.tsx"
import { Field } from "./field-row.tsx"
import {
  alignChoices,
  caseChoices,
  ClipContentField,
  clipChoices,
  cursorChoices as cursorChoicesOf,
  cursorDrawer,
  cursorValue,
  drawStrokeStyle,
  type KeywordChoice,
  KeywordMenu,
  KeywordToggles,
  strokeStyleChoices,
  wrapChoices
} from "./keyword-sets.tsx"
import { Playground } from "./playground.tsx"
import { Card, PreviewStage } from "./preview-card.tsx"
import { cursorTokens } from "./stand-in-tokens.ts"
import { filledLayer, TextSample } from "./text-preview.tsx"
import { type KeywordValue, keywordWrites } from "./text-writes.ts"

/**
 * Keyword sets (PAR-186, design-options-values.md's Keyword sets): icon toggles or a menu, each option's hint naming
 * the CSS it writes and, in a menu, previewed on the canvas while it's hovered. Unset, the option the layer inherits or
 * starts with shows faintly (text Align shows Left faintly); setting one presses it fully. Mixed presses none. A keyword
 * outside the set, read from code (`match-parent`), is a chip marked Custom, edited as text and checked with
 * `CSS.supports`. The ⋯ menu has Inherit where the property inherits, Custom value, and Unset.
 */
const meta = {
  title: "Parity/Inspector/Controls/Fields/Keyword sets",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

const cursorChoices = cursorChoicesOf(cursorTokens)
const drawCursor = cursorDrawer(cursorTokens)

type Story = StoryObj<typeof meta>

/** A CSS property as React's style names it. */
const camel = (property: string) => property.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

/** CSS declarations by property as React's style names them, which a preview draws. */
interface DrawnStyle {
  [property: string]: string
}

/** The CSS a keyword value draws, for the preview: an option's declaration, or a custom keyword on the property. */
function drawn(value: KeywordValue | undefined, choices: readonly KeywordChoice[], property?: string): DrawnStyle {
  if (value === undefined) {
    return {}
  }

  if ("custom" in value) {
    return property === undefined ? {} : { [camel(property)]: value.custom }
  }

  const choice = choices.find((each) => each.value === value.option)

  if (!choice) {
    return {}
  }

  const [name, css] = choice.css.split(": ")

  return { [camel(name)]: choice.token ? cursorValue(choice.value, cursorTokens) : css }
}

function Toggles({
  label,
  property,
  choices,
  start,
  inherited,
  mixed,
  inherits = true,
  doesNothing,
  text
}: {
  label: string
  property: string
  choices: readonly KeywordChoice[]
  start?: KeywordValue
  inherited: string
  mixed?: boolean
  inherits?: boolean
  doesNothing?: string
  text?: string
}) {
  const [value, setValue] = useState(start)

  const control = (
    <Field label={label} mixed={mixed && value === undefined}>
      <KeywordToggles
        label={label}
        property={property}
        choices={choices}
        value={value}
        inherited={inherited}
        inheritedFrom="Plans"
        mixed={mixed}
        inherits={inherits}
        onChange={setValue}
      />
    </Field>
  )

  return (
    <Playground
      writes={keywordWrites(property, value, choices)}
      preview={<TextSample style={drawn(value, choices, property)}>{text}</TextSample>}
    >
      {doesNothing ? <DoesNothing reason={doesNothing}>{control}</DoesNothing> : control}
    </Playground>
  )
}

function Menu({
  label,
  property,
  choices,
  start,
  placeholder,
  inherits = false,
  moreLabel,
  draw,
  preview
}: {
  label: string
  property: string
  choices: readonly KeywordChoice[]
  start?: KeywordValue
  placeholder: string
  inherits?: boolean
  moreLabel?: string
  draw?: (choice: KeywordChoice) => ReactNode
  preview: (style: Record<string, string>) => ReactNode
}) {
  const [value, setValue] = useState(start)
  const [hovered, setHovered] = useState<string>()
  const style = hovered === undefined ? drawn(value, choices) : drawn({ option: hovered }, choices)

  return (
    <Playground writes={keywordWrites(property, value, choices)} preview={preview(style)}>
      <Field label={label}>
        <KeywordMenu
          label={label}
          property={property}
          choices={choices}
          value={value}
          placeholder={placeholder}
          inherits={inherits}
          moreLabel={moreLabel}
          draw={draw}
          onChange={setValue}
          onPreview={setHovered}
        />
      </Field>
    </Playground>
  )
}

/** Text Align unset: Left pressed faintly, inherited from Plans. Nothing is written. */
export const AlignUnset: Story = {
  render: () => <Toggles label="Align" property="text-align" choices={alignChoices} inherited="start" />
}

/** Center pressed: `text-center`. Left and Right write `text-start` and `text-end`, so they follow the direction. */
export const AlignSet: Story = {
  render: () => (
    <Toggles
      label="Align"
      property="text-align"
      choices={alignChoices}
      inherited="start"
      start={{ option: "center" }}
    />
  )
}

/** Layers with different alignments: none pressed, and Mixed after them. */
export const AlignMixed: Story = {
  render: () => <Toggles label="Align" property="text-align" choices={alignChoices} inherited="start" mixed />
}

/** `match-parent`, read from code, outside the set: a Custom chip, edited as text, never snapped to Left. */
export const AlignCustomFromCode: Story = {
  render: () => (
    <Toggles
      label="Align"
      property="text-align"
      choices={alignChoices}
      inherited="start"
      start={{ custom: "match-parent" }}
    />
  )
}

/** Inherit, from the ⋯ menu: shown in words, written `[text-align:inherit]`. */
export const AlignInherit: Story = {
  render: () => (
    <Toggles
      label="Align"
      property="text-align"
      choices={alignChoices}
      inherited="start"
      start={{ custom: "inherit" }}
    />
  )
}

/** On Auto width text, which is as wide as its line, Align does nothing: the row is dimmed, with why in its hint. */
export const AlignDoesNothing: Story = {
  render: () => (
    <Toggles
      label="Align"
      property="text-align"
      choices={alignChoices}
      inherited="start"
      start={{ option: "center" }}
      doesNothing="The text is Auto width, as wide as its line, so there's no room to align it in"
    />
  )
}

/** Case: Uppercase pressed. Small caps writes `font-variant-caps`, which has no utility of its own. */
export const Case: Story = {
  render: () => (
    <Toggles
      label="Case"
      property="text-transform"
      choices={caseChoices}
      inherited="none"
      start={{ option: "uppercase" }}
    />
  )
}

/** Wrap set to Balance, `text-balance`, from a menu, with Wrap faint while unset. */
export const Wrap: Story = {
  render: () => (
    <Menu
      label="Wrap"
      property="text-wrap"
      choices={wrapChoices}
      start={{ option: "balance" }}
      placeholder="Wrap"
      inherits
      preview={(style) => <TextSample style={{ width: 200, ...style }} />}
    />
  )
}

/** Pretty, which Firefox doesn't draw: † after the value and beside the option. */
export const WrapNotBaseline: Story = {
  render: () => (
    <Menu
      label="Wrap"
      property="text-wrap"
      choices={wrapChoices}
      start={{ option: "pretty" }}
      placeholder="Wrap"
      inherits
      preview={(style) => <TextSample style={{ width: 200, ...style }} />}
    />
  )
}

const cursorPreview = (style: Record<string, string>) => (
  <PreviewStage>
    <Card style={{ ...filledLayer, ...style }}>Hover me</Card>
  </PreviewStage>
)

/** Cursor unset: Auto, muted. The menu draws each cursor, and hovering an option shows it as the pointer. */
export const CursorUnset: Story = {
  render: () => (
    <Menu
      label="Cursor"
      property="cursor"
      choices={cursorChoices}
      placeholder="Auto"
      inherits
      draw={drawCursor}
      preview={cursorPreview}
    />
  )
}

/** Pointer: `cursor-pointer`. Hover the layer to see it. */
export const Cursor: Story = {
  render: () => (
    <Menu
      label="Cursor"
      property="cursor"
      choices={cursorChoices}
      start={{ option: "pointer" }}
      placeholder="Auto"
      inherits
      draw={drawCursor}
      preview={cursorPreview}
    />
  )
}

/**
 * A cursor token, `interactive`, first in the menu under Tokens: `cursor-(--cursor-interactive)`. It shows as its pill,
 * as a token field's does; the menu's Detach keeps the pointer it comes to, and Backspace on the field unsets it.
 */
export const CursorToken: Story = {
  render: () => (
    <Menu
      label="Cursor"
      property="cursor"
      choices={cursorChoices}
      start={{ option: "interactive" }}
      placeholder="Auto"
      inherits
      draw={drawCursor}
      preview={cursorPreview}
    />
  )
}

const strokePreview = (style: Record<string, string>) => (
  <PreviewStage>
    <Card style={{ ...filledLayer, border: "4px solid #0a0a0a", ...style }} />
  </PreviewStage>
)

/** Stroke's Style: Dashed, each option drawn as a line in it. */
export const StrokeStyle: Story = {
  render: () => (
    <Menu
      label="Style"
      property="border-style"
      choices={strokeStyleChoices}
      start={{ option: "dashed" }}
      placeholder="Solid"
      moreLabel="More styles"
      draw={drawStrokeStyle}
      preview={strokePreview}
    />
  )
}

/** Groove, from More styles, which has no utility: `[border-style:groove]`. */
export const StrokeStyleFromMore: Story = {
  render: () => (
    <Menu
      label="Style"
      property="border-style"
      choices={strokeStyleChoices}
      start={{ option: "groove" }}
      placeholder="Solid"
      moreLabel="More styles"
      draw={drawStrokeStyle}
      preview={strokePreview}
    />
  )
}

function Clip({ start }: { start?: KeywordValue }) {
  const [value, setValue] = useState(start)
  const style = drawn(value, clipChoices)

  return (
    <Playground
      writes={keywordWrites("overflow", value, clipChoices)}
      preview={
        <div className="grid size-64 place-items-center">
          <div className="relative h-32 w-48 rounded-xl border-2 border-[#2563eb] bg-white" style={style}>
            <div className="absolute -right-10 -bottom-8 h-24 w-32 rounded-lg bg-[#f54900]" />
            <div className="h-56" />
          </div>
        </div>
      }
    >
      <Field label="Clip content">
        <ClipContentField value={value} onChange={setValue} />
      </Field>
    </Playground>
  )
}

/** Clip content unset: the toggle off, Visible muted, and the orange child shows outside the layer. */
export const ClipContentUnset: Story = { render: () => <Clip /> }

/** Clip: `overflow-clip`, which doesn't make a scroll container, so a sticky layer inside still sticks. */
export const ClipContent: Story = { render: () => <Clip start={{ option: "clip" }} /> }

/** Scroll when needed: `overflow-auto`. */
export const ClipScrollWhenNeeded: Story = { render: () => <Clip start={{ option: "auto" }} /> }

/** Toggles changed from what they come from (PAR-1020): the dot on the corner of the row of options. */
export const AlignChanged: Story = {
  render: () => (
    <MarkChanged>
      <Toggles
        label="Align"
        property="text-align"
        choices={alignChoices}
        inherited="start"
        start={{ option: "center" }}
      />
    </MarkChanged>
  )
}

/** A menu changed from what it comes from (PAR-1020): the dot on the corner of its box. */
export const CursorChanged: Story = {
  render: () => (
    <MarkChanged>
      <Menu
        label="Cursor"
        property="cursor"
        choices={cursorChoices}
        start={{ option: "pointer" }}
        placeholder="Auto"
        inherits
        draw={drawCursor}
        preview={cursorPreview}
      />
    </MarkChanged>
  )
}
