import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { Plus } from "lucide-react"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { CurveThumb, EasingField, SaveAsToken } from "./easing.tsx"
import { type FieldSearch, type Reading, type SearchOption, useTokens, ValueField } from "./field-parts.tsx"
import { Field } from "./field-row.tsx"
import { ListRow, moved } from "./list-parts.tsx"
import {
  defaultDuration,
  drawnEasing,
  easingName,
  easingPlot,
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
 * with different timings can't be written as Tailwind's utilities, so a note under the list says so and offers Save as
 * token.
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

  // Entries of more than one timing make the list one arbitrary value.
  const mixed = form === "arbitrary"

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
        <div className="flex flex-col gap-1">
          <p className="px-1 text-xs text-muted-foreground">Transitions</p>
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
            <EntryRow
              key={entry.id}
              entry={entry}
              onChange={(change) => update(entry.id, change)}
              // One transition has nothing to move past, so it has no handle.
              onMove={
                entries.length > 1
                  ? (from, to) => {
                      if (to >= 0 && to < entries.length) {
                        onChange(moved(entries, from, to))
                      }
                    }
                  : undefined
              }
              onRemove={() => onChange(entries.filter((other) => other.id !== entry.id))}
            />
          ))}
          {/* It's the whole list that's written this way, so it's said under the list, as Effects says it, and stays
              put while an entry's carried. */}
          {mixed && savedAs === undefined && (
            <div className={entries.length > 1 ? "pl-4" : ""}>
              <SaveAsToken
                says="Mixed timings are written as one arbitrary value."
                placeholder="card-hover"
                isTaken={() => false}
                onSave={(name) => onSaveToken(name.replace(/^transition-/, ""))}
              />
            </div>
          )}
        </div>
      )}
    </PanelSection>
  )
}

/** One entry: the list's row, with the curve that opens its details, what changes and its timing. */
function EntryRow({
  entry,
  onChange,
  onMove,
  onRemove
}: {
  entry: TransitionEntry
  onChange: (change: Partial<TransitionEntry>) => void
  onMove?: (from: number, to: number) => void
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
      <p className="pb-1 text-sm font-medium">{label} transition</p>
      <Field label="Changes">
        <PropertyField property={entry.property} onChange={(property) => onChange({ property })} />
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
      off={entry.off}
      onMove={onMove}
      onToggle={() => onChange({ off: !entry.off || undefined })}
      onRemove={onRemove}
      // Hovered or focused, the curve plays at the entry's own duration.
      renderPreview={(live) => (
        <CurveThumb
          plot={easingPlot(entry.easing, easings)}
          faint={entry.easing === undefined}
          playing={live}
          duration={ms ?? defaultDuration}
        />
      )}
      details={{ content: details, className: "w-80 gap-1 p-3" }}
      title={label}
    >
      {/* Inline text, so the commas sit after each part and the whole summary is cut at its end. */}
      <span className="min-w-0 truncate">
        <span className={entry.duration === undefined && !spring ? "opacity-60" : ""}>{ms ?? defaultDuration}ms</span>
        {", "}
        <span className={entry.easing === undefined ? "opacity-60" : ""}>{easingName(entry.easing)}</span>
        {delay !== undefined && delay !== 0 && `, after ${delay}ms`}
      </span>
    </ListRow>
  )
}

const sets = ["all", "colors", "opacity", "transform", "shadow"] as const

/** A CSS property this browser knows, such as `width` or a custom property. */
const isProperty = (name: string) => /^-?-?[a-z][a-z0-9-]*$/i.test(name) && CSS.supports(name, "initial")

/** The set a name typed is, by its key, label or utility: `colors`, `Colors` or `transition-colors`. */
function setNamed(text: string) {
  const words = text.trim().toLowerCase()

  return sets.find((set) =>
    [set, transitionSets[set].label, transitionSets[set].utility].some((name) => name.toLowerCase() === words)
  )
}

/** A set or a property as the list under What changes draws it: its name, then what it writes. */
function changesOption(name: string, writes: string, mono = false) {
  return (
    <>
      <span className={mono ? "font-mono" : ""}>{name}</span>
      <span className="text-muted-foreground">{writes}</span>
    </>
  )
}

/** What typing in What changes finds: the sets whose name or utility has it, then a property of that name. */
const changesSearch: FieldSearch<TransitionProperty> = {
  label: "What changes",
  options: (text) => {
    const name = text.trim()
    const words = name.toLowerCase()

    const matching = sets.filter((set) =>
      [transitionSets[set].label, transitionSets[set].utility].some((each) => each.toLowerCase().includes(words))
    )

    const options: (SearchOption & { value: TransitionProperty })[] = matching.map((set) => ({
      key: set,
      value: set,
      content: changesOption(transitionSets[set].label, transitionSets[set].utility)
    }))

    if (words !== "" && setNamed(words) === undefined && isProperty(name)) {
      options.push({
        key: `property-${words}`,
        value: { property: name },
        group: matching.length > 0 ? "A property" : undefined,
        content: changesOption(name, `transition-[${name}]`, true)
      })
    }

    return options
  },
  empty: (text) => `No set or property named “${text.trim()}”`
}

/**
 * What changes, as one field: focused, it lists Tailwind's sets with their utilities; typing narrows them, or names a
 * property of its own (`width`), offered after any set it matches. Enter takes the highlighted one.
 */
function PropertyField({
  property,
  onChange
}: {
  property: TransitionProperty
  onChange: (property: TransitionProperty) => void
}) {
  const read = (text: string): Reading<TransitionProperty> => {
    const name = text.trim()
    const set = setNamed(name)

    if (name === "") {
      return { value: property }
    }

    if (set) {
      return { value: set }
    }

    return isProperty(name) ? { value: { property: name } } : { reason: "Enter a set or a property, such as width" }
  }

  return (
    <ValueField
      label="Changes"
      shown={transitionLabel(property)}
      placeholder="All"
      hint={{ label: "What changes", detail: "Pick a set, or type a property, such as width" }}
      inputMode="text"
      selectOnFocus
      search={changesSearch}
      read={read}
      onCommit={onChange}
    />
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
