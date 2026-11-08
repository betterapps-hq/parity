import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { scrubSteps } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "./color-picker.tsx"
import { AppearanceSection, FillSection } from "./controls.tsx"
import { stepSpacing } from "./css-values.ts"
import type { Draft, Length } from "./data.ts"
import { ProjectTokens, type ScrubBy, type ScrubKeys, useTokens } from "./field-parts.tsx"
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
import { FourSidesField, type Spread, spreadTo } from "./sides.tsx"
import {
  CaptionButton,
  CornerGlyph,
  type GroupLine,
  type Holds,
  PairGlyph,
  SideGlyph,
  SimpleColor,
  SimpleGroup,
  SimpleNumber,
  SimpleSection
} from "./simpler.tsx"
import { type Opacity, opacityWrites } from "./text-writes.ts"
import { colorToken, lengthToken, opacityToken } from "./tokens.ts"
import { colorWrites, mergeWrites, radiusWrites, type Writes } from "./writes.ts"

/**
 * A spike (PAR-186) on simpler fields, after "this feels so busy: when you hover everything shifts, and I don't know
 * what the square, the circle or the hexagon are". Each story puts today's controls beside a simpler version of the
 * same thing, sharing one value, then the states side by side, then how Figma, Framer, Webflow, Penpot, Plasmic and
 * Wix Studio build that type of field, with their own screenshots.
 *
 * What the simpler field changes:
 * - Names in words above the fields, two to a row; dragging a name changes its value. No icon to learn. Fields that
 *   share a name (sides, corners) carry a letter, an arrow or a corner inside, named in its hint.
 * - A filled box with no border; pixels aren't shown, other units are.
 * - A value of its own has no mark. Its token list offers the nearest token first, then Create token, and Allow here
 *   in a project set to Tokens only.
 * - A token is a pill with its name; its hint says what it comes to. Backspace on the pill detaches it, keeping the
 *   value.
 * - Hovering changes only the outline. The field's one button (Tokens, or Detach on a token) sits over the end of the
 *   box, in room the box always keeps, and fades in, so nothing moves.
 * - Only real problems show: a missing token in red, a replaced one in amber, and a value Tokens only refuses.
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
  if (typeof value === "string") return { token: value }
  return value.allow === undefined ? { value: value.px } : { value: value.px, allow: value.allow }
}
const toLength = (holds: Holds): Length | undefined => {
  if (holds === undefined) return undefined
  if ("token" in holds) return holds.token
  return holds.allow === undefined ? { px: holds.value } : { px: holds.value, allow: holds.allow }
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
  if (side === undefined || side === "auto") return undefined
  if ("token" in side) return { token: side.token }
  if ("percent" in side) return { value: side.percent, percent: true }
  return side.allow === undefined ? { value: side.number } : { value: side.number, allow: side.allow }
}
const toSide = (holds: Holds): Side => {
  if (holds === undefined) return undefined
  if ("token" in holds) return { token: holds.token }
  if (holds.percent) return { percent: holds.value }
  return holds.allow === undefined ? { number: holds.value } : { number: holds.value, allow: holds.allow }
}

/** Whether two stored values are the same value. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Which parts an edit reaches: the one edited, the opposite one too (Alt), or every one (Alt+Shift), as Figma's. */
const spreadOf = (keys?: ScrubKeys): Spread => {
  if (!keys?.alt) return "side"
  return keys.shift ? "all" : "opposite"
}

const radiusScrub: ScrubBy = { step: 1, shiftStep: 10, min: 0 }
const opacityScrub: ScrubBy = { step: 1, shiftStep: 10, min: 0, max: 100 }
/** A corner or a side drags as one would, but Shift with Alt reaches every part rather than going ten times as far. */
const cornerScrub: ScrubBy = {
  move: (start, dx, { shift, alt }) => start + Math.trunc(dx) * (shift && !alt ? 10 : 1),
  min: 0
}
const paddingScrub: ScrubBy = {
  move: (start, dx, { shift, alt }) => stepSpacing(start, scrubSteps(dx, shift && !alt)),
  min: 0
}

/**
 * Keeps the focus on a toggle that swaps a field for its group, or back: the new toggle takes it once it's drawn, as
 * the one pressed has gone.
 */
function useRefocus() {
  const toggle = useRef<HTMLButtonElement>(null)
  const [moves, setMoves] = useState(0)
  useEffect(() => {
    if (moves > 0) toggle.current?.focus()
  }, [moves])
  return { toggle, refocus: () => setMoves((count) => count + 1) }
}

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

/* The simpler fields as the stories use them, on the project's tokens */

function OpacitySimpler({
  opacity,
  onChange
}: {
  opacity: Opacity | undefined
  onChange: (opacity?: Opacity) => void
}) {
  const { tokens, create } = useTokens("opacity")
  return (
    <SimpleNumber
      label="Opacity"
      holds={fromOpacity(opacity)}
      unit="%"
      unset="100"
      unsetValue={100}
      min={0}
      max={100}
      tokens={tokens.map((token) => ({ ...token, px: token.percent }))}
      scrubBy={opacityScrub}
      onChange={(holds) => onChange(toOpacity(holds))}
      onCreate={
        create &&
        ((name, percent) => {
          create(opacityToken(name, percent))
          onChange({ token: name })
        })
      }
    />
  )
}

type Corners = [Length?, Length?, Length?, Length?]
const cornerNames = ["Top left", "Top right", "Bottom right", "Bottom left"] as const

/**
 * Radius, simpler: one field, or each corner with Each corner, laid out where each corner is. Collapsing corners that
 * differ keeps them, and the one field says Mixed until something's typed.
 */
function RadiusField({
  radius,
  onChange,
  tokensOnly = false,
  mixed = false
}: {
  radius: Draft["radius"]
  onChange: (radius: Draft["radius"]) => void
  tokensOnly?: boolean
  mixed?: boolean
}) {
  const { tokens, create } = useTokens("radius")
  const corners: Corners = Array.isArray(radius) ? radius : [radius, radius, radius, radius]
  const alike = corners.every((corner) => same(corner, corners[0]))
  const [each, setEach] = useState(!alike)
  const { toggle, refocus } = useRefocus()
  // Typing corners that differ opens every corner, to show them.
  const shorthand = (parts: Holds[]) => {
    onChange(parts.map(toLength) as Corners)
    if (!parts.every((part) => same(part, parts[0]))) setEach(true)
  }
  const make = (name: string, px: number) => create?.(lengthToken("radius", name, px))

  if (!each) {
    return (
      <SimpleNumber
        label="Radius"
        holds={alike ? fromLength(corners[0]) : undefined}
        mixed={mixed || !alike}
        length
        min={0}
        tokens={tokens}
        namespace="radius-"
        none="None"
        tokensOnly={tokensOnly}
        scrubBy={radiusScrub}
        onChange={(holds) => onChange(toLength(holds))}
        onShorthand={shorthand}
        onCreate={
          create &&
          ((name, px) => {
            make(name, px)
            onChange(name)
          })
        }
        captionAction={
          <CaptionButton
            ref={toggle}
            pressed={false}
            onClick={() => {
              setEach(true)
              refocus()
            }}
          >
            Each corner
          </CaptionButton>
        }
      />
    )
  }
  const corner = (index: 0 | 1 | 2 | 3, line: GroupLine) => {
    const set = (value: Length | undefined, keys?: ScrubKeys) => {
      const next: Corners = [...corners]
      for (const reached of spreadTo([index], spreadOf(keys))) next[reached] = value
      onChange(next)
    }
    return (
      <SimpleNumber
        key={index}
        label={`${cornerNames[index]} radius`}
        caption={false}
        glyph={<CornerGlyph corner={index} />}
        glyphHint={cornerNames[index]}
        holds={fromLength(corners[index])}
        length
        min={0}
        tokens={tokens}
        namespace="radius-"
        none="None"
        tokensOnly={tokensOnly}
        scrubBy={cornerScrub}
        spreads
        line={line}
        onChange={(holds, keys) => set(toLength(holds), keys)}
        onShorthand={shorthand}
        onCreate={
          create &&
          ((name, px) => {
            make(name, px)
            set(name)
          })
        }
      />
    )
  }
  return (
    <SimpleGroup
      label="Radius"
      each="Each corner"
      expanded
      toggleRef={toggle}
      onExpand={() => {
        setEach(false)
        refocus()
        // Corners that match become one radius again; corners that don't stay as they are, and the field says Mixed.
        if (alike) onChange(corners[0])
      }}
    >
      {/* Laid out where each corner is: the top two, then bottom left and bottom right. */}
      {(line) => ([0, 1, 3, 2] as const).map((index) => corner(index, line))}
    </SimpleGroup>
  )
}

/**
 * Padding, simpler: vertical and horizontal, or each side with Each side, under one name. A pair whose sides differ
 * says Mixed rather than taking one of them; typing `8 16` sets all four, as CSS's shorthand does; Alt reaches the
 * opposite side and Alt+Shift all four.
 */
function PaddingSimpler({
  sides,
  mixed = [],
  onChange
}: {
  sides: Sides
  /** Sides that differ between the selected layers. */
  mixed?: readonly boolean[]
  onChange: (sides: Sides, changed: number[]) => void
}) {
  const { tokens, create } = useTokens("spacing")
  const pairsMatch =
    same(sides[0], sides[2]) && same(sides[1], sides[3]) && !!mixed[0] === !!mixed[2] && !!mixed[1] === !!mixed[3]
  const [each, setEach] = useState(!pairsMatch)
  const set = (indexes: readonly number[], side: Side, keys?: ScrubKeys) => {
    const reached = spreadTo(indexes, spreadOf(keys))
    onChange(sides.map((current, index) => (reached.includes(index) ? side : current)) as Sides, reached)
  }
  const field = (label: string, glyph: ReactNode, glyphHint: string, indexes: readonly number[], line: GroupLine) => {
    const first = indexes[0]!
    const isMixed = indexes.some((index) => mixed[index]) || !indexes.every((index) => same(sides[index], sides[first]))
    return (
      <SimpleNumber
        key={label}
        label={label}
        caption={false}
        glyph={glyph}
        glyphHint={glyphHint}
        holds={isMixed ? undefined : fromSide(sides[first])}
        mixed={isMixed}
        length
        percent
        min={0}
        stepBy="spacing"
        tokens={tokens}
        namespace="spacing-"
        none="None"
        scrubBy={paddingScrub}
        spreads
        line={line}
        onChange={(holds, keys) => set(indexes, toSide(holds), keys)}
        onShorthand={(parts) => {
          onChange(parts.map(toSide) as Sides, [0, 1, 2, 3])
          // Typing sides whose pairs differ opens every side, to show them.
          if (!same(parts[0], parts[2]) || !same(parts[1], parts[3])) setEach(true)
        }}
        onCreate={
          create &&
          ((name, px) => {
            create(lengthToken("spacing", name, px))
            set(indexes, { token: name })
          })
        }
      />
    )
  }
  return (
    <SimpleGroup label="Padding" each="Each side" expanded={each} onExpand={setEach}>
      {(line) =>
        each
          ? [
              field("Top padding", <SideGlyph letter="T" />, "Top", [0], line),
              field("Right padding", <SideGlyph letter="R" />, "Right", [1], line),
              field("Bottom padding", <SideGlyph letter="B" />, "Bottom", [2], line),
              field("Left padding", <SideGlyph letter="L" />, "Left", [3], line)
            ]
          : [
              field("Vertical padding", <PairGlyph />, "Top and bottom", [0, 2], line),
              field("Horizontal padding", <PairGlyph across />, "Left and right", [1, 3], line)
            ]
      }
    </SimpleGroup>
  )
}

/** A fill as the stories hold it: a token's name or a color of its own, its alpha, and why it's allowed here. */
interface Fill {
  value: string | undefined
  alpha: number | undefined
  allow?: string
}

function FillField({
  fill,
  onChange,
  caption,
  tokensOnly,
  mixed
}: {
  fill: Fill
  onChange: (fill: Fill) => void
  caption?: boolean
  tokensOnly?: boolean
  mixed?: boolean
}) {
  const { tokens, create } = useTokens("color")
  return (
    <SimpleColor
      label="Fill"
      caption={caption}
      value={fill.value}
      alpha={fill.alpha}
      mixed={mixed && fill.value === undefined}
      tokensOnly={tokensOnly}
      allowed={fill.allow}
      onAllow={(allow) => onChange({ ...fill, allow })}
      tokens={tokens}
      onCreate={
        create &&
        ((name, hex) => {
          create(colorToken(name, hex))
          onChange({ value: name, alpha: fill.alpha })
        })
      }
      onChange={(value, alpha) => onChange({ value, alpha })}
    />
  )
}

/* Number and token: Opacity and Radius */

function RadiusNow({ start, tokensOnly, mixed }: { start: Draft["radius"]; tokensOnly?: boolean; mixed?: boolean }) {
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
  start: Draft["radius"]
  tokensOnly?: boolean
  mixed?: boolean
}) {
  const [radius, setRadius] = useState(start)
  return (
    <div className="grid grid-cols-2 gap-x-2">
      <RadiusField radius={radius} onChange={setRadius} tokensOnly={tokensOnly} mixed={mixed && radius === undefined} />
    </div>
  )
}

/** Opacity and Radius, sharing one value between today's panel and the simpler one. */
function NumberStory() {
  const [radius, setRadius] = useState<Draft["radius"]>("radius-xl")
  const [opacity, setOpacity] = useState<Opacity | undefined>({ percent: 100 })
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
          <OpacitySimpler opacity={opacity} onChange={setOpacity} />
          <RadiusField radius={radius} onChange={setRadius} />
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
              note: "12px, with no mark. Its list (Alt+Down) offers the nearest token, xl, first, then Create token.",
              now: <RadiusNow start={{ px: 12 }} />,
              simpler: <RadiusSimpler start={{ px: 12 }} />
            },
            {
              name: "A token",
              note: "radius-xl: a pill named xl, whose hint says radius-xl and 14px. Backspace on it detaches, keeping 14.",
              now: <RadiusNow start="radius-xl" />,
              simpler: <RadiusSimpler start="radius-xl" />
            },
            {
              name: "Unset",
              note: "0, faint. Hovering shows the Tokens button over the field's end.",
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
              name: "Corners apart",
              note: "8 at the top, 16 at the bottom: a field for each corner, marked by its arc and laid out where it is.",
              now: <RadiusNow start={[{ px: 8 }, { px: 8 }, { px: 16 }, { px: 16 }]} />,
              simpler: <RadiusSimpler start={[{ px: 8 }, { px: 8 }, { px: 16 }, { px: 16 }]} />
            },
            {
              name: "Tokens only",
              note: "A project that takes tokens only refuses 12px: outlined, with the nearest token under it. Its list adds Allow here.",
              now: <RadiusNow start={{ px: 12 }} tokensOnly />,
              simpler: <RadiusSimpler start={{ px: 12 }} tokensOnly />
            },
            {
              name: "A missing token",
              note: "radius-pill, which the project no longer has: a red pill.",
              now: <RadiusNow start="radius-pill" />,
              simpler: <RadiusSimpler start="radius-pill" />
            },
            {
              name: "A replaced token",
              note: "radius-card, replaced by radius-xl: an amber pill, and its list offers the swap.",
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

export const NumberAndToken: Story = {
  name: "Number and token",
  render: () => (
    <ProjectTokens>
      <NumberStory />
    </ProjectTokens>
  )
}

/* Sides and corners: Padding */

const padSides = (vertical: Side, horizontal: Side): Sides => [vertical, horizontal, vertical, horizontal]

function PaddingNow({ start, mixed }: { start: Sides; mixed?: boolean[] }) {
  const [sides, setSides] = useState(start)
  const [differ, setDiffer] = useState(mixed ?? [])
  return (
    <FourSidesField
      label="Padding"
      rules={sideRules.padding}
      sides={sides}
      mixed={differ}
      atLeastTwo
      onChange={(next, cleared) => {
        setSides(next)
        setDiffer((current) => current.map((side, index) => side && !cleared.includes(index)))
      }}
    />
  )
}

function SimplerPaddingState({ start, mixed }: { start: Sides; mixed?: boolean[] }) {
  const [sides, setSides] = useState(start)
  const [differ, setDiffer] = useState(mixed ?? [])
  return (
    <div className="grid grid-cols-2">
      <PaddingSimpler
        sides={sides}
        mixed={differ}
        onChange={(next, changed) => {
          setSides(next)
          setDiffer((current) => current.map((side, index) => side && !changed.includes(index)))
        }}
      />
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
              note: "16 down, the gutter token across. An arrow says which pair each field sets, and its hint names it.",
              now: <PaddingNow start={padSides({ number: 16 }, { token: "spacing-gutter" })} />,
              simpler: <SimplerPaddingState start={padSides({ number: 16 }, { token: "spacing-gutter" })} />
            },
            {
              name: "Each side",
              note: "16 with 24 at the bottom: four fields, lettered in CSS's order. Typing 8 16 in any sets all four.",
              now: <PaddingNow start={[{ number: 16 }, { number: 16 }, { number: 24 }, { number: 16 }]} />,
              simpler: <SimplerPaddingState start={[{ number: 16 }, { number: 16 }, { number: 24 }, { number: 16 }]} />
            },
            {
              name: "Mixed",
              note: "Layers with different top and bottom padding: the vertical field says Mixed, and typing sets both.",
              now: (
                <PaddingNow
                  start={[undefined, { number: 16 }, undefined, { number: 16 }]}
                  mixed={[true, false, true, false]}
                />
              ),
              simpler: (
                <SimplerPaddingState
                  start={[undefined, { number: 16 }, undefined, { number: 16 }]}
                  mixed={[true, false, true, false]}
                />
              )
            },
            {
              name: "A percentage",
              note: "5% across, a share of the parent's width, with its unit shown.",
              now: <PaddingNow start={padSides({ number: 16 }, { percent: 5 })} />,
              simpler: <SimplerPaddingState start={padSides({ number: 16 }, { percent: 5 })} />
            },
            {
              name: "Off the steps",
              note: "13.5 down, as typed. Up goes to the next spacing step, 16, then a step (4px) at a time.",
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

export const SidesAndCorners: Story = {
  name: "Sides and corners",
  render: () => (
    <ProjectTokens>
      <SidesStory />
    </ProjectTokens>
  )
}

/* Color: Fill */

function FillNow({ start, tokensOnly, mixed }: { start: Fill; tokensOnly?: boolean; mixed?: boolean }) {
  const [draft, setDraft] = useState<Draft>({ background: start.value, backgroundAlpha: start.alpha })
  if (mixed) {
    // Today's Fill section has no Mixed, so this is its color field on its own, as it draws Mixed.
    return (
      <div className="pr-3 pl-1">
        <ColorInput
          label="Fill"
          value={draft.background}
          alpha={draft.backgroundAlpha}
          mixed={draft.background === undefined}
          onChange={(background, backgroundAlpha) => setDraft({ background, backgroundAlpha })}
        />
      </div>
    )
  }
  return (
    <FillSection
      draft={draft}
      tokensOnly={tokensOnly}
      set={(change) => setDraft((current) => ({ ...current, ...change }))}
    />
  )
}

function FillSimpler({ start, tokensOnly, mixed }: { start: Fill; tokensOnly?: boolean; mixed?: boolean }) {
  const [fill, setFill] = useState(start)
  return (
    <div className="grid grid-cols-2">
      <FillField fill={fill} onChange={setFill} tokensOnly={tokensOnly} mixed={mixed} />
    </div>
  )
}

function ColorStory() {
  const [fill, setFill] = useState<Fill>({ value: "primary", alpha: undefined })
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
          <FillField fill={fill} onChange={setFill} caption={false} />
        </SimpleSection>
      }
      writes={colorWrites("bg", fill.value, fill.alpha)}
      states={
        <States
          rows={[
            {
              name: "A token",
              note: "primary: the swatch and the name, as Figma's fill row. Click either for the tokens; Backspace detaches.",
              now: <FillNow start={{ value: "primary", alpha: undefined }} />,
              simpler: <FillSimpler start={{ value: "primary", alpha: undefined }} />
            },
            {
              name: "A color of its own",
              note: "#2563EB at 80%, with no mark. The swatch opens the picker; the list offers blue-600, nearest, first.",
              now: <FillNow start={{ value: "#2563eb", alpha: 80 }} />,
              simpler: <FillSimpler start={{ value: "#2563eb", alpha: 80 }} />
            },
            {
              name: "OKLCH",
              note: "A color of its own in OKLCH: short at rest, whole while editing.",
              now: <FillNow start={{ value: "oklch(0.62 0.19 260)", alpha: undefined }} />,
              simpler: <FillSimpler start={{ value: "oklch(0.62 0.19 260)", alpha: undefined }} />
            },
            {
              name: "Mixed",
              note: "Layers with different fills: a split swatch, and Mixed.",
              now: <FillNow start={{ value: undefined, alpha: undefined }} mixed />,
              simpler: <FillSimpler start={{ value: undefined, alpha: undefined }} mixed />
            },
            {
              name: "Tokens only",
              note: "A project that takes tokens only refuses #2563EB: outlined, with blue-600 under it.",
              now: <FillNow start={{ value: "#2563eb", alpha: undefined }} tokensOnly />,
              simpler: <FillSimpler start={{ value: "#2563eb", alpha: undefined }} tokensOnly />
            },
            {
              name: "A missing token",
              note: "brand-old, which the project no longer has: its name in red.",
              now: <FillNow start={{ value: "brand-old", alpha: undefined }} />,
              simpler: <FillSimpler start={{ value: "brand-old", alpha: undefined }} />
            },
            {
              name: "A replaced token",
              note: "brand-blue, replaced by blue-600: its name in amber, and its list offers the swap.",
              now: <FillNow start={{ value: "brand-blue", alpha: undefined }} />,
              simpler: <FillSimpler start={{ value: "brand-blue", alpha: undefined }} />
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

export const Color: Story = {
  render: () => (
    <ProjectTokens>
      <ColorStory />
    </ProjectTokens>
  )
}

/* The whole panel, today's and the simpler one */

function WholePanelStory() {
  const [radius, setRadius] = useState<Draft["radius"]>("radius-lg")
  const [opacity, setOpacity] = useState<Opacity | undefined>({ percent: 100 })
  const [sides, setSides] = useState<Sides>(padSides({ number: 16 }, { number: 24 }))
  const [fill, setFill] = useState<Fill>({ value: "card", alpha: undefined })
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
            <OpacitySimpler opacity={opacity} onChange={setOpacity} />
            <RadiusField radius={radius} onChange={setRadius} />
          </SimpleSection>
          <SimpleSection title="Fill">
            <FillField fill={fill} onChange={setFill} caption={false} />
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

export const WholePanel: Story = {
  name: "Whole panel",
  render: () => (
    <ProjectTokens>
      <WholePanelStory />
    </ProjectTokens>
  )
}

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
