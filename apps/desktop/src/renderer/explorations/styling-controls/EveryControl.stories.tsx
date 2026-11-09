import { Badge } from "@buildkitgg/shadcn-baseui-kit"
import { composeStories, type Meta, type StoryObj } from "@storybook/react-vite"
import { Check } from "lucide-react"
import type { ComponentType } from "react"
import { GroupLabel } from "../../chrome/PanelSection.tsx"
import * as angle from "./Angle.stories.tsx"
import * as blur from "./BlurField.stories.tsx"
import * as boxModel from "./BoxModel.stories.tsx"
import * as colorField from "./ColorField.stories.tsx"
import * as easing from "./Easing.stories.tsx"
import * as expression from "./Expression.stories.tsx"
import * as filters from "./FilterList.stories.tsx"
import * as fontFamily from "./FontFamily.stories.tsx"
import * as frameSize from "./FrameSize.stories.tsx"
import * as gridPlacement from "./GridPlacement.stories.tsx"
import * as gridTracks from "./GridTracks.stories.tsx"
import * as keywords from "./KeywordSets.stories.tsx"
import * as layerOrder from "./LayerOrder.stories.tsx"
import * as layout from "./LayoutAlignment.stories.tsx"
import * as lineHeight from "./LineHeight.stories.tsx"
import * as margin from "./Margin.stories.tsx"
import * as numberField from "./NumberField.stories.tsx"
import * as opacity from "./Opacity.stories.tsx"
import * as padding from "./Padding.stories.tsx"
import * as paints from "./PaintStack.stories.tsx"
import * as placement from "./PlacementAndInsets.stories.tsx"
import { ControlOnly } from "./playground.tsx"
import * as positionInABox from "./PositionInABox.stories.tsx"
import * as radius from "./RadiusField.stories.tsx"
import * as rawCss from "./RawCss.stories.tsx"
import * as shadows from "./ShadowList.stories.tsx"
import * as size from "./SizeField.stories.tsx"
import * as stroke from "./StrokeField.stories.tsx"
import * as strokeWidth from "./StrokeWidth.stories.tsx"
import * as textTag from "./TextTag.stories.tsx"
import * as time from "./Time.stories.tsx"
import * as transform from "./Transform.stories.tsx"
import * as transitions from "./TransitionList.stories.tsx"
import * as typographyPreset from "./TypographyPreset.stories.tsx"
import * as weight from "./Weight.stories.tsx"

/**
 * Every control (PAR-186) on one page, numbered, to review one at a time. Each is one of its own stories, holding a
 * value, shown without what it writes or its preview; its name opens all its stories. They're numbered in the design
 * panel's order, after the fields the others are built from, and each is marked Reviewed or To review, with what's
 * left to review first.
 */
const meta = {
  title: "Parity/Explorations/Design panel controls/Every control",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

interface Entry {
  name: string
  Story: ComponentType & { id: string }
  /** Andrew has been through it and it's settled. */
  reviewed?: boolean
}

const k = composeStories(keywords)

const groups: { name: string; entries: Entry[] }[] = [
  {
    name: "Fields the others are built from",
    entries: [
      { name: "Number field", Story: composeStories(numberField).SpacingLength, reviewed: true },
      { name: "Expression", Story: composeStories(expression).Calc, reviewed: true },
      // The picker opens from the field's swatch: its own stories open it at the start, and it takes focus as it does.
      { name: "Color field and picker", Story: composeStories(colorField).Token, reviewed: true }
    ]
  },
  {
    name: "Layout",
    entries: [
      { name: "Frame size", Story: composeStories(frameSize).Desktop, reviewed: true },
      { name: "Layout direction and alignment", Story: composeStories(layout).HorizontalCentered },
      { name: "Grid tracks", Story: composeStories(gridTracks).SizedTracks },
      { name: "Grid placement", Story: composeStories(gridPlacement).SpanAndStart }
    ]
  },
  {
    name: "Size and position",
    entries: [
      { name: "Size and aspect ratio", Story: composeStories(size).Fixed, reviewed: true },
      { name: "Placement and insets", Story: composeStories(placement).Absolute },
      { name: "Layer order", Story: composeStories(layerOrder).InFront, reviewed: true },
      { name: "Position in a box", Story: composeStories(positionInABox).OriginSpot, reviewed: true }
    ]
  },
  {
    name: "Spacing",
    entries: [
      { name: "Padding", Story: composeStories(padding).VerticalAndHorizontal, reviewed: true },
      { name: "Margin", Story: composeStories(margin).AutoAcross, reviewed: true },
      { name: "Box model", Story: composeStories(boxModel).WithMargin }
    ]
  },
  {
    name: "Appearance",
    entries: [
      { name: "Opacity and blend mode", Story: composeStories(opacity).Step, reviewed: true },
      { name: "Radius", Story: composeStories(radius).Token },
      { name: "Clip content", Story: k.ClipContent, reviewed: true },
      { name: "Cursor", Story: k.Cursor, reviewed: true }
    ]
  },
  {
    name: "Fill and stroke",
    entries: [
      { name: "Paint stack", Story: composeStories(paints).Solid },
      { name: "Stroke", Story: composeStories(stroke).AllSides },
      { name: "Stroke width", Story: composeStories(strokeWidth).VerticalAndHorizontal },
      { name: "Stroke style", Story: k.StrokeStyle }
    ]
  },
  {
    name: "Effects",
    entries: [
      { name: "Shadow list", Story: composeStories(shadows).Token },
      { name: "Layer and background blur", Story: composeStories(blur).Both },
      { name: "Filter list", Story: composeStories(filters).InTailwindsOrder },
      { name: "Transform", Story: composeStories(transform).Move },
      { name: "Angle", Story: composeStories(angle).Step }
    ]
  },
  {
    name: "Text",
    entries: [
      { name: "Typography preset", Story: composeStories(typographyPreset).Folded },
      { name: "Text tag", Story: composeStories(textTag).Heading2 },
      { name: "Font family", Story: composeStories(fontFamily).Token, reviewed: true },
      { name: "Weight and style", Story: composeStories(weight).Named, reviewed: true },
      { name: "Line height and letter spacing", Story: composeStories(lineHeight).Step },
      { name: "Align", Story: k.AlignSet, reviewed: true },
      { name: "Case", Story: k.Case, reviewed: true },
      { name: "Wrap", Story: k.Wrap, reviewed: true }
    ]
  },
  {
    name: "Motion",
    entries: [
      { name: "Transition list", Story: composeStories(transitions).OneEntry },
      { name: "Time", Story: composeStories(time).Step },
      { name: "Easing and spring", Story: composeStories(easing).Preset }
    ]
  },
  { name: "Code", entries: [{ name: "Raw CSS value", Story: composeStories(rawCss).Rows, reviewed: true }] }
]

// Numbered through in the panel's order, so a control keeps its number however the page is sorted.
const numbered = groups.map((group, index) => {
  const start = 1 + groups.slice(0, index).reduce((count, before) => count + before.entries.length, 0)
  return { ...group, start, entries: group.entries.map((entry, at) => ({ ...entry, number: start + at })) }
})

// What's left to review comes first: reviewed controls go to the end of their group, and a group with nothing left
// to review goes to the end of the page.
const byReview = (reviewed: boolean | undefined) => (reviewed ? 1 : 0)
const sorted = numbered
  .map((group) => ({
    ...group,
    entries: group.entries.toSorted((a, b) => byReview(a.reviewed) - byReview(b.reviewed))
  }))
  .toSorted(
    (a, b) =>
      byReview(a.entries.every((entry) => entry.reviewed)) - byReview(b.entries.every((entry) => entry.reviewed))
  )

function EveryControlPage() {
  return (
    // It scrolls itself: the app's stylesheet keeps the page from scrolling, as the app's window mustn't.
    <div className="flex h-screen flex-col gap-8 overflow-y-auto bg-background p-6 text-foreground">
      <ControlOnly value>
        {sorted.map((group) => (
          <section key={group.name} aria-labelledby={`group-${group.start}`} className="flex flex-col gap-3">
            <GroupLabel as="h2" className="block">
              <span id={`group-${group.start}`}>{group.name}</span>
            </GroupLabel>
            <ul className="flex flex-wrap items-start gap-x-6 gap-y-8">
              {group.entries.map(({ name, Story: Control, reviewed, number }) => (
                <li key={name} className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-medium">
                    <span className="text-muted-foreground tabular-nums">{number}</span>
                    <a
                      href={`/?path=/story/${Control.id}`}
                      target="_top"
                      className="rounded-sm underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {name}
                    </a>
                    {reviewed ? (
                      <Badge className="border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                        <Check aria-hidden />
                        Reviewed
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        To review
                      </Badge>
                    )}
                  </h3>
                  <Control />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </ControlOnly>
    </div>
  )
}

export const EveryControl: Story = { name: "Every control", render: () => <EveryControlPage /> }
