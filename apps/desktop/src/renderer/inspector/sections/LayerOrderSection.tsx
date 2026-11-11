import { PanelSection } from "../../chrome/PanelSection.tsx"
import type { StyleEditor } from "../../chrome/style-editor.ts"
import { ProjectTokens, useTokenSets } from "../controls/field-parts.tsx"
import { LayerOrderField } from "../controls/pin-box.tsx"
import { layerOrderSide, stackingName, zIndexOf, projectZIndexTokens } from "./layer-order.ts"

/**
 * Layer order (PAR-925): the selected layers' z-index, a whole number or one of the project's z-index tokens, Auto
 * when unset. Its hint names the stacking context it orders them within.
 */
export function LayerOrderSection({ editor }: { editor: StyleEditor }) {
  const { selection } = editor
  const sets = { ...useTokenSets(), zIndex: projectZIndexTokens(editor.tokens) }

  return (
    <PanelSection title="Layer order">
      <ProjectTokens sets={sets}>
        <LayerOrderField
          value={layerOrderSide(selection.style.zIndex)}
          mixed={selection.differs("layerOrder")}
          context={stackingName(selection.stacking)}
          changed={selection.changed("layerOrder")}
          onReset={() => editor.reset("layerOrder")}
          onChange={(next) => editor.set("layerOrder", { zIndex: zIndexOf(next) }, "Change layer order")}
        />
      </ProjectTokens>
    </PanelSection>
  )
}
