import { ALargeSmall, CaseSensitive, ChevronRight, Lock, MoveHorizontal, MoveVertical } from "lucide-react"
import { type ReactNode, useContext, useEffect, useRef, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "./color-picker.tsx"
import {
  MessageLine,
  type Reading,
  type SearchOption,
  TokenChip,
  TokenMark,
  TokenName,
  StoresContext,
  styleMark,
  Unstored,
  useTokenSets,
  ValueField
} from "./field-parts.tsx"
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
  type TypeTokens,
  typeOf,
  typePresets,
  type TypeValues,
  valueWords,
  viewportsOf
} from "./preset-data.ts"
import { findFont, projectFonts } from "./text-data.ts"
import type { FieldToken, TokenSetName } from "./tokens.ts"

/*
 * Typography, with its preset on the simpler fields (PAR-186, call 6), and the text's color last. The section's first
 * row, Preset, picks a preset, and the rows it sets fold into a summary under it, marked with a lock. Opened, they're
 * locked to the preset's values, each with Unlock at the end of its name's row; an unlocked row changed on the layer
 * overrides the preset there, with the change dot and a reset arrow, stays shown while the summary is closed, and
 * puts a dot on the preset's pill. Detach is the button over the preset field's end, as on every token's pill. A layer
 * with no preset whose type matches one, or nearly does, says so under the row, with Use. Rows the preset doesn't set
 * stay ordinary rows.
 */

/** Each row's half of the section's grid: Font across, then Size beside Weight and Line height beside Letter spacing. */
const halfRows = new Set<TypeField>(["size", "weight", "lineHeight", "letterSpacing"])

export function PresetTextSection({
  layer,
  inheritsFrom,
  onChange,
  color,
  onColor,
  initiallyOpen = false,
  initiallyUnlocked = []
}: {
  layer: PresetLayer
  /** The layer its font is inherited from, as Font's placeholder says. */
  inheritsFrom: string
  onChange: (layer: PresetLayer) => void
  /** The text's color, a color token's name; a text layer's Fill colors what's behind it. */
  color: string | undefined
  onColor: (color: string | undefined) => void
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
      rows.current?.querySelector<HTMLElement>("[aria-label^='Preset']")?.focus()

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
      inheritsFrom={inheritsFrom}
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
    <PanelSection title="Typography">
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
          <Field label="Color">
            <ColorInput label="Text color" value={color} alpha={undefined} alphaPart="alpha" onChange={onColor} />
          </Field>
        </FieldGrid>
      </div>
    </PanelSection>
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
  const sets = useTokenSets()

  // The rows a wider viewport changes, by name, in the order the preset sets them.
  const changes = Object.keys(preset?.wider?.values ?? {}).flatMap((key) => {
    const row = typeFields.find((entry) => entry.field === key)

    return row ? [row.label] : []
  })

  return (
    <>
      <Field
        label="Preset"
        viewports={preset?.wider && `${changes.join(" and ")} change from ${preset.wider.viewport} up`}
      >
        <Unstored part="preset">
          <PresetPicker preset={preset} overrides={overridesOf(layer).length} onPick={onPick} onDetach={onDetach} />
        </Unstored>
      </Field>
      <ClosestPreset match={closestPreset(layer, sets)} onUse={onPick} />
    </>
  )
}

const valueCount = (count: number) => (count === 1 ? "1 value" : `${count} values`)

/** The presets smallest first, as a scale reads, in every list of them, measured with the project's `tokens`. */
const bySize = (tokens: TypeTokens) =>
  typePresets.toSorted((a, b) => measured(presetType(a), tokens).size - measured(presetType(b), tokens).size)

/** A preset as the field's token list draws it: Ag in its family and weight, its size and line height after. */
function presetToken(preset: TypePreset, tokens: TypeTokens): FieldToken {
  const values = measured(presetType(preset), tokens)

  return {
    name: preset.name,
    kind: "type-style",
    value: `${values.weight} ${values.size}px/${values.lineHeight}px ${values.stack}`,
    detail: summary(preset, tokens)
  }
}

/** The presets as tokens, smallest first, for a list of them. */
export const presetTokens = (tokens: TypeTokens) => bySize(tokens).map((preset) => presetToken(preset, tokens))

/**
 * The preset as every token field holds one: a chip that Backspace takes off, the chevron's list of presets with
 * Detach, and typing to search them, each with its Ag and its name in its own type.
 */
export function PresetPicker({
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
  const sets = useTokenSets()

  const options = (text: string): (SearchOption & { value: string | undefined })[] => {
    const searched = text.trim().toLowerCase()

    return bySize(sets).flatMap((each) => {
      if (searched !== "" && !each.name.toLowerCase().includes(searched)) {
        return []
      }

      const token = presetToken(each, sets)

      return [
        {
          key: each.name,
          value: each.name,
          // As the chevron's list draws it: its mark, and its name in its own type over what it comes to.
          content: (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <TokenMark kind={token.kind} value={token.value} name={token.name} {...styleMark} />
                <TokenName token={token} />
              </span>
            </>
          )
        }
      ]
    })
  }

  const read = (text: string): Reading<string | undefined> => {
    const typed = text.trim()

    if (typed === "") {
      return { value: undefined }
    }

    const named = typePresets.find((each) => each.name.toLowerCase() === typed.toLowerCase())

    return named ? { value: named.name } : { reason: `No preset named ${typed}` }
  }

  const overridden = overrides > 0 ? `. ${valueCount(overrides)} overridden here` : ""

  return (
    <ValueField
      label="Preset"
      inner={<CaseSensitive aria-hidden className="size-3.5" />}
      shown={undefined}
      placeholder="None"
      chip={
        preset && {
          name: preset.name,
          token: presetToken(preset, sets),
          overridden: overrides > 0,
          onRemove: () => onPick(undefined),
          onDetach,
          onReplace: onPick
        }
      }
      tokens={{
        list: presetTokens(sets),
        current: preset?.name,
        none: "None",
        name: "Presets",
        onPick
      }}
      search={{ label: "Presets", options, empty: () => "No preset matches", tall: true }}
      hint={{
        label: preset ? `Preset: ${preset.name}` : "Preset: none",
        detail: preset ? `${summary(preset, sets)}${overridden}` : undefined
      }}
      inputMode="text"
      selectOnFocus
      read={read}
      onCommit={onPick}
    />
  )
}

/**
 * Under the preset row of a layer without one: the preset its type matches, or nearly does, with Use, as a value that
 * isn't a token offers the nearest token. What Use changes is in its hint.
 */
function ClosestPreset({ match, onUse }: { match: PresetMatch | undefined; onUse: (name: string) => void }) {
  const stores = useContext(StoresContext)
  const sets = useTokenSets()

  // Where the document can't hold a preset yet, there's none to offer.
  if (!match || !stores("preset")) {
    return null
  }

  const { preset, differs } = match
  const values = presetType(preset)
  const changes = differs.map((field) => `${fieldLabel(field)} becomes ${valueWords(field, values, sets)}`)

  return (
    <MessageLine
      message={{
        tone: "note",
        text: differs.length === 0 ? "Not a preset. One matches." : "Not a preset. One is near.",
        // As a token's Use reads: its name, then what it comes to.
        action: {
          label: (
            <Hint label={`Use ${preset.name}`} detail={changes.join("\n") || undefined}>
              <span>
                Use {preset.name} <span className="font-normal text-muted-foreground">{summary(preset, sets)}</span>
              </span>
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
  const sets = useTokenSets()

  return (
    <button
      type="button"
      data-preset-summary
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} what ${preset.name} sets: ${summary(preset, sets)}, locked`}
      onClick={() => onOpenChange(!open)}
      className="col-span-2 -mt-1.5 flex min-w-0 items-center gap-1 rounded-sm py-0.5 text-left text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRight aria-hidden className={`size-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      <span className="min-w-0 flex-1 truncate">{summary(preset, sets)}</span>
      {/* Lined up with the rows' locks, at the end of their names' rows. */}
      <Lock aria-hidden className="mr-1 size-3 shrink-0" />
    </button>
  )
}

/**
 * A type row. With no preset, or one that doesn't set it, it's an ordinary row. With a preset that sets it, it's locked
 * to the preset until it's unlocked, and changing it overrides the preset there, with the change dot and a reset
 * arrow.
 */
function TypeRow({
  field,
  layer,
  inheritsFrom,
  preset,
  unlocked,
  onUnlock,
  onChange
}: {
  field: TypeField
  layer: PresetLayer
  inheritsFrom: string
  preset: TypePreset | undefined
  unlocked: boolean
  onUnlock: (on: boolean) => void
  /** The layer changed; `reset` when the row went back to its preset. */
  onChange: (layer: PresetLayer, reset?: boolean) => void
}) {
  const label = fieldLabel(field)
  const { source } = shownValue(layer, field)
  const half = halfRows.has(field)
  const sets = useTokenSets()
  const viewports = viewportsOf(preset, field, sets)

  const control = (
    <TypeControl field={field} layer={layer} inheritsFrom={inheritsFrom} onChange={(next) => onChange(next)} />
  )

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
        hint={`${preset.name} gives ${valueWords(field, presetType(preset), sets)}`}
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
    shown = <span className="min-w-0 truncate">{valueWords(field, values, sets)}</span>
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
    const words = valueWords(field, values, sets)
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
  inheritsFrom,
  onChange
}: {
  field: TypeField
  layer: PresetLayer
  inheritsFrom: string
  onChange: (layer: PresetLayer) => void
}) {
  const sets = useTokenSets()
  const type = typeOf(layer)
  const numbers = measured(type, sets)
  const set = <F extends TypeField>(name: F, value: TypeValues[F] | undefined) => onChange(setValue(layer, name, value))

  if (field === "font") {
    return (
      <FontFamilyField
        value={shownValue(layer, "font").value}
        inherited={{ font: projectFonts[0]!, from: inheritsFrom }}
        onChange={(next) => set("font", next)}
        onPreview={noPreview}
      />
    )
  }

  if (field === "size") {
    return (
      <FontSizeField
        value={shownValue(layer, "size").value}
        inherited={measured(inherited, sets).size}
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
