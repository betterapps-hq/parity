import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList
} from "@buildkitgg/shadcn-baseui-kit"
import { type HTMLAttributes, type InputHTMLAttributes, type ReactNode, useState } from "react"
import { ChangeMark, useChanged } from "../inspector/controls/field-parts.tsx"

/** One thing a chip can stand for, as the popup lists it. */
export interface AppChipsOption {
  value: string
  label: string
  /** Before the label, as a layer's kind. */
  icon?: ReactNode
}

/** Options under a heading in the popup, as Components and On this screen. */
export interface AppChipsGroup {
  label: string
  options: readonly AppChipsOption[]
}

/**
 * The box over the kit's chips box, whose classes these replace where they clash: drawn as the panel's text input is
 * (`TextInput`), with its border, fill and corners, at the panel's height and padding. The ring shows while typing in
 * it, as the input's does, but not while its list is open, as a select's button keeps its look while its list is.
 */
const boxClasses =
  "relative min-h-7 w-full min-w-0 gap-1 rounded-lg py-0.5 ps-1.5 pe-2 text-xs has-data-[slot=combobox-chip]:ps-1.5 has-data-[slot=combobox-chip]:pe-2 focus-within:border-input focus-within:ring-0 has-[input:focus-visible:not([aria-expanded=true])]:border-ring has-[input:focus-visible:not([aria-expanded=true])]:ring-3"

/**
 * The app's chips: the kit's Combobox chips composed once, as a panel field draws them, so a field of tags (class
 * names, a slot's layer) doesn't put the parts together itself. `AppChips` is the box, `AppChip` one chip with its ×,
 * and `AppChipsInput` the typing after them. Given `options`, typing in the input filters them in a popup under the box,
 * grouped, and picking one adds it. The kit's chip parts are banned elsewhere (`vite.config.ts`). Base UI keeps the
 * keys: arrows move between chips and through the popup, Enter picks, Escape closes, and Backspace in the empty input
 * removes the last chip.
 */
export function AppChips({
  value,
  onValueChange,
  inputValue,
  onInputValueChange,
  options,
  empty = "No matches",
  className = "",
  children,
  ...box
}: {
  /** What each chip stands for, in order: removing one reports the rest, and picking an option adds it. */
  value: readonly string[]
  onValueChange: (value: string[]) => void
  /** What's typed in `AppChipsInput`, where there is one. */
  inputValue?: string
  onInputValueChange?: (value: string) => void
  /** What the popup offers while typing, in groups. Without them, there's no popup. */
  options?: readonly AppChipsGroup[]
  /** What the popup says when nothing matches what's typed. */
  empty?: string
  className?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className" | "onChange">) {
  const changed = useChanged()
  // The box the popup sits under.
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null)
  const labels = new Map(options?.flatMap((group) => group.options.map((option) => [option.value, option] as const)))
  const items = options?.map((group) => ({ value: group.label, items: group.options.map((option) => option.value) }))

  return (
    <Combobox
      multiple
      items={items}
      itemToStringLabel={(item: string) => labels.get(item)?.label ?? item}
      value={[...value]}
      onValueChange={(next: string[]) => onValueChange(next)}
      inputValue={inputValue}
      onInputValueChange={onInputValueChange && ((next: string) => onInputValueChange(next))}
    >
      <ComboboxChips {...box} ref={setAnchor} className={`${boxClasses} ${className}`}>
        {children}
        {/* Changed in the state being edited, or set over what it comes from (PAR-1020). */}
        {changed && <ChangeMark />}
      </ComboboxChips>
      {options && (
        // As far below the box as a select's list sits below its button (the kit's combobox would leave 6px).
        <ComboboxContent anchor={anchor} sideOffset={4} className="text-xs">
          <ComboboxEmpty className="text-xs">{empty}</ComboboxEmpty>
          <ComboboxList>
            {(group: { value: string; items: string[] }) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>{group.value}</ComboboxLabel>
                <ComboboxCollection>
                  {(item: string) => (
                    <ComboboxItem key={item} value={item} className="text-xs">
                      {labels.get(item)?.icon}
                      <span className="truncate">{labels.get(item)?.label ?? item}</span>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      )}
    </Combobox>
  )
}

/** One chip in `AppChips`, in the panel's 10px, with an × named `removeLabel` that removes it. */
export function AppChip({
  removeLabel,
  className = "",
  children,
  ...props
}: {
  removeLabel: string
  className?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLDivElement>, "children" | "className">) {
  return (
    <ComboboxChip
      removeLabel={removeLabel}
      className={`h-5 max-w-full min-w-0 bg-accent text-2xs font-normal ${className}`}
      {...props}
    >
      {children}
    </ComboboxChip>
  )
}

/** The input after `AppChips`' chips, where a new one is typed or the popup's options searched. */
export function AppChipsInput({
  className = "",
  ...props
}: { className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "value" | "defaultValue">) {
  return (
    <ComboboxChipsInput
      className={`h-5 min-w-12 bg-transparent px-1 text-2xs placeholder:text-xs placeholder:text-muted-foreground ${className}`}
      {...props}
    />
  )
}
