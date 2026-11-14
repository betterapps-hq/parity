import type { ProjectAction } from "@parity-app/core"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ReactNode } from "react"
import { DesignIcon, designColor, NodeIcon, nodeColor } from "../../canvas/kinds.tsx"
import type { ComponentOffer } from "../../chrome/adapter-actions.ts"
import { PanelColumn } from "../../chrome/inspector-stories.tsx"
import type { HeaderAction } from "../../chrome/layer-kind.ts"
import { panelEnd } from "../../chrome/PanelSection.tsx"
import { HeaderActions, headingIcon, headingName, SelectionHeading } from "../../chrome/SelectionHeading.tsx"

/**
 * Open in editor in a selection's header, set aside on 2026-11-12 with the rest of the code side (PAR-1027) and kept as
 * the design to come back to. The code button sat at the end of the header's row: on a code component placed in a
 * design, after Open in Storybook, opening its file in the person's editor; and on a design, opening the file it's
 * saved in.
 */
const meta = {
  title: "Parity/Explorations/Code/Open in editor",
  parameters: { layout: "fullscreen" }
} satisfies Meta

export default meta

type Story = StoryObj<typeof meta>

/** Storybook's action, as its adapter offers it for a component with stories. */
const openInStorybook: ProjectAction = {
  adapter: "storybook",
  id: "open",
  name: "Open in Storybook",
  progress: "Opening Storybook…",
  failed: "Couldn't open Storybook"
}

/** A header as the inspector draws it, with the actions it had. */
function Header({
  icon,
  color,
  kind,
  name,
  actions,
  adapterOffers
}: {
  icon: ReactNode
  color: string
  kind: string
  name: string
  actions: HeaderAction[]
  adapterOffers?: ComponentOffer[]
}) {
  return (
    <PanelColumn>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <SelectionHeading
          icon={icon}
          color={color}
          kind={kind}
          name={<span className={`truncate px-1.5 ${headingName}`}>{name}</span>}
          action={<HeaderActions actions={actions} onAction={() => undefined} adapterOffers={adapterOffers} />}
        />
      </div>
    </PanelColumn>
  )
}

const signInCard = { type: "component", id: "card", component: "nova/Card" } as const

/** A code component placed in a design: Open in Storybook, then Open in editor at its file. */
export const CodeComponentInstance: Story = {
  render: () => (
    <Header
      icon={<NodeIcon node={signInCard} className={headingIcon} />}
      color={nodeColor(signInCard)}
      kind="Component instance"
      name="Sign in card"
      actions={["open-in-editor"]}
      adapterOffers={[{ action: openInStorybook }]}
    />
  )
}

/** A component design: Open in editor at the file it's saved in. */
export const ComponentDesign: Story = {
  render: () => (
    <Header
      icon={<DesignIcon kind="component" className={headingIcon} />}
      color={designColor("component")}
      kind="Component"
      name="Plan card"
      actions={["open-in-editor"]}
    />
  )
}
