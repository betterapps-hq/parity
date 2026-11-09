import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import {
  ALargeSmall,
  CaseSensitive,
  Check,
  ChevronDown,
  ChevronRight,
  Lock,
  MoveHorizontal,
  MoveVertical,
  Unlink
} from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { formatNumber } from "./css-values.ts"
import { fieldBox, fieldEndButton, MessageLine, TokenChip, useTokenSets } from "./field-parts.tsx"
import { Field, FieldGrid } from "./field-row.tsx"
import { FontFamilyField, FontSizeField, LetterSpacingField, LineHeightField, WeightField } from "./font-fields.tsx"
import {
  applyPreset,
  closestPreset,
  coveredBy,
  detachPreset,
  fieldLabel,
  inherited,
  measured,
  overridesOf,
  type PresetLayer,
  type PresetMatch,
  presetNamed,
  presetType,
  resetValue,
  setValue,
  shownValue,
  summary,
  type TypeField,
  typeFields,
  type TypePreset,
  typeOf,
  typePresets,
  type TypeValues,
  valueWords,
  viewportsOf
} from "./preset-data.ts"
import { findFont, projectFonts } from "./text-data.ts"
import type { FieldToken, TokenSetName } from "./tokens.ts"

/*
 * Text's typography preset on the simpler fields (PAR-186, call 6): the section's first row picks a preset, and the
 * rows it sets fold into a summary under it, marked with a lock. Opened, they're locked to the preset's values, each
 * with Unlock at the end of its name's row; an unlocked row changed on the layer overrides the preset there, in the
 * override color with a reset arrow, stays shown while the summary is closed, and puts a dot on the preset's pill.
 * Detach is the button over the preset field's end, as on every token's pill. A layer with no preset whose type
 * matches one, or nearly does, says so under the row, with Use. Rows the preset doesn't set stay ordinary rows.
 */

/** Where the stand-in layer inherits its font from, as Font's placeholder says. */
const parentName = "Pricing"

/** Each row's half of the section's grid: Font across, then Size beside Weight and Line height beside Letter spacing. */
const halfRows = new Set<TypeField>(["size", "weight", "lineHeight", "letterSpacing"])

export function PresetTextSection({
  layer,
  onChange,
  initiallyOpen = false,
  initiallyUnlocked = []
}: {
  layer: PresetLayer
  onChange: (layer: PresetLayer) => void
  /** Starts with the summary open, its rows shown. */
  initiallyOpen?: boolean
  /** Rows that start unlocked. */
  initiallyUnlocked?: TypeField[]
}) {
  const preset = presetNamed(layer.preset)
  const covered = coveredBy(preset)
  const overridden = new Set(overridesOf(layer))
  const [open, setOpen] = useState(initiallyOpen)
  // Rows unlocked while they still follow the preset. Picking a preset, or detaching, locks them all again.
  const [unlocked, setUnlocked] = useState<ReadonlySet<TypeField>>(() => new Set(initiallyUnlocked))

  // Unlocking a row moves focus into its field; locking or resetting it leaves focus on its lock, or on the summary when
  // the row folds away. Picking, Use and Detach change what the preset row holds, so focus goes to it.
  const rows = useRef<HTMLDivElement>(null)
  const refocus = useRef<{ field: TypeField; to: "field" | "lock" } | "preset">(undefined)
  useEffect(() => {
    const pending = refocus.current

    if (!pending) {
      return
    }

    refocus.current = undefined

    if (pending === "preset") {
      rows.current?.querySelector<HTMLElement>("[aria-label^='Typography preset']")?.focus()

      return
    }

    const row = rows.current?.querySelector(`[data-field="${pending.field}"]`)

    const target =
      pending.to === "field"
        ? row?.querySelector<HTMLElement>("input:not(:disabled)")
        : (row?.querySelector<HTMLElement>("[data-lock]") ??
          rows.current?.querySelector<HTMLElement>("[data-preset-summary]"))

    target?.focus()
  })

  const unlock = (field: TypeField, on: boolean) => {
    const next = new Set(unlocked)

    if (on) {
      next.add(field)
    } else {
      next.delete(field)
    }

    setUnlocked(next)
    refocus.current = { field, to: on ? "field" : "lock" }
  }

  // Folded, a row the preset sets shows while the summary is open, and stays while it's overridden or unlocked, so a
  // difference from the preset never folds away.
  const shows = (field: TypeField) => open || overridden.has(field) || unlocked.has(field)
  const presetRows = covered.filter(shows)
  const ordinaryRows = typeFields.map(({ field }) => field).filter((field) => !covered.includes(field))

  const row = (field: TypeField) => (
    <TypeRow
      key={field}
      field={field}
      layer={layer}
      preset={covered.includes(field) ? preset : undefined}
      unlocked={unlocked.has(field)}
      onUnlock={(on) => unlock(field, on)}
      onChange={(next, reset) => {
        onChange(next)

        if (reset) {
          unlock(field, false)
        }
      }}
    />
  )

  return (
    <div ref={rows}>
      <FieldGrid>
        <PresetRow
          layer={layer}
          onPick={(name) => {
            setUnlocked(new Set())
            refocus.current = "preset"
            onChange(applyPreset(layer, name))
          }}
          onDetach={() => {
            setUnlocked(new Set())
            refocus.current = "preset"
            onChange(detachPreset(layer))
          }}
        />
        {preset && <Summary preset={preset} open={open} onOpenChange={setOpen} />}
        {presetRows.map(row)}
        {ordinaryRows.map(row)}
      </FieldGrid>
    </div>
  )
}

/**
 * The preset row: the preset as a pill, with a dot while the layer overrides part of it, which opens the project's
 * presets; Detach over the field's end on hover or focus, as a token's pill has; and, for a layer with none, what its
 * type matches. A preset that changes with the viewport has a dot after the row's name.
 */
function PresetRow({
  layer,
  onPick,
  onDetach
}: {
  layer: PresetLayer
  onPick: (name: string | undefined) => void
  onDetach: () => void
}) {
  const preset = presetNamed(layer.preset)

  // The rows a wider viewport changes, by name, in the order the preset sets them.
  const changes = Object.keys(preset?.wider?.values ?? {}).flatMap((key) => {
    const row = typeFields.find((entry) => entry.field === key)

    return row ? [row.label] : []
  })

  return (
    <>
      <Field
        label="Typography preset"
        viewports={preset?.wider && `${changes.join(" and ")} change from ${preset.wider.viewport} up`}
      >
        <PresetPicker preset={preset} overrides={overridesOf(layer).length} onPick={onPick} onDetach={onDetach} />
      </Field>
      <ClosestPreset match={closestPreset(layer)} onUse={onPick} />
    </>
  )
}

const valueCount = (count: number) => (count === 1 ? "1 value" : `${count} values`)

/** The largest a preset's name is drawn in the list, so a display size still fits a row. */
const largestPreview = 28

function PresetPicker({
  preset,
  overrides,
  onPick,
  onDetach
}: {
  preset: TypePreset | undefined
  overrides: number
  onPick: (name: string | undefined) => void
  onDetach: () => void
}) {
  const [open, setOpen] = useState(false)
  const groups = Map.groupBy(typePresets, (each) => each.source)

  const pick = (name: string | undefined) => {
    onPick(name)
    setOpen(false)
  }

  const detail = preset && `${summary(preset)}${overrides > 0 ? `. ${valueCount(overrides)} overridden here` : ""}`
  // Room at the end for Detach only while it shows, as every field keeps it.
  const room = preset ? "transition-[padding] duration-100 hover:pr-7 focus-within:pr-7" : "pr-7"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={fieldBox(false, `flex-1 ${room}`)}>
        <span className="flex shrink-0 text-muted-foreground">
          <CaseSensitive aria-hidden className="size-3.5" />
        </span>
        {/* One trigger, holding the pill or None, so what the list's anchored to stays as a pick sets a preset or clears it. */}
        <Hint label={preset?.name ?? "None"} detail={detail} hidden={!preset} wait>
          <PopoverTrigger
            aria-label={preset ? `Typography preset: ${preset.name}` : "Typography preset: none"}
            className={`flex h-full min-w-0 items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring ${preset ? "" : "flex-1 text-left text-muted-foreground"}`}
          >
            {preset ? (
              <TokenChip
                name={preset.name}
                token={{ name: preset.name, kind: "font-size", value: summary(preset), detail: detail ?? "" }}
                overridden={overrides > 0}
                label="Typography preset"
                preview={null}
                hint={false}
              />
            ) : (
              "None"
            )}
          </PopoverTrigger>
        </Hint>
        {preset ? (
          <Hint label={`Detach ${preset.name}`} detail="Keeps every value it gives here">
            <button type="button" aria-label={`Detach ${preset.name}`} onClick={onDetach} className={fieldEndButton}>
              <Unlink className="size-3" />
            </button>
          </Hint>
        ) : (
          <ChevronDown aria-hidden className="absolute top-1/2 right-2 size-3 -translate-y-1/2 text-muted-foreground" />
        )}
      </div>
      <PopoverContent className="w-72 p-0" align="start">
        <Command defaultValue={preset?.name ?? "__none"}>
          <CommandInput placeholder="Search presets" className="h-8 text-xs" />
          <CommandList className="max-h-96">
            <CommandEmpty>No preset matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none" onSelect={() => pick(undefined)} className="text-xs text-muted-foreground">
                None
                {!preset && <Check className="ml-auto size-3.5" />}
              </CommandItem>
            </CommandGroup>
            {[...groups].map(([source, presets]) => (
              <CommandGroup key={source} heading={`From ${source}`}>
                {presets.map((each) => {
                  const values = measured(presetType(each))

                  return (
                    <CommandItem key={each.name} value={each.name} onSelect={() => pick(each.name)} className="gap-2">
                      <span
                        className="min-w-0 flex-1 truncate text-foreground"
                        style={{
                          fontFamily: values.stack,
                          fontWeight: values.weight,
                          fontSize: Math.min(values.size, largestPreview),
                          lineHeight: 1.25,
                          letterSpacing: `${values.letterSpacing}em`
                        }}
                      >
                        {each.name}
                      </span>
                      <span className="shrink-0 text-2xs text-muted-foreground tabular-nums">
                        {formatNumber(values.size)}/{formatNumber(values.lineHeight)}
                      </span>
                      <Check className={`size-3.5 shrink-0 ${each.name === preset?.name ? "" : "invisible"}`} />
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Under the preset row of a layer without one: the preset its type matches, or nearly does, with Use, as a value that
 * isn't a token offers the nearest token. What Use changes is in its hint.
 */
function ClosestPreset({ match, onUse }: { match: PresetMatch | undefined; onUse: (name: string) => void }) {
  if (!match) {
    return null
  }

  const { preset, differs } = match
  const values = presetType(preset)
  const changes = differs.map((field) => `${fieldLabel(field)} becomes ${valueWords(field, values)}`)

  return (
    <MessageLine
      message={{
        tone: "note",
        text: differs.length === 0 ? `Matches ${preset.name}` : `Near ${preset.name}`,
        action: {
          label: (
            <Hint label={`Use ${preset.name}`} detail={changes.join("\n") || undefined}>
              <span>Use</span>
            </Hint>
          ),
          run: () => onUse(preset.name)
        }
      }}
    />
  )
}

/**
 * The folded preset's summary under its row ("Geist 20/28 Semibold"), which opens and closes the rows it sets, with a
 * lock at its end saying they're locked.
 */
function Summary({
  preset,
  open,
  onOpenChange
}: {
  preset: TypePreset
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <button
      type="button"
      data-preset-summary
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} what ${preset.name} sets: ${summary(preset)}, locked`}
      onClick={() => onOpenChange(!open)}
      className="col-span-2 -mt-1.5 flex min-w-0 items-center gap-1 rounded-sm py-0.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRight aria-hidden className={`size-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      <span className="min-w-0 flex-1 truncate">{summary(preset)}</span>
      {/* Lined up with the rows' locks, at the end of their names' rows. */}
      <Lock aria-hidden className="mr-1 size-3 shrink-0" />
    </button>
  )
}

/**
 * A type row. With no preset, or one that doesn't set it, it's an ordinary row. With a preset that sets it, it's locked
 * to the preset until it's unlocked, and changing it overrides the preset there, in the override color with a reset
 * arrow.
 */
function TypeRow({
  field,
  layer,
  preset,
  unlocked,
  onUnlock,
  onChange
}: {
  field: TypeField
  layer: PresetLayer
  preset: TypePreset | undefined
  unlocked: boolean
  onUnlock: (on: boolean) => void
  /** The layer changed; `reset` when the row went back to its preset. */
  onChange: (layer: PresetLayer, reset?: boolean) => void
}) {
  const label = fieldLabel(field)
  const { source } = shownValue(layer, field)
  const half = halfRows.has(field)
  const viewports = viewportsOf(preset, field)
  const control = <TypeControl field={field} layer={layer} onChange={(next) => onChange(next)} />
  let body: ReactNode

  if (!preset) {
    body = (
      <Field label={label} half={half}>
        {control}
      </Field>
    )
  } else if (source === "override") {
    body = (
      <Field
        label={label}
        half={half}
        overrides={preset.name}
        viewports={viewports}
        hint={`${preset.name} gives ${valueWords(field, presetType(preset))}`}
        onReset={() => onChange(resetValue(layer, field), true)}
      >
        {control}
      </Field>
    )
  } else {
    body = (
      <Field
        label={label}
        half={half}
        viewports={viewports}
        lock={{ preset: preset.name, open: unlocked, onOpenChange: onUnlock }}
      >
        {unlocked ? control : <LockedValue field={field} preset={preset} />}
      </Field>
    )
  }

  return (
    <div data-field={field} className="contents">
      {body}
    </div>
  )
}

/** The token set each row's tokens are in. */
const tokenSetOf = {
  font: "font",
  size: "size",
  weight: "weight",
  lineHeight: "leading",
  letterSpacing: "tracking"
} as const satisfies Record<TypeField, TokenSetName>

/** Each row's icon in its field, which a locked row keeps so it reads as the same field. */
const rowIcons: Partial<Record<TypeField, ReactNode>> = {
  size: <ALargeSmall aria-hidden className="size-3.5" />,
  lineHeight: <MoveVertical aria-hidden className="size-3.5" />,
  letterSpacing: <MoveHorizontal aria-hidden className="size-3.5" />
}

/**
 * A value the preset sets, shown as its field shows it, faded as a disabled field is, with nothing to type in or open:
 * Font's pill with its sample, Weight's name, another token's pill named alone, or a number with its unit at the end.
 * The row's Unlock button is the way in.
 */
function LockedValue({ field, preset }: { field: TypeField; preset: TypePreset }) {
  const sets = useTokenSets()
  const value = preset.values[field]
  const values = presetType(preset)
  let shown: ReactNode
  let unit: string | undefined

  if (field === "weight") {
    shown = <span className="min-w-0 truncate">{valueWords(field, values)}</span>
  } else if (value !== undefined && "token" in value) {
    const list: readonly FieldToken[] = sets[tokenSetOf[field]]
    const token = list.find((each) => each.name === value.token)
    // Font's field shows its pill with a sample of the font; the others' pills are the name alone.
    shown = (
      <TokenChip
        name={value.token}
        token={token}
        label={fieldLabel(field)}
        preview={field === "font" ? undefined : null}
        hint={false}
      />
    )
  } else {
    const words = valueWords(field, values)
    unit = /(px|%)$/.exec(words)?.[1]
    shown = <span className="min-w-0 flex-1 truncate tabular-nums">{unit ? words.slice(0, -unit.length) : words}</span>
  }

  return (
    <div className="flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-muted px-2 text-xs opacity-50 dark:bg-input/40">
      {rowIcons[field] && <span className="flex shrink-0 text-muted-foreground">{rowIcons[field]}</span>}
      {shown}
      {unit && <span className="ml-auto shrink-0 text-muted-foreground">{unit}</span>}
      <span className="sr-only">, locked to {preset.name}</span>
    </div>
  )
}

/** The story's preview draws what's set, not a font or weight highlighted in a list, so those previews go nowhere. */
const noPreview = () => undefined

/** Edits one type value with PAR-186's own field for it. */
function TypeControl({
  field,
  layer,
  onChange
}: {
  field: TypeField
  layer: PresetLayer
  onChange: (layer: PresetLayer) => void
}) {
  const type = typeOf(layer)
  const numbers = measured(type)
  const set = <F extends TypeField>(name: F, value: TypeValues[F] | undefined) => onChange(setValue(layer, name, value))
  const sets = useTokenSets()

  if (field === "font") {
    return (
      <FontFamilyField
        value={shownValue(layer, "font").value}
        inherited={{ font: projectFonts[0]!, from: parentName }}
        onChange={(next) => set("font", next)}
        onPreview={noPreview}
      />
    )
  }

  if (field === "size") {
    return (
      <FontSizeField
        value={shownValue(layer, "size").value}
        inherited={measured(inherited).size}
        onChange={(next) => set("size", next)}
      />
    )
  }

  if (field === "weight") {
    return (
      <WeightField
        font={findFont(numbers.font) ?? projectFonts[0]!}
        value={shownValue(layer, "weight").value}
        italic={layer.italic}
        onChange={(next) => set("weight", next)}
        onItalic={(italic) => onChange({ ...layer, italic })}
        onPreview={noPreview}
      />
    )
  }

  if (field === "lineHeight") {
    const fontSize = type.size
    const size = "token" in fontSize ? sets.size.find((each) => each.name === fontSize.token) : undefined

    return (
      <LineHeightField
        value={shownValue(layer, "lineHeight").value}
        size={size}
        fontSize={numbers.size}
        onChange={(next) => set("lineHeight", next)}
      />
    )
  }

  return (
    <LetterSpacingField
      value={shownValue(layer, "letterSpacing").value}
      fontSize={numbers.size}
      onChange={(next) => set("letterSpacing", next)}
    />
  )
}
