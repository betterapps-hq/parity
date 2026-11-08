import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, Plus } from "lucide-react"
import { useId, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { CurveThumb, EasingField, SaveAsToken } from "./easing.tsx"
import { useTokens } from "./field-parts.tsx"
import { Field } from "./field-row.tsx"
import { ListRow, moved } from "./list-parts.tsx"
import {
  defaultDuration,
  drawnEasing,
  easingName,
  easingShape,
  springSettle,
  timeMs,
  type TransitionEntry,
  transitionLabel,
  type TransitionProperty,
  transitionProperties,
  transitionSets
} from "./motion-data.ts"
import { transitionForm } from "./motion-writes.ts"
import { TimeField } from "./time.tsx"
import type { TokenSets } from "./tokens.ts"

/*
 * Motion's Transitions (PAR-652's Transition list): each entry is a list row, as every list's are: the handle, the
 * curve that opens the entry's details (what changes, Duration, Easing and Delay), what changes, its timing, the eye
 * and −. An unset duration or easing shows Tailwind's default faintly, and + adds Colors at those defaults. Entries
 * with different timings can't be written as Tailwind's utilities, so the entry that causes it says so and offers Save
 * as token.
 */

let nextId = 0
export const newEntryId = () => `transition-${++nextId}`

export function TransitionsSection({
  entries,
  savedAs,
  onSaveToken,
  onChange
}: {
  entries: readonly TransitionEntry[]
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
          {entries.map((entry, index) => (
            <div key={entry.id} className="flex flex-col gap-1">
              <EntryRow
                entry={entry}
                index={index}
                onChange={(change) => update(entry.id, change)}
                onMove={(from, to) => {
                  if (to >= 0 && to < entries.length) onChange(moved(entries, from, to))
                }}
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

/** One entry: the list's row, with the curve that opens its details, what changes and its timing. */
function EntryRow({
  entry,
  index,
  onChange,
  onMove,
  onRemove
}: {
  entry: TransitionEntry
  index: number
  onChange: (change: Partial<TransitionEntry>) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}) {
  const { tokens: durations } = useTokens("duration")
  const { tokens: easings } = useTokens("easing")
  const label = transitionLabel(entry.property)
  const name = `${label.toLowerCase()} transition`
  const spring = entry.easing !== undefined && "spring" in entry.easing ? entry.easing.spring : undefined
  const ms = spring ? springSettle(spring) : timeMs(entry.duration, durations)
  const delay = timeMs(entry.delay, durations)
  const details = (
    <>
      <p className="pb-1 text-xs font-medium">{label} transition</p>
      <Field label="Changes">
        <PropertyMenu property={entry.property} onChange={(property) => onChange({ property })} />
      </Field>
      <Field label="Duration">
        <TimeField
          label="Duration"
          which="duration"
          value={entry.duration}
          defaultMs={defaultDuration}
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
          onChange={(next) => onChange({ delay: next })}
        />
      </Field>
    </>
  )
  return (
    <ListRow
      name={name}
      group="transitions"
      index={index}
      off={entry.off}
      onMove={onMove}
      onToggle={() => onChange({ off: !entry.off || undefined })}
      onRemove={onRemove}
      preview={<CurveThumb shape={easingShape(entry.easing, easings)} faint={entry.easing === undefined} />}
      details={{ content: details, className: "w-80 gap-1 p-3" }}
      // What changes keeps its name; the summary after it is cut first.
      type={<span className="max-w-1/2 shrink-0 truncate">{label}</span>}
    >
      {/* Inline text, so the commas sit after each part and the whole summary is cut at its end. */}
      <span className="ml-auto min-w-0 shrink truncate text-muted-foreground tabular-nums">
        <span className={entry.duration === undefined && !spring ? "opacity-60" : ""}>{ms ?? defaultDuration}ms</span>
        {", "}
        <span className={entry.easing === undefined ? "opacity-60" : ""}>{easingName(entry.easing)}</span>
        {delay !== undefined && delay !== 0 && `, after ${delay}ms`}
      </span>
    </ListRow>
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
              const set = sets.find((option) => option === next)
              if (set) onChange(set)
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

/**
 * The CSS `transition` a preview card takes from the entries, so it moves as the written classes would, with the
 * project's tokens resolved and each easing drawn from its own curve.
 */
export function previewTransition(entries: readonly TransitionEntry[], sets: TokenSets): string {
  return entries
    .filter((entry) => !entry.off)
    .flatMap((entry) => {
      const spring = entry.easing !== undefined && "spring" in entry.easing ? entry.easing.spring : undefined
      const ms = spring ? springSettle(spring) : (timeMs(entry.duration, sets.duration) ?? defaultDuration)
      const easing = drawnEasing(entry.easing, sets.easing)
      return transitionProperties(entry.property)
        .filter((property) => !property.startsWith("--"))
        .map((property) => `${property} ${ms}ms ${easing} ${timeMs(entry.delay, sets.duration) ?? 0}ms`)
    })
    .join(", ")
}
