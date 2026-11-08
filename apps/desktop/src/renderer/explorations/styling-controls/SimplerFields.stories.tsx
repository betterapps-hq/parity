import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useState } from "react"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { AppearanceSection, FillSection } from "./controls.tsx"
import type { Draft, Length } from "./data.ts"
import { ProjectTokens } from "./field-parts.tsx"
import {
  colorInspiration,
  keywordInspiration,
  layoutInspiration,
  listInspiration,
  numberInspiration,
  sidesInspiration,
  statesInspiration,
  typographyInspiration
} from "./inspiration-data.ts"
import { type Example, Inspiration } from "./inspiration.tsx"
import { OpacityField } from "./opacity-blend.tsx"
import { Readout } from "./playground.tsx"
import { type Side, type Sides, sideRules, sidesWrites } from "./sides-writes.ts"
import { FourSidesField } from "./sides.tsx"
import {
  CaptionButton,
  CornerGlyph,
  type GroupLine,
  type Holds,
  type NumberToken,
  SimpleColor,
  SimpleGroup,
  SimpleNumber,
  SimpleSection
} from "./simpler.tsx"
import { type Opacity, opacityWrites } from "./text-writes.ts"
import { colorTokens, opacityTokens, radiusTokens, spacingTokens } from "./tokens.ts"
import { colorWrites, mergeWrites, radiusWrites, type Writes } from "./writes.ts"

/**
 * A spike (PAR-186) on simpler fields, after "this feels so busy: when you hover everything shifts, and I don't know
 * what the square, the circle or the hexagon are". Each story puts today's controls beside a simpler version of the
 * same thing, sharing one value, then the states side by side, then how Figma, Framer, Webflow, Penpot, Plasmic and
 * Wix Studio build that type of field, with their own screenshots.
 *
 * What the simpler field changes:
 * - Names in words above the fields, two to a row; dragging a name changes its value. No icon to learn. Fields that
 *   share a name (sides, corners) carry a letter or a corner inside.
 * - A filled box with no border; pixels aren't shown, other units are.
 * - A value of its own has no mark. A token is a named pill in the value's place.
 * - Hovering changes only the fill. The field's one button (Tokens, or Detach on a token) sits over the end of the
 *   box, in room the box always keeps, and fades in, so nothing moves.
 * - Only real problems show: a missing token, a replaced one, and a value Tokens only refuses.
 *
 * Keyword pickers, typography, layer lists, layout and states have their inspiration here first; their simpler
 * versions follow once the number field is settled.
 */
const meta = {
  title: "Parity/Explorations/Simpler fields",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/* Converting between today's stored forms and what a simpler field holds */

const fromLength = (value: Length | undefined): Holds => {
  if (value === undefined) return undefined
  return typeof value === "string" ? { token: value } : { value: value.px }
}
const toLength = (holds: Holds): Length | undefined => {
  if (holds === undefined) return undefined
  return "token" in holds ? holds.token : { px: holds.value }
}
const fromOpacity = (value: Opacity | undefined): Holds => {
  if (value === undefined) return undefined
  return "token" in value ? { token: value.token } : { value: value.percent }
}
const toOpacity = (holds: Holds): Opacity | undefined => {
  if (holds === undefined) return undefined
  return "token" in holds ? { token: holds.token } : { percent: holds.value }
}
const fromSide = (side: Side): Holds => {
  if (side === undefined || side === "auto" || "percent" in side) return undefined
  return "token" in side ? { token: side.token } : { value: side.number }
}
const toSide = (holds: Holds): Side => {
  if (holds === undefined) return undefined
  return "token" in holds ? { token: holds.token } : { number: holds.value }
}

const opacityAsNumbers: NumberToken[] = opacityTokens.map((token) => ({ ...token, px: token.percent }))
const radiusScrub = { step: 1, shiftStep: 10, min: 0 }
const opacityScrub = { step: 1, shiftStep: 10, min: 0, max: 100 }
const spacingScrub = { spacing: true as const, min: 0 }

/* The page */

/** The story's page: today's panel and the simpler one side by side, what they write, the states, then the others. */
function Page({
  now,
  simpler,
  writes,
  states,
  inspiration
}: {
  now?: ReactNode
  simpler?: ReactNode
  writes?: Writes
  states?: ReactNode
  inspiration: ReactNode
}) {
  return (
    <TooltipProvider>
      <ProjectTokens>
        <div className="flex min-h-screen flex-col gap-8 bg-background p-6 text-foreground">
          {(now || simpler) && (
            <div className="flex flex-wrap items-start gap-6">
              {now && <Panel title="Now">{now}</Panel>}
              {simpler && <Panel title="Simpler">{simpler}</Panel>}
              {writes && <Readout writes={writes} />}
            </div>
          )}
          {states}
          {inspiration}
        </div>
      </ProjectTokens>
    </TooltipProvider>
  )
}

/** A panel at the inspector's width, named for the version it shows. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex w-80 shrink-0 flex-col gap-2">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="rounded-lg border">{children}</div>
    </section>
  )
}

/** The states, one to a row: what each is, then today's control and the simpler one in it. */
function States({ rows }: { rows: readonly { name: string; note: string; now: ReactNode; simpler: ReactNode }[] }) {
  return (
    <section aria-label="States" className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">States</h2>
      <div className="grid grid-cols-[12rem_20rem_20rem] items-start gap-x-6 gap-y-4">
        <span className="text-xs text-muted-foreground">State</span>
        <span className="text-xs text-muted-foreground">Now</span>
        <span className="text-xs text-muted-foreground">Simpler</span>
        {rows.map((row) => (
          <StateRow key={row.name} {...row} />
        ))}
      </div>
    </section>
  )
}

function StateRow({ name, note, now, simpler }: { name: string; note: string; now: ReactNode; simpler: ReactNode }) {
  return (
    <>
      <div className="flex flex-col gap-0.5 pt-1">
        <span className="text-xs font-medium">{name}</span>
        <span className="text-[11px] leading-snug text-muted-foreground">{note}</span>
      </div>
      <div className="rounded-lg border p-2">{now}</div>
      <div className="rounded-lg border p-2">{simpler}</div>
    </>
  )
}

/* Number and token: Opacity and Corner radius */

function RadiusNow({ start, tokensOnly, mixed }: { start: Length | undefined; tokensOnly?: boolean; mixed?: boolean }) {
  const [draft, setDraft] = useState<Draft>({ radius: start })
  return (
    <AppearanceSection
      draft={draft}
      set={(change) => setDraft((current) => ({ ...current, ...change }))}
      tokensOnly={tokensOnly}
      mixed={mixed && draft.radius === undefined}
    />
  )
}

function RadiusSimpler({
  start,
  tokensOnly,
  mixed
}: {
  start: Length | undefined
  tokensOnly?: boolean
  mixed?: boolean
}) {
  const [radius, setRadius] = useState(start)
  return (
    <div className="grid grid-cols-2 gap-x-2">
      <SimpleNumber
        label="Corner radius"
        holds={fromLength(radius)}
        mixed={mixed && radius === undefined}
        tokens={radiusTokens}
        namespace="radius-"
        none="None"
        tokensOnly={tokensOnly}
        scrubBy={radiusScrub}
        onChange={(holds) => setRadius(toLength(holds))}
      />
    </div>
  )
}

/** Opacity and Corner radius, sharing one value between today's panel and the simpler one. */
function NumberStory() {
  const [radius, setRadius] = useState<Draft["radius"]>("radius-xl")
  const [opacity, setOpacity] = useState<Opacity | undefined>({ percent: 100 })
  const [eachCorner, setEachCorner] = useState(false)
  const corners: [Length?, Length?, Length?, Length?] = Array.isArray(radius)
    ? radius
    : [radius, radius, radius, radius]
  return (
    <Page
      now={
        <>
          <PanelSection title="Layer">
            <div className="pr-3">
              <OpacityField value={opacity} onChange={setOpacity} />
            </div>
          </PanelSection>
          <AppearanceSection draft={{ radius }} set={(change) => setRadius(change.radius)} />
        </>
      }
      simpler={
        <SimpleSection title="Appearance">
          <SimpleNumber
            label="Opacity"
            holds={fromOpacity(opacity)}
            unit="%"
            unset="100"
            tokens={opacityAsNumbers}
            scrubBy={opacityScrub}
            onChange={(holds) => setOpacity(toOpacity(holds))}
          />
          {eachCorner || Array.isArray(radius) ? (
            <SimpleGroup
              label="Corner radius"
              each="Each corner"
              expanded
              onExpand={(expanded) => {
                setEachCorner(expanded)
                if (!expanded) setRadius(corners[0])
              }}
            >
              {(line) =>
                ([0, 1, 3, 2] as const).map((corner) => (
                  <SimpleNumber
                    key={corner}
                    label={`${["Top left", "Top right", "Bottom right", "Bottom left"][corner]} radius`}
                    caption={false}
                    glyph={<CornerGlyph corner={corner} />}
                    narrow
                    holds={fromLength(corners[corner])}
                    tokens={radiusTokens}
                    namespace="radius-"
                    none="None"
                    scrubBy={radiusScrub}
                    message={line.message}
                    onMessage={line.onMessage}
                    onChange={(holds) => {
                      const next: [Length?, Length?, Length?, Length?] = [...corners]
                      next[corner] = toLength(holds)
                      setRadius(next)
                    }}
                  />
                ))
              }
            </SimpleGroup>
          ) : (
            <SimpleNumber
              label="Corner radius"
              holds={fromLength(corners[0])}
              tokens={radiusTokens}
              namespace="radius-"
              none="None"
              scrubBy={radiusScrub}
              onChange={(holds) => setRadius(toLength(holds))}
              captionAction={
                <CaptionButton
                  pressed={false}
                  onClick={() => {
                    setEachCorner(true)
                    setRadius(corners)
                  }}
                >
                  Each corner
                </CaptionButton>
              }
            />
          )}
        </SimpleSection>
      }
      writes={mergeWrites({
        opacity: opacityWrites(opacity, undefined),
        radius: radiusWrites(radius)
      })}
      states={
        <States
          rows={[
            {
              name: "A value of its own",
              note: "12px. Today: the hollow circle says it isn't a token. Simpler: nothing to say.",
              now: <RadiusNow start={{ px: 12 }} />,
              simpler: <RadiusSimpler start={{ px: 12 }} />
            },
            {
              name: "A token",
              note: "radius-xl. A pill named xl, with 14 after it; hover for Detach.",
              now: <RadiusNow start="radius-xl" />,
              simpler: <RadiusSimpler start="radius-xl" />
            },
            {
              name: "Unset",
              note: "0, faint. Hover shows the Tokens button over the field's end.",
              now: <RadiusNow start={undefined} />,
              simpler: <RadiusSimpler start={undefined} />
            },
            {
              name: "Mixed",
              note: "Layers with different radii.",
              now: <RadiusNow start={undefined} mixed />,
              simpler: <RadiusSimpler start={undefined} mixed />
            },
            {
              name: "Tokens only",
              note: "A project that takes tokens only refuses 12px and offers the nearest.",
              now: <RadiusNow start={{ px: 12 }} tokensOnly />,
              simpler: <RadiusSimpler start={{ px: 12 }} tokensOnly />
            },
            {
              name: "A missing token",
              note: "radius-pill, which the project no longer has: struck through.",
              now: <RadiusNow start="radius-pill" />,
              simpler: <RadiusSimpler start="radius-pill" />
            },
            {
              name: "A replaced token",
              note: "radius-card, replaced by radius-xl: a dot on the pill, and the list offers the swap.",
              now: <RadiusNow start="radius-card" />,
              simpler: <RadiusSimpler start="radius-card" />
            }
          ]}
        />
      }
      inspiration={
        <Inspiration
          examples={numberInspiration}
          takeaway="None of them marks a value that isn't a token, and none moves anything on hover. Figma and Penpot put the token button and Detach over the end of the field, Webflow a dot on its corner, Framer a + beside the label. Names are words above or beside the field, or one letter inside it."
        />
      }
    />
  )
}

export const NumberAndToken: Story = { name: "Number and token", render: () => <NumberStory /> }

/* Sides and corners: Padding */

const padSides = (vertical: Side, horizontal: Side): Sides => [vertical, horizontal, vertical, horizontal]

function PaddingNow({ start }: { start: Sides }) {
  const [sides, setSides] = useState(start)
  return (
    <FourSidesField
      label="Padding"
      rules={sideRules.padding}
      sides={sides}
      atLeastTwo
      onChange={(next) => setSides(next)}
    />
  )
}

/** Padding, simpler: two fields, vertical and horizontal, or four with Each side, under one name. */
function PaddingSimpler({
  sides,
  onChange,
  startEach = false
}: {
  sides: Sides
  onChange: (sides: Sides) => void
  startEach?: boolean
}) {
  const pairsMatch = sides[0] === sides[2] && sides[1] === sides[3]
  const [each, setEach] = useState(startEach || !pairsMatch)
  const set = (indexes: number[], holds: Holds) =>
    onChange(sides.map((side, index) => (indexes.includes(index) ? toSide(holds) : side)) as Sides)
  const field = (label: string, glyph: ReactNode, indexes: number[], line: GroupLine) => (
    <SimpleNumber
      key={label}
      label={label}
      caption={false}
      glyph={glyph}
      narrow
      holds={fromSide(sides[indexes[0]!])}
      tokens={spacingTokens}
      namespace="spacing-"
      none="None"
      scrubBy={spacingScrub}
      message={line.message}
      onMessage={line.onMessage}
      onChange={(holds) => set(indexes, holds)}
    />
  )
  const letter = (text: string) => <span className="w-3 text-center text-[11px]">{text}</span>
  return (
    <SimpleGroup
      label="Padding"
      each="Each side"
      expanded={each}
      onExpand={(expanded) => {
        setEach(expanded)
        if (!expanded) onChange(padSides(sides[0], sides[1]))
      }}
    >
      {(line) =>
        each
          ? [
              field("Top padding", letter("T"), [0], line),
              field("Right padding", letter("R"), [1], line),
              field("Bottom padding", letter("B"), [2], line),
              field("Left padding", letter("L"), [3], line)
            ]
          : [
              field("Vertical padding", letter("↕"), [0, 2], line),
              field("Horizontal padding", letter("↔"), [1, 3], line)
            ]
      }
    </SimpleGroup>
  )
}

function SimplerPaddingState({ start, each }: { start: Sides; each?: boolean }) {
  const [sides, setSides] = useState(start)
  return (
    <div className="grid grid-cols-2">
      <PaddingSimpler sides={sides} onChange={setSides} startEach={each} />
    </div>
  )
}

function SidesStory() {
  const [sides, setSides] = useState<Sides>(padSides({ number: 16 }, { token: "spacing-gutter" }))
  return (
    <Page
      now={
        <PanelSection title="Spacing">
          <FourSidesField
            label="Padding"
            rules={sideRules.padding}
            sides={sides}
            atLeastTwo
            onChange={(next) => setSides(next)}
          />
        </PanelSection>
      }
      simpler={
        <SimpleSection title="Spacing">
          <PaddingSimpler sides={sides} onChange={setSides} />
        </SimpleSection>
      }
      writes={sidesWrites("padding", sides)}
      states={
        <States
          rows={[
            {
              name: "Vertical and horizontal",
              note: "16 down, the gutter token across. Arrows say which pair each field sets.",
              now: <PaddingNow start={padSides({ number: 16 }, { token: "spacing-gutter" })} />,
              simpler: <SimplerPaddingState start={padSides({ number: 16 }, { token: "spacing-gutter" })} />
            },
            {
              name: "Each side",
              note: "16 with 24 at the bottom: four fields, lettered T, R, B and L in CSS's order.",
              now: <PaddingNow start={[{ number: 16 }, { number: 16 }, { number: 24 }, { number: 16 }]} />,
              simpler: (
                <SimplerPaddingState start={[{ number: 16 }, { number: 16 }, { number: 24 }, { number: 16 }]} each />
              )
            },
            {
              name: "Off the steps",
              note: "13.5 down. Today: a hollow mark and a hover that crowds. Simpler: the number, as typed.",
              now: <PaddingNow start={padSides({ number: 13.5 }, { number: 16 })} />,
              simpler: <SimplerPaddingState start={padSides({ number: 13.5 }, { number: 16 })} />
            }
          ]}
        />
      }
      inspiration={
        <Inspiration
          examples={sidesInspiration}
          takeaway="Everyone starts sides and corners collapsed, at one or two fields, and opens every part on request. Figma and Penpot mark each part with a small glyph; Webflow edits them on a drawing of the box."
        />
      }
    />
  )
}

export const SidesAndCorners: Story = { name: "Sides and corners", render: () => <SidesStory /> }

/* Color: Fill */

function FillNow({ value, alpha }: { value: string | undefined; alpha?: number }) {
  const [draft, setDraft] = useState<Draft>({ background: value, backgroundAlpha: alpha })
  return <FillSection draft={draft} set={(change) => setDraft((current) => ({ ...current, ...change }))} />
}

function FillSimpler({ value, alpha }: { value: string | undefined; alpha?: number }) {
  const [fill, setFill] = useState({ value, alpha })
  return (
    <div className="grid grid-cols-2">
      <SimpleColor
        label="Fill"
        value={fill.value}
        alpha={fill.alpha}
        tokens={colorTokens}
        onChange={(next, nextAlpha) => setFill({ value: next, alpha: nextAlpha })}
      />
    </div>
  )
}

function ColorStory() {
  const [fill, setFill] = useState<{ value: string | undefined; alpha: number | undefined }>({
    value: "primary",
    alpha: undefined
  })
  return (
    <Page
      now={
        <FillSection
          draft={{ background: fill.value, backgroundAlpha: fill.alpha }}
          set={(change) => setFill({ value: change.background, alpha: change.backgroundAlpha })}
        />
      }
      simpler={
        <SimpleSection title="Fill">
          <SimpleColor
            label="Fill"
            caption={false}
            value={fill.value}
            alpha={fill.alpha}
            tokens={colorTokens}
            onChange={(value, alpha) => setFill({ value, alpha })}
          />
        </SimpleSection>
      }
      writes={colorWrites("bg", fill.value, fill.alpha)}
      states={
        <States
          rows={[
            {
              name: "A token",
              note: "primary: the swatch and the name, as Figma's fill row.",
              now: <FillNow value="primary" />,
              simpler: <FillSimpler value="primary" />
            },
            {
              name: "A color of its own",
              note: "#2563EB at 80%, with no mark for not being a token.",
              now: <FillNow value="#2563eb" alpha={80} />,
              simpler: <FillSimpler value="#2563eb" alpha={80} />
            },
            {
              name: "A missing token",
              note: "brand-old, which the project no longer has: struck through.",
              now: <FillNow value="brand-old" />,
              simpler: <FillSimpler value="brand-old" />
            }
          ]}
        />
      }
      inspiration={
        <Inspiration
          examples={colorInspiration}
          takeaway="A color row is a swatch, the hex or the token's name, and the alpha. A token needs no pill beside a swatch: Figma shows the swatch and the name in the hex's place."
        />
      }
    />
  )
}

export const Color: Story = { render: () => <ColorStory /> }

/* The whole panel, today's and the simpler one */

function WholePanelStory() {
  const [radius, setRadius] = useState<Draft["radius"]>("radius-lg")
  const [opacity, setOpacity] = useState<Opacity | undefined>({ percent: 100 })
  const [sides, setSides] = useState<Sides>(padSides({ number: 16 }, { number: 24 }))
  const [fill, setFill] = useState<{ value: string | undefined; alpha: number | undefined }>({
    value: "card",
    alpha: undefined
  })
  return (
    <Page
      now={
        <>
          <PanelSection title="Spacing">
            <FourSidesField
              label="Padding"
              rules={sideRules.padding}
              sides={sides}
              atLeastTwo
              onChange={(next) => setSides(next)}
            />
          </PanelSection>
          <PanelSection title="Layer">
            <div className="pr-3">
              <OpacityField value={opacity} onChange={setOpacity} />
            </div>
          </PanelSection>
          <AppearanceSection draft={{ radius }} set={(change) => setRadius(change.radius)} />
          <FillSection
            draft={{ background: fill.value, backgroundAlpha: fill.alpha }}
            set={(change) => setFill({ value: change.background, alpha: change.backgroundAlpha })}
          />
        </>
      }
      simpler={
        <>
          <SimpleSection title="Spacing">
            <PaddingSimpler sides={sides} onChange={setSides} />
          </SimpleSection>
          <SimpleSection title="Appearance">
            <SimpleNumber
              label="Opacity"
              holds={fromOpacity(opacity)}
              unit="%"
              unset="100"
              tokens={opacityAsNumbers}
              scrubBy={opacityScrub}
              onChange={(holds) => setOpacity(toOpacity(holds))}
            />
            <SimpleNumber
              label="Corner radius"
              holds={fromLength(Array.isArray(radius) ? radius[0] : radius)}
              tokens={radiusTokens}
              namespace="radius-"
              none="None"
              scrubBy={radiusScrub}
              onChange={(holds) => setRadius(toLength(holds))}
            />
          </SimpleSection>
          <SimpleSection title="Fill">
            <SimpleColor
              label="Fill"
              caption={false}
              value={fill.value}
              alpha={fill.alpha}
              tokens={colorTokens}
              onChange={(value, alpha) => setFill({ value, alpha })}
            />
          </SimpleSection>
        </>
      }
      writes={mergeWrites({
        padding: sidesWrites("padding", sides),
        opacity: opacityWrites(opacity, undefined),
        radius: radiusWrites(radius),
        background: colorWrites("bg", fill.value, fill.alpha)
      })}
      inspiration={
        <Inspiration
          examples={numberInspiration.filter((example) => example.product === "Figma")}
          takeaway="The same layer in both panels. Hover across each: in the simpler one, nothing moves."
        />
      }
    />
  )
}

export const WholePanel: Story = { name: "Whole panel", render: () => <WholePanelStory /> }

/* The other types, inspiration first */

/** A type whose simpler version comes later: how the others build it, for now. */
function InspirationOnly({ examples, takeaway }: { examples: readonly Example[]; takeaway: string }) {
  return <Page inspiration={<Inspiration examples={examples} takeaway={takeaway} />} />
}

export const KeywordPickers: Story = {
  name: "Keyword pickers",
  render: () => (
    <InspirationOnly
      examples={keywordInspiration}
      takeaway="A choice with a picture is a row of icon buttons; one without is a menu of words. Webflow's research chose words for display."
    />
  )
}

export const Typography: Story = {
  render: () => (
    <InspirationOnly
      examples={typographyInspiration}
      takeaway="Family spans the row, weight and size share the next, then line height and letter spacing, each named in words. Rarer settings sit behind one button."
    />
  )
}

export const LayerLists: Story = {
  name: "Layer lists",
  render: () => (
    <InspirationOnly
      examples={listInspiration}
      takeaway="An empty list is a title and +. Each row is its type, an eye and a minus; handles and trash show on hover."
    />
  )
}

export const LayoutAndPosition: Story = {
  name: "Layout and position",
  render: () => (
    <InspirationOnly
      examples={layoutInspiration}
      takeaway="Sizing modes live in the size field's own menu; alignment is a 3 by 3 grid; min and max appear only once set."
    />
  )
}

export const MixedAndSetElsewhere: Story = {
  name: "Mixed and set elsewhere",
  render: () => (
    <InspirationOnly
      examples={statesInspiration}
      takeaway="Mixed is placeholder text. Where a value comes from is one quiet signal: the label's color in Webflow, a small dot in Plasmic, a menu in Figma."
    />
  )
}
