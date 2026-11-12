import { Combobox, ComboboxChip, ComboboxChips } from "@buildkitgg/shadcn-baseui-kit"
import type { HTMLAttributes, ReactNode } from "react"
import { ChangeMark, useChanged } from "./field-parts.tsx"

/** The layer filling a slot, by the name Layers gives it. */
export interface SlotLayer {
  id: string
  name: string
  /** Its kind's icon, as Layers draws it. */
  icon?: ReactNode
}

/**
 * What fills one of an instance's slots, on the kit's Combobox chips, as class names are: its one layer as a chip, with its
 * kind's icon, whose
 * × clears the slot and whose click selects the layer, so it can be renamed; an empty box while the placeholder shows.
 * The box takes the props of what it sits in, as a hover card's trigger, and draws the change mark where the value's
 * changed (PAR-1020).
 */
export function SlotPickerField({
  label,
  layer,
  onClear,
  onSelectLayer,
  className = "",
  ...box
}: {
  /** The slot's name, for its box and its chip's ×. */
  label: string
  layer: SlotLayer | undefined
  onClear: () => void
  onSelectLayer: (id: string) => void
  className?: string
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  const changed = useChanged()

  return (
    <Combobox
      multiple
      value={layer ? [layer.id] : []}
      onValueChange={(next: string[]) => {
        if (next.length === 0) {
          onClear()
        }
      }}
    >
      <ComboboxChips
        aria-label={label}
        {...box}
        className={`relative min-h-7 w-full min-w-0 gap-1 rounded-md border-0 bg-muted/50 px-1 py-1 text-xs ring-inset hover:ring-1 hover:ring-border dark:bg-input/40 ${className}`}
      >
        {layer && (
          <ComboboxChip
            removeLabel={`Clear ${label}`}
            className="h-5 max-w-full min-w-0 cursor-pointer bg-accent text-2xs font-normal"
            onClick={(event) => {
              // The chip selects its layer; its × only clears, and neither selects the slot behind them.
              event.stopPropagation()

              if (!(event.target instanceof Element && event.target.closest("[data-slot=combobox-chip-remove]"))) {
                onSelectLayer(layer.id)
              }
            }}
          >
            {layer.icon}
            <span className="truncate">{layer.name}</span>
          </ComboboxChip>
        )}
        {changed && <ChangeMark />}
      </ComboboxChips>
    </Combobox>
  )
}
