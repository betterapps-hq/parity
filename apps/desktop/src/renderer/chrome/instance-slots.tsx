import { Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { clearSlot, findNode, type InstanceNode, type InstanceSlot, instanceSlots } from "@parity-app/core"
import { slotPreviewTree } from "@parity-app/editor"
import { ArrowLeft, SquareDashed } from "lucide-react"
import type { ReactElement, ReactNode } from "react"
import { useProject } from "../canvas/context.ts"
import { kindColors, layerLabel, nodeColor, NodeIcon } from "../canvas/kinds.tsx"
import { projectLibrary } from "../canvas/layers.ts"
import { treePreviewJob, useOneOffPreview } from "../component-previews.ts"
import { type ContainerEntry, useContainerEntries } from "../design-store.ts"
import { Field, FieldGrid } from "../inspector/controls/field-row.tsx"
import { shownName, TypeTile } from "../inspector/controls/instance-section.tsx"
import { SlotPickerField } from "../inspector/controls/slot-picker.tsx"
import { useHoverCard } from "./hover-card.ts"
import { updateAndRecord } from "./inspector-events.ts"
import { PanelSection, panelEnd } from "./PanelSection.tsx"
import { revealSelection } from "./reveal.ts"

/*
 * An instance's slots (PAR-84): in its panel each is a row after the params, saying whether the instance fills it,
 * with a picture of what shows there on hover; selected, a slot has a panel of its own, and a click in Components adds
 * into it.
 */

const slotColor = kindColors.component

/** The path that selects an instance's slot: the instance, then the component's slot layout (see `slotAtPath`). */
const slotPath = (instance: InstanceNode, slot: InstanceSlot) => `${instance.id}/${slot.node.id}`

/** The names of the layers filling a slot, as Layers names them; none while it shows its placeholder. */
function useFillNames(slot: InstanceSlot): string[] {
  const session = useProject()
  const entries = useContainerEntries(session.store)
  const library = session.store.getComponentLibrary()

  return slot.fill.map((node) => layerLabel(node, entries, library, session.info.libraries))
}

/**
 * Clears a slot as one undoable step, deleting what fills it. It's recorded as the slot's layers, by id, before and
 * after (PAR-713).
 */
function useClear(entry: ContainerEntry, instance: InstanceNode) {
  const { store } = useProject()

  return (slot: InstanceSlot) =>
    updateAndRecord(
      store,
      entry.key,
      `Clear ${slot.name}`,
      (container) => ({ ...container, root: clearSlot(container.root, instance.id, slot.name) }),
      {
        field: `slots.${slot.name}`,
        layers: [instance.id],
        read: (container) => {
          const node = findNode(container.root, instance.id)

          return node?.type === "instance" ? node.slots?.[slot.name]?.map((layer) => layer.id) : undefined
        }
      }
    )
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
      {/* The row opens its card by resting on it or by a key; a click selects the slot instead. */}
      <PopoverTrigger render={children} onClick={(event) => event.preventBaseUIHandler()} />
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

/** One slot after an instance's params: what fills it, a click to select it, its card, and Clear inside the field. */
function SlotRow({ entry, instance, slot }: { entry: ContainerEntry; instance: InstanceNode; slot: InstanceSlot }) {
  const session = useProject()
  const card = useHoverCard()
  const clear = useClear(entry, instance)
  const [name] = useFillNames(slot)
  const layer = slot.fill[0]

  const select = (node: string) => {
    session.selection.set({ design: entry.key, node })
    revealSelection(session)
  }

  return (
    <Field
      label={shownName(slot.name)}
      icon={<TypeTile type="slot" />}
      hint="Layers from this design, shown in place of its placeholder"
    >
      <SlotCard slot={slot} card={card}>
        {/* The card sits by the row's box: resting on it or the left arrow key opens it, and a click selects the slot. */}
        <div className="min-w-0">
          <SlotPickerField
            label={shownName(slot.name)}
            layer={
              layer && {
                id: layer.id,
                name: name ?? "",
                icon: (
                  <NodeIcon
                    node={layer}
                    libraries={session.info.libraries}
                    className="size-3 shrink-0"
                    style={{ color: nodeColor(layer) }}
                  />
                )
              }
            }
            onClear={() => clear(slot)}
            onSelectLayer={select}
            aria-describedby={card.open ? card.id : undefined}
            onPointerEnter={card.enter}
            onPointerLeave={card.leave}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault()
                card.openWithKeyboard()
              }
            }}
            onClick={() => select(slotPath(instance, slot))}
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
