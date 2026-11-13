import { Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import {
  clearSlot,
  type ContainerSpec,
  type DesignNode,
  fillSlotWithComponent,
  fillSlotWithLayer,
  findNode,
  type InstanceNode,
  type InstanceSlot,
  instanceSlots,
  slotCandidates,
  slotComponents
} from "@parity-app/core"
import { slotPreviewTree } from "@parity-app/editor"
import { ArrowLeft, SquareDashed } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import { toast } from "sonner"
import { useProject } from "../canvas/context.ts"
import { kindColors, layerLabel, nodeColor, NodeIcon } from "../canvas/kinds.tsx"
import { projectLibrary } from "../canvas/layers.ts"
import { treePreviewJob, useOneOffPreview } from "../component-previews.ts"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import { Field, FieldGrid } from "../inspector/controls/field-row.tsx"
import { shownName, TypeTile } from "../inspector/controls/instance-section.tsx"
import { type LayersDrag, SlotPickerField } from "../inspector/controls/slot-picker.tsx"
import { useHoverCard } from "./hover-card.ts"
import { updateAndRecord } from "./inspector-events.ts"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
import { revealSelection } from "./reveal.ts"

/*
 * An instance's slots (PAR-84): in its panel each is a row after the params, picking what fills it from the design's
 * layers and the project's components (PAR-1046), with a picture of what shows there on hover; selected, a slot has a
 * panel of its own, and a click in Components adds into it.
 */

const slotColor = kindColors.component

/** The names of the layers filling a slot, as Layers names them; none while it shows its placeholder. */
function useFillNames(slot: InstanceSlot): string[] {
  const session = useProject()
  const entries = useContainerEntries(session.store)
  const library = session.store.getComponentLibrary()

  return slot.fill.map((node) => layerLabel(node, entries, library, session.info.libraries))
}

/**
 * Changes what fills a slot as one undoable step, recorded as the slot's layers, by id, before and after (PAR-713).
 */
function useSlotChange(entry: ContainerEntry, instance: InstanceNode) {
  const { store } = useProject()

  return (slot: InstanceSlot, label: string, change: (container: ContainerSpec) => ContainerSpec) =>
    updateAndRecord(store, entry.key, label, change, {
      field: `slots.${slot.name}`,
      layers: [instance.id],
      read: (container) => {
        const node = findNode(container.root, instance.id)

        return node?.type === "instance" ? node.slots?.[slot.name]?.map((layer) => layer.id) : undefined
      }
    })
}

/** Clears a slot as one undoable step, deleting what fills it. */
function useClear(entry: ContainerEntry, instance: InstanceNode) {
  const change = useSlotChange(entry, instance)

  return (slot: InstanceSlot) =>
    change(slot, `Clear ${slot.name}`, (container) => ({
      ...container,
      root: clearSlot(container.root, instance.id, slot.name)
    }))
}

/** What fills a slot, as its card and its panel say it: its layer's name, or nothing while it's empty. */
function SlotState({ slot }: { slot: InstanceSlot }) {
  const [name] = useFillNames(slot)

  return name === undefined ? null : <span className="min-w-0 truncate text-xs">{name}</span>
}

/**
 * A picture of what shows in a slot, drawn by itself: what the instance fills it with, or its placeholder, faded inside
 * a dashed edge, while it's empty.
 */
function SlotPicture({ slot }: { slot: InstanceSlot }) {
  const session = useProject()
  const filled = slot.fill.length > 0
  const library = session.store.getComponentLibrary()

  const job = treePreviewJob(session, `slot:${slot.node.id}:${JSON.stringify(slot.fill).length}`, (viewport) =>
    slotPreviewTree(slot, library, viewport)
  )

  const preview = useOneOffPreview(job)
  const edge = filled ? "ring-1 ring-border ring-inset" : "border border-dashed border-muted-foreground/40"
  let shown: ReactNode

  if (preview?.image) {
    shown = (
      <img
        src={preview.image.large}
        alt=""
        width={preview.image.width / 2}
        height={preview.image.height / 2}
        className={`max-h-48 max-w-full object-contain ${filled ? "" : "opacity-50"}`}
      />
    )
  } else if (preview?.error) {
    shown = <span className="type-message text-muted-foreground">{preview.error}</span>
  } else {
    // A shimmer while it's drawn, as a component's preview has.
    shown = (
      <>
        <span
          aria-hidden
          data-process-motion
          className="h-20 w-full rounded"
          style={{
            background:
              "linear-gradient(100deg, var(--muted) 30%, color-mix(in oklch, var(--muted), var(--foreground) 10%) 50%, var(--muted) 70%) 0 0 / 200% 100%",
            animation: "process-shimmer 1.6s linear infinite"
          }}
        />
        <span className="sr-only">Drawing a picture of it</span>
      </>
    )
  }

  return (
    <div className={`grid min-h-24 place-items-center overflow-hidden rounded-md bg-muted/40 p-2 ${edge}`}>{shown}</div>
  )
}

/** A slot's card beside its row, opened by resting the pointer on the row or by the left arrow key, as a component's is. */
function SlotCard({
  slot,
  card,
  children
}: {
  slot: InstanceSlot
  card: ReturnType<typeof useHoverCard>
  children: ReactElement
}) {
  const filled = slot.fill.length > 0

  return (
    <Popover open={card.open} onOpenChange={card.setOpen}>
      {/* The row opens its card by resting on it or by a key; a click opens its list instead. */}
      <PopoverTrigger render={children} nativeButton={false} onClick={(event) => event.preventBaseUIHandler()} />
      <PopoverContent
        className="flex w-72 flex-col gap-2 p-3"
        align="start"
        side="left"
        sideOffset={12}
        id={card.id}
        initialFocus={card.takesFocus}
        finalFocus={card.returnFocus}
        onPointerEnter={card.stay}
        onPointerLeave={card.leave}
      >
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-mono">{slot.name}</span>
          <span className="ml-auto flex items-center gap-1.5">
            <SlotState slot={slot} />
          </span>
        </div>
        {card.open && <SlotPicture slot={slot} />}
        {!filled && <p className="text-xs text-muted-foreground">Placeholder showing</p>}
      </PopoverContent>
    </Popover>
  )
}

/**
 * One slot after an instance's params: what fills it, picked from the design's layers and the project's components or
 * dropped from Layers (PAR-1046), its card, and Clear inside the field.
 */
function SlotRow({ entry, instance, slot }: { entry: ContainerEntry; instance: InstanceNode; slot: InstanceSlot }) {
  const session = useProject()
  const entries = useContainerEntries(session.store)
  const library = session.store.getComponentLibrary()
  const card = useHoverCard()
  const clear = useClear(entry, instance)
  const change = useSlotChange(entry, instance)
  const label = shownName(slot.name)
  const candidates = slotCandidates(entry.container.root, instance.id)

  const named = (node: DesignNode) => layerLabel(node, entries, library, session.info.libraries)

  const shown = (node: DesignNode) => ({
    id: node.id,
    name: named(node),
    icon: (
      <NodeIcon
        node={node}
        libraries={session.info.libraries}
        className="size-3 shrink-0"
        style={{ color: nodeColor(node) }}
      />
    )
  })

  const fillWith = (id: string) =>
    change(slot, `Fill ${slot.name}`, (container) => fillSlotWithLayer(container, instance.id, slot.name, id))

  // Only the design's own layers can go in, and of those, not the instance or what it's inside.
  const drop = ({ design, ids }: LayersDrag) => {
    const first = ids[0]
    const dropped = first === undefined ? undefined : findNode(entry.container.root, first)
    const allowed = candidates.find((candidate) => ids.includes(candidate.node.id))

    if (design !== entry.key) {
      toast.info(`Only layers in this design can go in ${label}`)
    } else if (allowed) {
      fillWith(allowed.node.id)
    } else if (dropped) {
      toast.info(
        first === instance.id
          ? `${named(dropped)} can't go in its own slot`
          : `${named(dropped)} can't go in ${label}, which is inside it`
      )
    }
  }

  const select = (node: string) => {
    session.selection.set({ design: entry.key, node })
    revealSelection(session)
  }

  return (
    <Field label={label} icon={<TypeTile type="slot" />} hint="Shown in place of its placeholder">
      <SlotCard slot={slot} card={card}>
        {/* The card sits by the row's box: resting on it, or the left arrow key in an empty input, opens it. */}
        <div className="min-w-0">
          <SlotPickerField
            label={label}
            layer={slot.fill[0] && shown(slot.fill[0])}
            layers={candidates.map(({ node, depth, parent }) => ({
              ...shown(node),
              depth,
              parent: parent && named(parent)
            }))}
            components={slotComponents(
              entries.map((each) => each.container),
              entry.container,
              instance
            ).map(({ id, name }) => ({ id, name }))}
            onPickLayer={fillWith}
            onPickComponent={(component) =>
              change(
                slot,
                `Fill ${slot.name}`,
                (container) => fillSlotWithComponent(container, instance.id, slot.name, component).container
              )
            }
            onDropLayers={drop}
            onClear={() => clear(slot)}
            onSelectLayer={select}
            aria-describedby={card.open ? card.id : undefined}
            onPointerEnter={card.enter}
            onPointerLeave={card.leave}
            onKeyDown={(event) => {
              // Typed text keeps the arrow, to move through it.
              if (event.key === "ArrowLeft" && !(event.target instanceof HTMLInputElement && event.target.value)) {
                card.openWithKeyboard()
              }
            }}
          />
        </div>
      </SlotCard>
    </Field>
  )
}

/** One of the design's own instances' slots, after its params. Nothing for a component without slots. */
export function InstanceSlotFields({ entry, instance }: { entry: ContainerEntry; instance: InstanceNode }) {
  const { store } = useProject()
  const slots = instanceSlots(instance, projectLibrary(store))

  return (
    slots.length > 0 && (
      <FieldGrid>
        {slots.map((slot) => (
          <SlotRow key={slot.node.id} entry={entry} instance={instance} slot={slot} />
        ))}
      </FieldGrid>
    )
  )
}

/**
 * A selected slot of one of the design's instances, which a click in Components adds into: its name, the instance it's
 * in, a picture of what shows there, and Clear.
 */
export function SlotPanel({
  entry,
  instance,
  slot
}: {
  entry: ContainerEntry
  instance: InstanceNode
  slot: InstanceSlot
}) {
  const session = useProject()
  const { store } = session
  const entries = useContainerEntries(store)
  const clear = useClear(entry, instance)
  const filled = slot.fill.length > 0
  const name = layerLabel(instance, entries, store.getComponentLibrary(), session.info.libraries)

  return (
    <>
      <div className={`border-b py-3 pl-4 ${panelEnd}`}>
        <div className="flex h-7 items-center gap-2">
          <SquareDashed className="size-4 shrink-0" style={{ color: slotColor }} />
          {/* The selection's title, in code, so at code's semibold rather than a name's. */}
          <span className="truncate px-1.5 font-mono text-base font-semibold">{slot.name}</span>
        </div>
        <p className="mt-0.5 flex items-center gap-1 pl-6 text-xs text-muted-foreground">
          Slot in
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => {
              session.selection.set({ design: entry.key, node: instance.id })
              revealSelection(session)
            }}
          >
            <ArrowLeft className="size-3" /> {name}
          </Button>
        </p>
      </div>
      <PanelSection
        title="Contents"
        action={
          filled && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => clear(slot)}>
              Clear
            </Button>
          )
        }
      >
        <div className="mb-2 flex items-center gap-1.5 px-1 text-xs">
          <SlotState slot={slot} />
          {!filled && <span className="text-muted-foreground">Placeholder showing</span>}
        </div>
        <SlotPicture slot={slot} />
        <p className="type-description mt-3 px-1 text-muted-foreground">
          Click a component in Components to add it here.
        </p>
      </PanelSection>
    </>
  )
}
