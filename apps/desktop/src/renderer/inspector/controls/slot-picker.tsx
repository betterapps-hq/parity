import type { HTMLAttributes, ReactNode } from "react"
import { AppChip, AppChips } from "../../chrome/AppChips.tsx"

/** The layer filling a slot, by the name Layers gives it. */
export interface SlotLayer {
  id: string
  name: string
  /** Its kind's icon, as Layers draws it. */
  icon?: ReactNode
}

/**
 * What fills one of an instance's slots, on the app's chips (`AppChips`), as class names are: its one layer as a chip,
 * with its kind's icon, whose × clears the slot and whose click selects the layer, so it can be renamed; an empty box
 * while the placeholder shows. The box takes what it sits in hands it, as a hover card's handlers.
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
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className" | "onChange">) {
  return (
    <AppChips
      aria-label={label}
      {...box}
      className={className}
      value={layer ? [layer.id] : []}
      onValueChange={(next) => {
        if (next.length === 0) {
          onClear()
        }
      }}
    >
      {layer && (
        <AppChip
          removeLabel={`Clear ${label}`}
          className="cursor-pointer"
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
        </AppChip>
      )}
    </AppChips>
  )
}
