import { ComboboxTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { readLayersDrag } from "@parity-app/editor"
import { ChevronRight, Diamond } from "lucide-react"
import { type DragEvent, type HTMLAttributes, type ReactNode, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { AppChip, AppChips, type AppChipsGroup, AppChipsInput } from "../../chrome/AppChips.tsx"
import { layersMime } from "../../chrome/LayerTree.tsx"

/** A layer filling a slot or offered for it, by the name Layers gives it. */
export interface SlotLayer {
  id: string
  name: string
  /** Its kind's icon, as Layers draws it. */
  icon?: ReactNode
}

/** A layer of the design offered for a slot, nested as Layers nests it. */
export interface OfferedLayer extends SlotLayer {
  depth: number
  /** The name of the layer it's in, shown before its own while searching. */
  parent?: string
}

/** Layers dragged from Layers: the key of the design they're in and their ids. */
export type LayersDrag = NonNullable<ReturnType<typeof readLayersDrag>>

/** A pick of a component is told from a layer's id by this prefix. */
const componentPrefix = "component:"

/**
 * What fills one of an instance's slots, picked as from a select (PAR-1046): its one layer as a chip, with its kind's
 * icon, whose × clears the slot and whose click selects the layer; an input after it, and a chevron. Focusing the input
 * or pressing the chevron lists what can go in, under On this screen, nested as Layers nests it, then Components.
 * Typing searches both, and picking one fills the slot in place of what was there. A layer dragged from Layers onto the
 * box fills it too. The box is drawn as the panel's select is, and takes what it sits in hands it, as a hover card's
 * handlers.
 */
export function SlotPickerField({
  label,
  layer,
  layers,
  components,
  onPickLayer,
  onPickComponent,
  onDropLayers,
  onClear,
  onSelectLayer,
  className = "",
  ...box
}: {
  /** The slot's name, for its box, its input and its chip's ×. */
  label: string
  /** What fills the slot; none while its placeholder shows. A slot holds one layer. */
  layer: SlotLayer | undefined
  /** The design's layers that can go in, in Layers' order. */
  layers: readonly OfferedLayer[]
  /** The project's components that can go in. */
  components: readonly { id: string; name: string }[]
  /** Moves a layer of the design into the slot, in place of what filled it. */
  onPickLayer: (id: string) => void
  /** Fills the slot with a new instance of a component, in place of what filled it. */
  onPickComponent: (id: string) => void
  /** Layers dragged from Layers and dropped on the box. */
  onDropLayers: (drag: LayersDrag) => void
  onClear: () => void
  onSelectLayer: (id: string) => void
  className?: string
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className" | "onChange">) {
  const [query, setQuery] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const searching = query.trim().length > 0
  const drop = useLayerDrop(setDragOver, onDropLayers)

  const options: AppChipsGroup[] = [
    {
      label: "On this screen",
      options: layers.map((offered) => ({
        value: offered.id,
        label: offered.name,
        // Nested as Layers nests them while browsing. Flat while searching, each after the layer it's in, so two
        // matches with the same name can be told apart.
        icon:
          searching && offered.parent ? (
            <span className="flex max-w-1/2 min-w-0 items-center gap-1 text-muted-foreground">
              {offered.icon}
              <span className="truncate">{offered.parent}</span>
              <ChevronRight className="size-3 shrink-0" />
            </span>
          ) : (
            <span className="flex shrink-0" style={{ paddingLeft: searching ? 0 : offered.depth * 12 }}>
              {offered.icon}
            </span>
          )
      }))
    },
    {
      label: "Components",
      options: components.map((component) => ({
        value: `${componentPrefix}${component.id}`,
        label: component.name,
        icon: <Diamond className="size-3 shrink-0" style={{ color: kindColors.component }} />
      }))
    }
  ]

  return (
    <AppChips
      // A pick closes the list: the box starts again with what now fills the slot.
      key={layer?.id ?? "empty"}
      aria-label={label}
      {...box}
      {...drop}
      // A select's corners and its fill on hover, as it picks from a list as a select does.
      className={`rounded-[min(var(--radius-md),10px)] dark:hover:bg-input/50 ${className}`}
      // Lit as a layout in Layers is while a layer would drop inside it.
      style={
        dragOver
          ? {
              borderColor: kindColors.layer,
              boxShadow: `inset 0 0 0 1px ${kindColors.layer}`,
              background: `color-mix(in oklch, ${kindColors.layer} 12%, transparent)`
            }
          : undefined
      }
      data-drop-target={dragOver || undefined}
      value={layer ? [layer.id] : []}
      inputValue={query}
      onInputValueChange={setQuery}
      options={options}
      onValueChange={(next) => {
        // The chips keep a list; the slot keeps one, so a pick stands in for what was there.
        const picked = next.find((value) => value !== layer?.id)
        setQuery("")

        if (picked?.startsWith(componentPrefix)) {
          onPickComponent(picked.slice(componentPrefix.length))
        } else if (picked) {
          onPickLayer(picked)
        } else if (next.length === 0) {
          onClear()
        }
      }}
    >
      {layer && (
        <AppChip
          removeLabel={`Clear ${label}`}
          className="cursor-pointer"
          // A press on the box opens its list; one on the chip doesn't, as it selects the layer instead.
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            // The chip selects its layer; its × only clears the slot.
            event.stopPropagation()

            if (!(event.target instanceof Element && event.target.closest("[data-slot=combobox-chip-remove]"))) {
              onSelectLayer(layer.id)
            }
          }}
        >
          {layer.icon}
          <span className="truncate">{layer.name}</span>
        </AppChip>
      )}
      <AppChipsInput aria-label={`Fill ${label}`} placeholder={layer ? undefined : "Add a layer"} />
      <ComboboxTrigger className="ml-auto flex h-5 shrink-0 items-center pl-1" />
    </AppChips>
  )
}

/** Makes the box take layers dragged from Layers, lighting up while one is over it. */
function useLayerDrop(setDragOver: (over: boolean) => void, onDrop: (drag: LayersDrag) => void) {
  const carriesLayers = (event: DragEvent) => event.dataTransfer.types.includes(layersMime)

  return {
    onDragEnter: (event: DragEvent<HTMLDivElement>) => {
      if (carriesLayers(event)) {
        event.preventDefault()
        setDragOver(true)
      }
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (carriesLayers(event)) {
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
      }
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) {
        setDragOver(false)
      }
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      setDragOver(false)
      const drag = readLayersDrag(event.dataTransfer.getData(layersMime))

      if (drag) {
        event.preventDefault()
        onDrop(drag)
      }
    }
  }
}
