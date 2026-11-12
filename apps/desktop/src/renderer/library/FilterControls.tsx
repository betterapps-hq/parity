import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import type { Filter, FilterValue } from "@parity-app/connectors"
import { Monitor, RectangleHorizontal, RectangleVertical, SlidersHorizontal, Smartphone, Square } from "lucide-react"

/** A filter with no value chosen, in a select. */
const any = "any"

/**
 * What a filter's value shows beside its name, wherever it appears: the icon its connector names, or the color it
 * gives. The window has the pictures; the connector says which goes with what.
 */
export function ValueMark({ value }: { value: FilterValue | undefined }) {
  if (value?.swatch) {
    return <span aria-hidden className="size-3 shrink-0 rounded-full border" style={{ background: value.swatch }} />
  }

  switch (value?.icon) {
    case "desktop":
      return <Monitor />
    case "phone":
      return <Smartphone />
    case "landscape":
      return <RectangleHorizontal />
    case "portrait":
      return <RectangleVertical />
    case "square":
      return <Square />
    default:
      return null
  }
}

interface FilterControlProps {
  filter: Filter
  value: string | undefined
  /** For a filter whose name is written beside it, as behind Filters. */
  named?: boolean
  onChange: (value: string | undefined) => void
}

/**
 * One of a connector's filters as a control, chosen from what the filter says about itself. A filter with one value is
 * on or off, as Pixabay's editor's choice is. One that always has a value, between a few, is a switch between them, as
 * Mobbin's platform is. Any other is a select, starting on any when it can be left open.
 */
export function FilterControl({ filter, value, named, onChange }: FilterControlProps) {
  const [only] = filter.values

  if (filter.values.length === 1 && named) {
    return (
      <Switch
        aria-label={filter.name}
        checked={value !== undefined}
        onCheckedChange={(on) => onChange(on ? only.id : undefined)}
      />
    )
  }

  if (filter.values.length === 1) {
    return (
      <Button
        variant={value === undefined ? "outline" : "secondary"}
        aria-pressed={value !== undefined}
        className="h-9"
        onClick={() => onChange(value === undefined ? only.id : undefined)}
      >
        {only.name}
      </Button>
    )
  }

  if (filter.default && filter.values.length <= 3) {
    return (
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[value ?? filter.default]}
        onValueChange={([next]) => next && onChange(next)}
        aria-label={filter.name}
      >
        {filter.values.map((each) => (
          <ToggleGroupItem key={each.id} value={each.id} className="gap-1.5 px-2.5">
            <ValueMark value={each} /> {each.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )
  }

  const nameOf = (id: string) =>
    filter.values.find((each) => each.id === id)?.name ?? `Any ${filter.name.toLowerCase()}`

  return (
    <Select<string>
      value={value ?? filter.default ?? any}
      onValueChange={(next) => onChange(!next || next === any ? undefined : next)}
    >
      <SelectTrigger aria-label={filter.name} className="h-9 w-36">
        <SelectValue>
          {(id: string) => (
            <span className="flex items-center gap-2">
              <ValueMark value={filter.values.find((each) => each.id === id)} /> {nameOf(id)}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {!filter.default && <SelectItem value={any}>{nameOf(any)}</SelectItem>}
          {filter.values.map((each) => (
            <SelectItem key={each.id} value={each.id}>
              <ValueMark value={each} /> {each.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

interface MoreFiltersProps {
  filters: readonly Filter[]
  chosen: Readonly<Record<string, string>>
  /** How many of them are set away from their default. */
  set: number
  onChoose: (filter: Filter, value: string | undefined) => void
}

/**
 * The filters past the first few, behind one button that counts how many are set, each on a row with its name. A
 * connector lists its filters most used first, so these are the ones reached for least.
 */
export function MoreFilters({ filters, chosen, set, onChoose }: MoreFiltersProps) {
  if (filters.length === 0) {
    return null
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" className="h-9 gap-1.5" />}>
        <SlidersHorizontal /> Filters
        {set > 0 && (
          <Badge variant="secondary" className="px-1.5 tabular-nums">
            {set}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-80 flex-col gap-3">
        {filters.map((filter) => (
          <div key={filter.id} className="flex min-h-9 items-center justify-between gap-3">
            <span className="text-sm">{filter.name}</span>
            <FilterControl
              filter={filter}
              value={chosen[filter.id]}
              named
              onChange={(value) => onChoose(filter, value)}
            />
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
