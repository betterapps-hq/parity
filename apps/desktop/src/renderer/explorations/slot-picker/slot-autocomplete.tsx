import { ComboboxTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { readLayersDrag } from "@parity-app/editor"
import { ChevronRight, Diamond } from "lucide-react"
import { type DragEvent, type ReactNode, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { AppChip, AppChips, type AppChipsGroup, AppChipsInput } from "../../chrome/AppChips.tsx"

/*
 * The slot picker as an autocomplete: the one layer filling a slot as a chip, as the shipped picker shows it, with an
 * input after it and a chevron at the end. Focusing the input or pressing the chevron lists what can go in, under
 * Components and On this screen; typing searches both, and picking one fills the slot, in place of what filled it. A
 * layer dragged from Layers onto the box fills it too.
 */

/** The drag Layers starts, as LayerTree sets it. */
const layersMime = "application/x-parity-layers"

/** Layers dragged from Layers: the key of the design they're in and their ids. */
export type LayersDrag = NonNullable<ReturnType<typeof readLayersDrag>>

/** Picks of a component are told from a layer's id by this prefix. */
const componentPrefix = "component:"

/** A layer filling the slot or offered for it, by the name Layers gives it. */
export interface PickerLayer {
  id: string
  name: string
  /** Its kind's icon, as Layers draws it. */
  icon: ReactNode
}

/** A layer offered for the slot, nested as Layers nests it. */
export interface OfferedLayer extends PickerLayer {
  depth: number
  /** The name of the layer it's in, shown before its own while searching. */
  parent?: string
}

export interface SlotAutocompleteProps {
  /** The slot's name, for the box and the chip's ×. */
  label: string
  /** The layer filling the slot; none while its placeholder shows. A slot holds one at most. */
  layer: PickerLayer | undefined
  /** The project's components that can go in. */
  components: readonly { id: string; name: string }[]
  /** The design's layers that can go in, in Layers' order. */
  layers: readonly OfferedLayer[]
  /** Fills the slot with a new instance of a component, in place of what filled it. */
  onPickComponent: (id: string) => void
  /** Moves a layer into the slot, in place of what filled it. */
  onPickLayer: (id: string) => void
  /** Layers dragged from Layers and dropped on the box; the first of them fills the slot. */
  onDropLayers: (drag: LayersDrag) => void
  onClear: () => void
  onSelectLayer: (id: string) => void
  /** Starts the box as a drop target, for a story that shows a drag in progress. */
  defaultDragOver?: boolean
}

export function SlotAutocomplete({
  label,
  layer,
  components,
  layers,
  onPickComponent,
  onPickLayer,
  onDropLayers,
  onClear,
  onSelectLayer,
  defaultDragOver = false
}: SlotAutocompleteProps) {
  const [query, setQuery] = useState("")
  const [dragOver, setDragOver] = useState(defaultDragOver)
  const searching = query.trim().length > 0
  const box = useLayerDrop(setDragOver, onDropLayers)

  const options: AppChipsGroup[] = [
    {
      label: "Components",
      options: components.map((component) => ({
        value: `${componentPrefix}${component.id}`,
        label: component.name,
        icon: <Diamond className="size-3 shrink-0" style={{ color: kindColors.component }} />
      }))
    },
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
    }
  ]

  return (
    <AppChips
      // A pick closes the list: the box starts again with what now fills the slot.
      key={layer?.id ?? "empty"}
      aria-label={label}
      value={layer ? [layer.id] : []}
      inputValue={query}
      onInputValueChange={setQuery}
      options={options}
      // Lit as a layout in Layers is while a layer would drop inside it.
      style={
        dragOver
          ? {
              boxShadow: `inset 0 0 0 2px ${kindColors.layer}`,
              background: `color-mix(in oklch, ${kindColors.layer} 12%, transparent)`
            }
          : undefined
      }
      data-drop-target={dragOver || undefined}
      {...box}
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
      <ComboboxTrigger className="ml-auto flex h-5 shrink-0 items-center pr-1.5 pl-1" />
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
