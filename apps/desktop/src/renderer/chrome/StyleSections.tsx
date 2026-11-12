import type { ContainerSpec } from "@parity-app/core"
import {
  type CapabilityDesign,
  selectionCapabilities,
  type StyleSection,
  styleParts,
  type TakesStyle
} from "@parity-app/editor"
import { type ComponentType, type ReactNode, useMemo } from "react"
import { LiveEditsContext, ProjectTokens } from "../inspector/controls/field-parts.tsx"
import { AppearanceSection } from "../inspector/sections/AppearanceSection.tsx"
import { EffectsSection } from "../inspector/sections/effects.tsx"
import { FillSection } from "../inspector/sections/FillSection.tsx"
import { LayoutSection } from "../inspector/sections/LayoutSection.tsx"
import { MotionSection } from "../inspector/sections/MotionSection.tsx"
import { PositionSection } from "../inspector/sections/PositionSection.tsx"
import { type SectionProps, useSectionEdits } from "../inspector/sections/section-edits.ts"
import { SizeSection } from "../inspector/sections/SizeSection.tsx"
import { SpacingSection } from "../inspector/sections/SpacingSection.tsx"
import { StrokeSection } from "../inspector/sections/StrokeSection.tsx"
import { TransformSection } from "../inspector/sections/TransformSection.tsx"
import { TypographySection } from "../inspector/sections/TypographySection.tsx"
import { projectTokenSets } from "../inspector/token-sets.ts"
import { PanelGroup } from "./PanelSection.tsx"
import type { StyleEditor } from "./style-editor.ts"

/**
 * Each section the app draws, by the table's name for it. Layer order draws inside Position, beside Placement, as the
 * approved section has it; the table lists them for the same layers. Grid placement and Raw CSS aren't built yet, and
 * draw nothing: PAR-924 to PAR-935 add them, with what `NodeStyle` can't hold yet.
 */
const sectionViews: Partial<Record<StyleSection, ComponentType<SectionProps>>> = {
  // Until Frame size is built, a frame's root's Size is the frame's own size (see `useStyleEditor`).
  frameSize: SizeSection,
  placement: PositionSection,
  transform: TransformSection,
  size: SizeSection,
  layout: LayoutSection,
  spacing: SpacingSection,
  appearance: AppearanceSection,
  text: TypographySection,
  fill: FillSection,
  stroke: StrokeSection,
  effects: EffectsSection,
  motion: MotionSection
}

/**
 * The sections whose controls make their edits through `SectionProps`' `edit`, and so preview as they're typed. Fill,
 * Effects and Motion make theirs through the style editor itself, as each edit comes.
 */
const liveSections = new Set<StyleSection>([
  "frameSize",
  "placement",
  "size",
  "layout",
  "spacing",
  "appearance",
  "text",
  "stroke"
])

/**
 * The sections drawn inside another, each whole, under the one they follow: Transform inside Position, as how the layer
 * is drawn where it sits, and Spacing inside Size, as the box around the layer, outside in.
 */
const groups: Partial<Record<StyleSection, { title: string; holds: StyleSection }>> = {
  placement: { title: "Position", holds: "transform" },
  frameSize: { title: "Size", holds: "spacing" },
  size: { title: "Size", holds: "spacing" }
}

/** The layer panel leaves out the design, since it never shows a design's root: no layer's id is empty. */
const noRoot: CapabilityDesign = { root: { id: "" } }

/**
 * Every style section the selected layers get, in the order `@parity-app/editor`'s `styleTable` gives, from what
 * they can do (`selectionCapabilities`), on the approved controls in `inspector/controls`. They offer the project's own
 * tokens, and edit the layers' `NodeStyle` through the style editor: what's typed or scrubbed previews on the canvas
 * until it's made, and a run of Up and Down presses is one undo step. Components get the same controls as layouts:
 * what's set on them lands on their root element, over the component's own styles.
 */
export function StyleSections({
  editor,
  container,
  takesStyle
}: {
  editor: StyleEditor
  /** The design the layers are in, which says whether one is its root or a frame's. */
  container?: ContainerSpec
  /** Whether a code component takes the layer's style; unknown counts as taking it. */
  takesStyle?: TakesStyle
}) {
  const can = selectionCapabilities(container ?? noRoot, editor.selection.layers, takesStyle)
  const { sections, controls } = styleParts(can)
  const { edit, live } = useSectionEdits(editor)
  const sets = useMemo(() => projectTokenSets(editor.tokens), [editor.tokens])

  const props: SectionProps = { editor, can, edit, shows: (control) => controls.has(control) }

  const view = (section: StyleSection): ReactNode => {
    const View = sectionViews[section]

    return (
      View && (
        <LiveEditsContext key={section} value={liveSections.has(section) ? live : undefined}>
          <View {...props} />
        </LiveEditsContext>
      )
    )
  }

  // The sections drawn inside the one they follow, which is shown.
  const held = new Set(
    sections.flatMap((section) => {
      const holds = groups[section]?.holds

      return holds !== undefined && sections.includes(holds) ? [holds] : []
    })
  )

  return (
    <ProjectTokens sets={sets}>
      {sections.map((section) => {
        const group = groups[section]

        if (held.has(section)) {
          return null
        }

        if (group && held.has(group.holds)) {
          return (
            <PanelGroup key={section} title={group.title}>
              {view(section)}
              {view(group.holds)}
            </PanelGroup>
          )
        }

        return view(section)
      })}
    </ProjectTokens>
  )
}
