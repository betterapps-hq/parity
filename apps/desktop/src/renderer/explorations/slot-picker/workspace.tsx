import { TabsContent } from "@buildkitgg/shadcn-baseui-kit"
import {
  type ContainerSpec,
  type DesignNode,
  findNode,
  type InstanceNode,
  type InstanceSlot,
  instanceSlots,
  mapNode
} from "@parity-app/core"
import { Accessibility, MonitorSmartphone, SlidersHorizontal } from "lucide-react"
import { type ReactNode, useEffect } from "react"
import { toast } from "sonner"
import { useProject } from "../../canvas/context.ts"
import { layerLabel, nodeColor, NodeIcon } from "../../canvas/kinds.tsx"
import { projectLibrary } from "../../canvas/layers.ts"
import { AccessibilityPanel } from "../../chrome/AccessibilityPanel.tsx"
import { DesignTabFields } from "../../chrome/DesignPanel.tsx"
import { LayerHeader } from "../../chrome/LayerPanel.tsx"
import { LeftPanel } from "../../chrome/LeftPanel.tsx"
import { ModesPanel } from "../../chrome/ModesPanel.tsx"
import { booleanValue, readPropValue, textValue } from "../../chrome/prop-values.ts"
import { revealSelection } from "../../chrome/reveal.ts"
import { useSelectedLayer } from "../../chrome/selected-layer.ts"
import { SidePanel } from "../../chrome/SidePanel.tsx"
import { type ContainerEntry, useContainerEntries } from "../../design-store.ts"
import { Field, FieldGrid } from "../../inspector/controls/field-row.tsx"
import { InstanceSection, type PropRow, shownName, TypeTile } from "../../inspector/controls/instance-section.tsx"
import { ProjectStage } from "../../stories/fixtures.tsx"
import { type LayersDrag, layersMime, type PickerLayer, SlotAutocomplete } from "./slot-autocomplete.tsx"
import { addToSlot, moveIntoSlot, removeFromSlot, screenLayers, slotComponents } from "./slot-options.ts"

/**
 * The window as the app lays it out: the shipped Layers on the left, where the canvas would be in the middle, and the
 * inspector on the right. A selected instance's Component instance section is the shipped one, with its slots drawn as
 * the autocomplete; every other part is the shipped one.
 */
export function SlotPickerWorkspace({ dragOver }: { dragOver?: string }) {
  return (
    <ProjectStage className="flex h-screen bg-background text-foreground">
      <KeepSelectionWhileDragging />
      <LeftPanel />
      <div aria-hidden className="min-w-0 flex-1 bg-muted/40" />
      <SidePanel
        side="right"
        label="Inspector"
        defaultTab="design"
        tabs={[
          { value: "design", label: "Design", icon: SlidersHorizontal },
          { value: "modes", label: "Modes", icon: MonitorSmartphone },
          { value: "accessibility", label: "Accessibility", icon: Accessibility }
        ]}
      >
        <Scrolling value="design">
          <DesignTabFields>
            <LayerHeader />
            <InstancePanel dragOver={dragOver} />
          </DesignTabFields>
        </Scrolling>
        <Scrolling value="modes">
          <ModesPanel />
        </Scrolling>
        <Scrolling value="accessibility">
          <AccessibilityPanel />
        </Scrolling>
      </SidePanel>
    </ProjectStage>
  )
}

/**
 * Layers selects a row as it starts dragging it, which would swap the inspector to that layer before it reaches the
 * slot's box. Here the selection stays put while a layer is dragged, so the instance's panel is still there to drop on.
 */
function KeepSelectionWhileDragging() {
  const { selection } = useProject()

  useEffect(() => {
    let before = selection.get()

    // Before Layers' handler, which selects the row.
    const remember = () => {
      before = selection.get()
    }

    // After it, once the drag says it carries layers.
    const restore = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes(layersMime)) {
        selection.set(before)
      }
    }

    document.addEventListener("dragstart", remember, true)
    document.addEventListener("dragstart", restore)

    return () => {
      document.removeEventListener("dragstart", remember, true)
      document.removeEventListener("dragstart", restore)
    }
  }, [selection])

  return null
}

function Scrolling({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsContent value={value} className="min-h-0 overflow-x-hidden overflow-y-auto">
      {children}
    </TabsContent>
  )
}

/** The selected instance's section: its props as the shipped section draws them, then each slot's autocomplete. */
function InstancePanel({ dragOver }: { dragOver?: string }) {
  const session = useProject()
  const { store } = session
  const entries = useContainerEntries(store)
  const layer = useSelectedLayer()
  const instance = layer?.layer

  if (!layer || instance?.type !== "instance") {
    return null
  }

  const component = entries.find((candidate) => candidate.container.id === instance.design)?.container
  const slots = instanceSlots(instance, projectLibrary(store))

  return (
    <InstanceSection
      component={component?.name ?? instance.design}
      props={propRows(component, instance)}
      onChange={(name, value) =>
        store.updateContainer(layer.entry.key, `Change ${name}`, (container) => ({
          ...container,
          root: mapNode(container.root, instance.id, (node) =>
            node.type === "instance" ? { ...node, args: { ...node.args, [name]: value } } : node
          )
        }))
      }
    >
      {slots.length > 0 && (
        <FieldGrid>
          {slots.map((slot) => (
            <SlotRow
              key={slot.node.id}
              entry={layer.entry}
              instance={instance}
              slot={slot}
              dragOver={dragOver === slot.name}
            />
          ))}
        </FieldGrid>
      )}
    </InstanceSection>
  )
}

/** A component design's params as rows, with what the instance gives each. Plan card's are all text and switches. */
function propRows(component: ContainerSpec | undefined, instance: InstanceNode): PropRow[] {
  return Object.entries(component?.params ?? {}).map(([name, param]): PropRow => {
    const held = readPropValue(instance.args?.[name])
    const fallback = readPropValue(param.default)

    if (param.type === "boolean") {
      return { name, type: "boolean", value: booleanValue.safeParse(held ?? fallback).data ?? false }
    }

    return {
      name,
      type: "text",
      value: textValue.safeParse(held).data,
      default: textValue.safeParse(fallback).data
    }
  })
}

/** One slot: what fills it, and the autocomplete that adds to it, writing to the design as the app would. */
function SlotRow({
  entry,
  instance,
  slot,
  dragOver
}: {
  entry: ContainerEntry
  instance: InstanceNode
  slot: InstanceSlot
  dragOver: boolean
}) {
  const session = useProject()
  const { store } = session
  const entries = useContainerEntries(store)
  const library = store.getComponentLibrary()
  const label = shownName(slot.name)

  const asPicked = (node: DesignNode): PickerLayer => ({
    id: node.id,
    name: layerLabel(node, entries, library, session.info.libraries),
    icon: (
      <NodeIcon
        node={node}
        libraries={session.info.libraries}
        className="size-3 shrink-0"
        style={{ color: nodeColor(node) }}
      />
    )
  })

  const update = (what: string, change: (container: ContainerSpec) => ContainerSpec) =>
    store.updateContainer(entry.key, what, change)

  const moveLayers = (ids: readonly string[]) =>
    update(`Fill ${slot.name}`, (container) => ({
      ...container,
      root: moveIntoSlot(container.root, instance.id, slot.name, ids)
    }))

  const dropLayers = (drag: LayersDrag) => {
    const allowed = new Set(screenLayers(entry.container.root, instance.id).map((each) => each.node.id))

    if (drag.design !== entry.key) {
      toast.info(`Only layers in this design can go in ${label}`)

      return
    }

    if (!drag.ids.some((id) => allowed.has(id))) {
      const dropped = findNode(entry.container.root, drag.ids[0]!)
      const name = dropped ? asPicked(dropped).name : "That layer"

      toast.info(
        drag.ids[0] === instance.id
          ? `${name} can't go in its own slot`
          : `${name} can't go in ${label}, which is inside it`
      )

      return
    }

    moveLayers(drag.ids)
  }

  const select = (node: string) => {
    session.selection.set({ design: entry.key, node })
    revealSelection(session)
  }

  return (
    <Field
      label={label}
      icon={<TypeTile type="slot" />}
      hint="Layers from this design, shown in place of its placeholder"
    >
      <SlotAutocomplete
        label={label}
        fill={slot.fill.map(asPicked)}
        components={slotComponents(
          entries.map((each) => each.container),
          instance
        )}
        layers={screenLayers(entry.container.root, instance.id).map((each) => ({
          ...asPicked(each.node),
          depth: each.depth,
          parent: each.parent && asPicked(each.parent).name
        }))}
        onAddComponent={(component) =>
          update(`Fill ${slot.name}`, (container) => ({
            ...container,
            root: addToSlot(container.root, instance.id, slot.name, component)
          }))
        }
        onMoveLayers={moveLayers}
        onDropLayers={dropLayers}
        onRemove={(id) => update(`Remove from ${slot.name}`, (container) => removeFromSlot(container, id))}
        onSelectLayer={select}
        defaultDragOver={dragOver}
      />
    </Field>
  )
}
