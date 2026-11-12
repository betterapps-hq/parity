import type { ContainerSpec } from "@parity-app/core"
import {
  type CapabilityDesign,
  selectionCapabilities,
  type StyleSection,
  styleParts,
  type TakesStyle
} from "@parity-app/editor"
import { type ComponentType, useMemo } from "react"
import { LiveEditsContext, ProjectTokens, StoresContext } from "../inspector/controls/field-parts.tsx"
import { AppearanceSection } from "../inspector/sections/AppearanceSection.tsx"
import { EffectsSection } from "../inspector/sections/effects.tsx"
import { FillSection } from "../inspector/sections/FillSection.tsx"
import { LayoutSection } from "../inspector/sections/LayoutSection.tsx"
import { PositionSection } from "../inspector/sections/PositionSection.tsx"
import { type SectionProps, useSectionEdits } from "../inspector/sections/section-edits.ts"
import { SizeSection } from "../inspector/sections/SizeSection.tsx"
import { SpacingSection } from "../inspector/sections/SpacingSection.tsx"
import { StrokeSection } from "../inspector/sections/StrokeSection.tsx"
import { TextSection } from "../inspector/sections/TextSection.tsx"
import { projectTokenSets } from "../inspector/token-sets.ts"
import type { StyleEditor } from "./style-editor.ts"

/**
 * Each section the app draws, by the table's name for it. Layer order draws inside Position, beside Placement, as the
 * approved section has it; the table lists them for the same layers. Grid placement, Motion and Raw CSS aren't built
 * yet, and draw nothing: PAR-924 to PAR-935 add them, with what `NodeStyle` can't hold yet.
 */
const sectionViews: Partial<Record<StyleSection, ComponentType<SectionProps>>> = {
  // Until Frame size is built, a frame's root's Size is the frame's own size (see `useStyleEditor`).
  frameSize: SizeSection,
  placement: PositionSection,
  size: SizeSection,
  layout: LayoutSection,
  spacing: SpacingSection,
  appearance: AppearanceSection,
  text: TextSection,
  fill: FillSection,
  stroke: StrokeSection,
  effects: EffectsSection
}

/**
 * The sections whose controls make their edits through `SectionProps`' `edit`, and so preview as they're typed. Fill
 * and Effects make theirs through the style editor itself, as each edit comes.
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
 * Whether the panel can store a part of the approved controls that `NodeStyle` doesn't hold yet: none of them so far,
 * so they draw disabled until PAR-924 to PAR-935 add them.
 */
const storesNothing = () => false

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

  return (
    <ProjectTokens sets={sets}>
      <StoresContext value={storesNothing}>
        {sections.map((section) => {
          const View = sectionViews[section]

          return (
            View && (
              <LiveEditsContext key={section} value={liveSections.has(section) ? live : undefined}>
                <View {...props} />
              </LiveEditsContext>
            )
          )
        })}
      </StoresContext>
    </ProjectTokens>
  )
}
