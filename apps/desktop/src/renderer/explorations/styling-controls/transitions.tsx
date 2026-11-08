import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, Eye, EyeOff, GripVertical, Minus, Plus } from "lucide-react"
import { useId, useState } from "react"
import { Field } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { CurveThumb, EasingField, SaveAsToken } from "./easing.tsx"
import {
  defaultDuration,
  easingName,
  easingShape,
  springSettle,
  timeMs,
  type TransitionEntry,
  transitionLabel,
  type TransitionProperty,
  transitionSets
} from "./motion-data.ts"
import { transitionForm } from "./motion-writes.ts"
import { TimeField } from "./time.tsx"
import type { DurationToken } from "./tokens.ts"

/*
 * Motion's Transitions (PAR-652's Transition list): each entry says what changes, then its timing, with the eye and −.
 * An unset duration or easing shows Tailwind's default faintly, and + adds Colors at those defaults. The curve opens
 * the entry's details: what changes, Duration, Easing and Delay. Entries with different timings can't be written as
 * Tailwind's utilities, so the entry that causes it says so and offers Save as token.
 */

let nextId = 0
export const newEntryId = () => `transition-${++nextId}`

export function TransitionsSection({
  entries,
  durationTokens,
  savedAs,
  onSaveToken,
  onChange
}: {
  entries: readonly TransitionEntry[]
  durationTokens: readonly DurationToken[]
  /** The transition token the list was saved as, which it now writes; Detach writes the entries again. */
  savedAs?: string
  onSaveToken: (name: string | undefined) => void
  onChange: (entries: TransitionEntry[]) => void
}) {
  const form = transitionForm(entries)
  const on = entries.filter((entry) => !entry.off)
  const update = (id: string, change: Partial<TransitionEntry>) =>
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)))
  // The first entry whose timing differs from the first one's is the one that makes it one arbitrary value.
  const cause = form === "arbitrary" ? on.find((entry) => timingOf(entry) !== timingOf(on[0]!)) : undefined
  const add = (
    <Hint label="Add a transition">
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-6"
        aria-label="Add a transition"
        onClick={() => onChange([{ id: newEntryId(), property: "colors" }, ...entries])}
      >
        <Plus />
      </Button>
    </Hint>
  )
  return (
    <PanelSection title="Motion" action={add}>
      {entries.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="px-1 pb-1 text-xs text-muted-foreground">Transitions</p>
          {savedAs !== undefined && (
            <div className="flex h-7 items-center gap-1.5 pl-1 text-xs">
              <Hint label={`transition-${savedAs}`} detail="A transition token, which the list's entries make up">
                <span className="flex h-5 items-center rounded bg-accent px-1.5">{savedAs}</span>
              </Hint>
              <span className="truncate text-muted-foreground">{on.length} transitions</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs"
                onClick={() => onSaveToken(undefined)}
              >
                Detach
              </Button>
            </div>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1">
              <EntryRow
                entry={entry}
                durationTokens={durationTokens}
                onChange={(change) => update(entry.id, change)}
                onRemove={() => onChange(entries.filter((other) => other.id !== entry.id))}
              />
              {cause?.id === entry.id && savedAs === undefined && (
                <div className="pb-1 pl-6">
                  <SaveAsToken
                    says="Its timing differs from the others', so the list is written as one arbitrary value."
                    placeholder="card-hover"
                    isTaken={() => false}
                    onSave={(name) => onSaveToken(name.replace(/^transition-/, ""))}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  )
}

const timingOf = (entry: TransitionEntry) =>
  JSON.stringify([entry.duration ?? null, entry.easing ?? null, entry.delay ?? null])

/** One entry: drag handle on hover, the curve that opens its details, what changes, its timing, the eye and −. */
function EntryRow({
  entry,
  durationTokens,
  onChange,
  onRemove
}: {
  entry: TransitionEntry
  durationTokens: readonly DurationToken[]
  onChange: (change: Partial<TransitionEntry>) => void
  onRemove: () => void
}) {
  const name = transitionLabel(entry.property)
  const spring = entry.easing !== undefined && "spring" in entry.easing ? entry.easing.spring : undefined
  const ms = spring ? springSettle(spring) : timeMs(entry.duration, durationTokens)
  const delay = timeMs(entry.delay, durationTokens)
  return (
    <div
      className={`group/entry flex h-7 items-center gap-1 rounded-md pr-0.5 text-xs hover:bg-accent/50 ${entry.off ? "opacity-50" : ""}`}
    >
      <GripVertical
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/entry:opacity-100"
      />
      <Popover>
        <Hint label={`Edit the ${name.toLowerCase()} transition`}>
          <PopoverTrigger
            aria-label={`Edit the ${name.toLowerCase()} transition`}
            className="grid size-6 shrink-0 place-items-center rounded outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
          >
            <CurveThumb shape={easingShape(entry.easing)} faint={entry.easing === undefined} />
          </PopoverTrigger>
        </Hint>
        <PopoverContent className="w-80 gap-1 p-3" align="start">
          <p className="pb-1 text-xs font-medium">{name} transition</p>
          <Field label="Changes">
            <PropertyMenu property={entry.property} onChange={(property) => onChange({ property })} />
          </Field>
          <Field label="Duration">
            <TimeField
              label="Duration"
              which="duration"
              value={entry.duration}
              defaultMs={defaultDuration}
              tokens={durationTokens}
              setBy={
                spring
                  ? {
                      control: "Easing",
                      ms: springSettle(spring),
                      onChange: (duration) =>
                        onChange({ easing: { spring: "duration" in spring ? { ...spring, duration } : spring } })
                    }
                  : undefined
              }
              onChange={(duration) => onChange({ duration })}
            />
          </Field>
          <Field label="Easing">
            <EasingField label="Easing" value={entry.easing} onChange={(easing) => onChange({ easing })} />
          </Field>
          <Field label="Delay">
            <TimeField
              label="Delay"
              which="delay"
              value={entry.delay}
              defaultMs={0}
              tokens={durationTokens}
              onChange={(next) => onChange({ delay: next })}
            />
          </Field>
        </PopoverContent>
      </Popover>
      <span className="min-w-0 shrink truncate">{name}</span>
      {/* Inline text, so the commas sit after each part and the whole summary is cut at its end. */}
      <span className="ml-auto min-w-0 shrink truncate text-muted-foreground tabular-nums">
        <span className={entry.duration === undefined && !spring ? "opacity-60" : ""}>{ms ?? defaultDuration}ms</span>
        {", "}
        <span className={entry.easing === undefined ? "opacity-60" : ""}>{easingName(entry.easing)}</span>
        {delay !== undefined && delay !== 0 && `, after ${delay}ms`}
      </span>
      <Hint
        label={
          entry.off ? `Turn the ${name.toLowerCase()} transition on` : `Turn the ${name.toLowerCase()} transition off`
        }
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6 shrink-0"
          aria-label={
            entry.off ? `Turn the ${name.toLowerCase()} transition on` : `Turn the ${name.toLowerCase()} transition off`
          }
          aria-pressed={!entry.off}
          onClick={() => onChange({ off: !entry.off || undefined })}
        >
          {entry.off ? <EyeOff /> : <Eye />}
        </Button>
      </Hint>
      <Hint label={`Remove the ${name.toLowerCase()} transition`}>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-6 shrink-0"
          aria-label={`Remove the ${name.toLowerCase()} transition`}
          onClick={onRemove}
        >
          <Minus />
        </Button>
      </Hint>
    </div>
  )
}

const sets = ["all", "colors", "opacity", "transform", "shadow"] as const

/** What changes: one of Tailwind's sets, or a property typed in. */
function PropertyMenu({
  property,
  onChange
}: {
  property: TransitionProperty
  onChange: (property: TransitionProperty) => void
}) {
  const [typed, setTyped] = useState(typeof property === "string" ? "" : property.property)
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="sm" className="h-7 w-full justify-between px-2 text-xs font-normal">
              {transitionLabel(property)}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuRadioGroup
            value={typeof property === "string" ? property : "property"}
            onValueChange={(next) => {
              if (next !== "property") onChange(next as (typeof sets)[number])
            }}
          >
            {sets.map((set) => (
              <DropdownMenuRadioItem key={set} value={set} className="text-xs">
                {transitionSets[set].label}
                <span className="ml-auto text-muted-foreground">
                  {transitionSets[set].utility.replace("transition-", "")}
                </span>
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuRadioItem value="property" className="text-xs">
              A property
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <label htmlFor={id} className="sr-only">
        Property
      </label>
      <Input
        id={id}
        value={typed}
        placeholder="Or type a property"
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && typed.trim() !== "") onChange({ property: typed.trim() })
        }}
        onBlur={() => {
          if (typed.trim() !== "") onChange({ property: typed.trim() })
        }}
        className="h-7 text-xs"
      />
    </div>
  )
}

/** The CSS `transition` a preview card takes from the entries, so it moves as the written classes would. */
export function previewTransition(entries: readonly TransitionEntry[], easingCss: (entry: TransitionEntry) => string) {
  return entries
    .filter((entry) => !entry.off)
    .flatMap((entry) => {
      const spring = entry.easing !== undefined && "spring" in entry.easing ? entry.easing.spring : undefined
      const ms = spring ? springSettle(spring) : (timeMs(entry.duration) ?? defaultDuration)
      const properties =
        typeof entry.property === "string" ? transitionSets[entry.property].properties : [entry.property.property]
      return properties
        .filter((property) => !property.startsWith("--"))
        .map((property) => `${property} ${ms}ms ${easingCss(entry)} ${timeMs(entry.delay) ?? 0}ms`)
    })
    .join(", ")
}
