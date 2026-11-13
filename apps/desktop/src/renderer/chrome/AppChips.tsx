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

/** How the box is drawn, over the kit's chips box, whose classes these replace where they clash. */
const looks = {
  /** As the panel's text fields: filled, without a border, ringed on hover and while typing. */
  field:
    "rounded-md border-0 bg-muted/50 px-1 py-1 ring-inset focus-within:ring-1 focus-within:ring-ring hover:not-focus-within:ring-1 hover:not-focus-within:ring-border dark:bg-input/40",
  /**
   * As the panel's select draws its button (`AppSelect`, small): its border, fill, hover, corners and padding. A click
   * opens the list and leaves the box as it was, as a click on a select does; only focus reached by keyboard, with the
   * list closed, rings it, outside the border, as the select's keyboard focus does.
   */
  select:
    "rounded-[min(var(--radius-md),10px)] py-0.5 ps-1.5 pe-2 has-data-[slot=combobox-chip]:ps-1.5 has-data-[slot=combobox-chip]:pe-2 dark:hover:bg-input/50 focus-within:border-input focus-within:ring-0 has-[input:focus-visible:not([aria-expanded=true])]:border-ring has-[input:focus-visible:not([aria-expanded=true])]:ring-3"
}

/**
 * The app's chips: the kit's Combobox chips composed once, as a panel field draws them, so a field of tags (class
 * names, a slot's layer) doesn't put the parts together itself. `AppChips` is the box, `AppChip` one chip with its ×,
 * and `AppChipsInput` the typing after them. Given `options`, typing in the input filters them in a popup under the box,
 * grouped, and picking one adds it. The kit's chip parts are banned elsewhere (`vite.config.ts`). Base UI keeps the
 * keys: arrows move between chips and through the popup, Enter picks, Escape closes, and Backspace in the empty input
 * removes the last chip. `look` draws the box as a panel field (class names) or as a select's button (a slot's layer).
 */
export function AppChips({
  value,
  onValueChange,
  inputValue,
  onInputValueChange,
  options,
  empty = "No matches",
  look = "field",
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
  /** A panel field's box, or a select's button for a field that picks one thing from a list (PAR-1046). */
  look?: keyof typeof looks
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
      <ComboboxChips
        {...box}
        ref={setAnchor}
        className={`relative min-h-7 w-full min-w-0 gap-1 text-xs ${looks[look]} ${className}`}
      >
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
