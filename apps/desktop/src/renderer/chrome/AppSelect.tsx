import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@buildkitgg/shadcn-baseui-kit"
import { type ComponentProps, type ReactNode } from "react"
import { ChangeMark, useChanged } from "../inspector/controls/field-parts.tsx"
import { useFieldName, useMixed } from "./fields.tsx"

/** One choice: what it's worth, how it reads, and a line under it saying more. */
export interface AppSelectItem<T> {
  value: T
  label: ReactNode
  detail?: ReactNode
}

/** The value of the item that leaves a select unset, which its `onValueChange` reports as `null`. */
const unset = "__unset"

type RootProps<T> = ComponentProps<typeof Select<T | typeof unset>>

type ContentProps = ComponentProps<typeof SelectContent>

export type AppSelectProps<T> = Omit<RootProps<T>, "children" | "items" | "multiple" | "value" | "onValueChange"> & {
  items: readonly AppSelectItem<T>[]
  value?: T | null
  onValueChange?: (value: T | null, details: Parameters<NonNullable<RootProps<T>["onValueChange"]>>[1]) => void
  /**
   * Where it sits: `panel` reads at a panel field's 12px and opens at that size, with the chosen item where the value
   * was (docs/typography.md: Select in a panel); `dialog` is the kit's 13px.
   */
  variant: "panel" | "dialog"
  /** An item above the rest that leaves the value unset, read this way. Picking it reports `null`. */
  none?: string
  /** What the trigger reads while nothing is chosen. In a field whose layers differ, Mixed. */
  placeholder?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  id?: string
  className?: string
  size?: ComponentProps<typeof SelectTrigger>["size"]
} & Pick<ContentProps, "align" | "alignItemWithTrigger"> & {
    /** Classes for the popup, such as a width of its own. */
    popupClassName?: string
  }

/**
 * The app's select: the kit's Select composed as shadcn intends, with its items in a `SelectGroup`, which gives the
 * popup its 4px inset. Every select in the app is one of these; the kit's Select parts are banned elsewhere
 * (`vite.config.ts`). Inside a `Field` with no name of its own, the row's label names it. Base UI keeps its keyboard
 * use, focus and accessible names, and its own props pass through.
 */
export function AppSelect<T>({
  items,
  value,
  onValueChange,
  variant,
  none,
  placeholder,
  "aria-label": label,
  "aria-labelledby": labelledBy,
  id,
  className,
  size = variant === "panel" ? "sm" : "default",
  align,
  alignItemWithTrigger,
  popupClassName,
  ...props
}: AppSelectProps<T>) {
  const mixed = useMixed()
  const changed = useChanged()
  const named = useFieldName(label)
  const panel = variant === "panel"

  const choices: AppSelectItem<T | typeof unset>[] =
    none === undefined
      ? [...items]
      : [{ value: unset, label: <span className="text-muted-foreground">{none}</span> }, ...items]

  const shown = none !== undefined && (value === null || value === undefined) && !mixed ? unset : value

  return (
    <Select<T | typeof unset>
      {...props}
      items={choices.map((choice) => ({ value: choice.value, label: choice.label }))}
      value={shown}
      onValueChange={(next, details) => onValueChange?.(next === unset ? null : next, details)}
    >
      <SelectTrigger
        size={size}
        id={id}
        {...(labelledBy ? { "aria-labelledby": labelledBy } : named)}
        className={`relative ${panel ? "text-xs" : ""} ${className ?? ""}`}
      >
        <SelectValue placeholder={mixed ? "Mixed" : placeholder} />
        {/* Changed in the state being edited, or set over a preset: the mark on its corner (PAR-1020). */}
        {changed && <ChangeMark />}
      </SelectTrigger>
      <SelectContent align={align} alignItemWithTrigger={alignItemWithTrigger} className={popupClassName}>
        <SelectGroup>
          {choices.map((choice) => (
            <SelectItem key={String(choice.value)} value={choice.value} className={panel ? "text-xs" : undefined}>
              {choice.detail === undefined ? (
                choice.label
              ) : (
                <span className="flex flex-col gap-0.5">
                  <span>{choice.label}</span>
                  <span className="text-muted-foreground">{choice.detail}</span>
                </span>
              )}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
