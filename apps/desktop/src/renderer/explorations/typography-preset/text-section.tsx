import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toggle,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Ellipsis,
  Italic,
  Lock,
  LockOpen,
  RotateCcw,
  Strikethrough,
  Underline,
  X
} from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Field, NumberField, TokenInput } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSection } from "../../chrome/PanelSection.tsx"
import {
  caseNames,
  coveredBy,
  differsByViewport,
  fieldLabel,
  fontStack,
  formatValue,
  type LetterSpacing,
  type LineHeight,
  overrideCount,
  type Preset,
  presetAt,
  presetByName,
  type PresetProject,
  resetOverrides,
  resetOwn,
  setOwn,
  type Shown,
  shownAt,
  summary,
  type TextCase,
  type TextLayer,
  type TypeField,
  typeFields,
  type TypeValue,
  valuesByViewport,
  viewports,
  type ViewportId,
  weights,
  applyPreset,
  detach
} from "./presets.ts"

/** How the rows a preset sets are shown while it's applied: the three treatments being compared. */
export type Locking = "hidden" | "folded" | "disabled"

/** A value set on the layer over its preset's: the component color, as an instance's overrides are drawn. */
export const overrideColor = kindColors.component

/** A row set in a wider viewport's patch, in the mode color, as a row set in a state or mode is. */
const modeColor = kindColors.mode

interface TextSectionProps {
  locking: Locking
  project: PresetProject
  layer: TextLayer
  viewport: ViewportId
  onChange: (layer: TextLayer) => void
  /** Folded only: starts with the preset's rows shown. */
  initiallyOpen?: boolean
}

/**
 * The Design panel's Text section for a text layer, with a typography preset row first. While a preset is applied, the
 * rows it covers are hidden, folded into its row, or shown locked, by `locking`; the rest stay as they are.
 */
export function PresetTextSection({
  locking,
  project,
  layer,
  viewport,
  onChange,
  initiallyOpen = false
}: TextSectionProps) {
  const preset = presetByName(project, layer.preset)
  const covered = coveredBy(preset)
  // Rows a person has asked to see while they still follow the preset: brought back from the menu (hidden) or
  // unlocked (disabled). Changing the preset puts them away again.
  const [opened, setOpened] = useState<{ preset?: string; fields: ReadonlySet<TypeField> }>({ fields: new Set() })
  const shownFields = opened.preset === layer.preset ? opened.fields : new Set<TypeField>()
  const [expanded, setExpanded] = useState(initiallyOpen)

  // Opening a row moves focus into it; putting it away or resetting it leaves focus on its lock, or on the preset's
  // menu when the row goes.
  const rows = useRef<HTMLDivElement>(null)
  const refocus = useRef<{ field: TypeField; to: "control" | "action" }>(undefined)
  useEffect(() => {
    const pending = refocus.current
    if (!pending) return
    refocus.current = undefined
    const row = rows.current?.querySelector(`[data-field="${pending.field}"]`)
    const target =
      pending.to === "control"
        ? row?.querySelector<HTMLElement>("input:not(:disabled), [role='combobox']")
        : (row?.querySelector<HTMLElement>("button[aria-label^='Unlock']") ??
          rows.current?.querySelector<HTMLElement>("button[aria-label^='More for']"))
    target?.focus()
  })
  const open = (field: TypeField, on: boolean) => {
    const fields = new Set(shownFields)
    if (on) fields.add(field)
    else fields.delete(field)
    setOpened({ preset: layer.preset, fields })
    refocus.current = { field, to: on ? "control" : "action" }
  }

  const isOverride = (field: TypeField) => shownAt(project, layer, viewport, field).source.kind === "override"
  const rowFor = (field: TypeField) => (
    <TypeRow
      key={field}
      field={field}
      locking={locking}
      project={project}
      layer={layer}
      viewport={viewport}
      preset={covered.has(field) ? preset : undefined}
      opened={shownFields.has(field)}
      onOpen={(on) => open(field, on)}
      onChange={onChange}
    />
  )

  const typeRows = typeFields.map(({ field }) => field)
  const presetRows = typeRows.filter((field) => covered.has(field))
  const visible = (field: TypeField) => {
    if (!preset || !covered.has(field)) return true
    if (locking === "disabled") return true
    if (locking === "hidden") return isOverride(field) || shownFields.has(field)
    return expanded || isOverride(field)
  }
  // Folded rows sit under the preset's summary; elsewhere every row keeps its place.
  const inPlace = typeRows.filter((field) => (locking === "folded" && preset ? !covered.has(field) : true))
  const beforeColor = inPlace.filter((field) => field !== "case")

  return (
    <PanelSection title="Text">
      <div ref={rows} className="flex flex-col gap-1">
        {project.presets.length > 0 && (
          <PresetRow
            locking={locking}
            project={project}
            layer={layer}
            viewport={viewport}
            hiddenFields={presetRows.filter((field) => !visible(field))}
            onPick={(name) => onChange(applyPreset(project, layer, name))}
            onReveal={(field) => open(field, true)}
            onResetOverrides={() => onChange(resetOverrides(project, layer))}
            onDetach={() => onChange(detach(project, layer))}
          />
        )}
        {locking === "folded" && preset && (
          <>
            <Disclosure
              project={project}
              preset={preset}
              viewport={viewport}
              open={expanded}
              onOpenChange={setExpanded}
            />
            {presetRows.filter(visible).map(rowFor)}
          </>
        )}
        {beforeColor.filter(visible).map(rowFor)}
        <Field label="Color">
          <TokenInput
            value={layer.color}
            tokens={project.colors}
            categories={["color"]}
            onChange={(color) => onChange({ ...layer, color })}
          />
        </Field>
        <Field label="Align">
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[layer.align ?? ""]}
            onValueChange={([value]) => onChange({ ...layer, align: (value || undefined) as TextLayer["align"] })}
          >
            {alignOptions.map(({ value, label, Icon }) => (
              <Hint key={value} label={label}>
                <ToggleGroupItem value={value} aria-label={label} className="h-7 px-2">
                  <Icon />
                </ToggleGroupItem>
              </Hint>
            ))}
          </ToggleGroup>
        </Field>
        <Field label="Decoration">
          <div className="flex gap-1">
            <Hint label="Italic">
              <Toggle
                variant="outline"
                size="sm"
                className="h-7 px-2"
                aria-label="Italic"
                pressed={layer.italic ?? false}
                onPressedChange={(italic) => onChange({ ...layer, italic: italic || undefined })}
              >
                <Italic />
              </Toggle>
            </Hint>
            <Hint label="Underline">
              <Toggle
                variant="outline"
                size="sm"
                className="h-7 px-2"
                aria-label="Underline"
                pressed={layer.decoration === "underline"}
                onPressedChange={(on) => onChange({ ...layer, decoration: on ? "underline" : undefined })}
              >
                <Underline />
              </Toggle>
            </Hint>
            <Hint label="Strikethrough">
              <Toggle
                variant="outline"
                size="sm"
                className="h-7 px-2"
                aria-label="Strikethrough"
                pressed={layer.decoration === "line-through"}
                onPressedChange={(on) => onChange({ ...layer, decoration: on ? "line-through" : undefined })}
              >
                <Strikethrough />
              </Toggle>
            </Hint>
          </div>
        </Field>
        {inPlace.includes("case") && visible("case") && rowFor("case")}
      </div>
    </PanelSection>
  )
}

const alignOptions = [
  { value: "start", label: "Align left", Icon: AlignLeft },
  { value: "center", label: "Align center", Icon: AlignCenter },
  { value: "end", label: "Align right", Icon: AlignRight },
  { value: "justify", label: "Justify", Icon: AlignJustify }
] as const

/**
 * One of the section's rows, laid out as the panel's `Field` is: a dot after the label when its value differs in
 * another viewport, the label in the mode color when a wider viewport's patch sets it, and a slot after the control for
 * the row's lock or reset.
 */
function Row({
  field,
  label,
  hint,
  dot,
  tone,
  action,
  children
}: {
  field?: TypeField
  label: string
  hint?: string
  dot?: boolean
  tone?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div data-field={field} className="grid min-h-8 grid-cols-[88px_1fr] items-center gap-2">
      <div className="flex min-w-0 items-center gap-1">
        <Hint label={label} detail={hint} wait>
          <span className="truncate text-xs text-muted-foreground" style={tone ? { color: tone } : undefined}>
            {label}
          </span>
        </Hint>
        {dot && <span aria-hidden className="size-1 shrink-0 rounded-full bg-muted-foreground" />}
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 flex-1">{children}</div>
        {action}
      </div>
    </div>
  )
}

/** A small button in a row's end slot: a lock, a reset arrow, or putting a row away. */
function RowAction({
  label,
  onClick,
  tone,
  children
}: {
  label: string
  onClick: () => void
  tone?: string
  children: ReactNode
}) {
  return (
    <Hint label={label}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        className="size-7 shrink-0 text-muted-foreground"
        style={tone ? { color: tone } : undefined}
        onClick={onClick}
      >
        {children}
      </Button>
    </Hint>
  )
}

/** The preset row: its picker, and a menu with Detach, the reset for its overrides, and, where rows hide, Override. */
function PresetRow({
  locking,
  project,
  layer,
  viewport,
  hiddenFields,
  onPick,
  onReveal,
  onResetOverrides,
  onDetach
}: {
  locking: Locking
  project: PresetProject
  layer: TextLayer
  viewport: ViewportId
  hiddenFields: TypeField[]
  onPick: (name: string | undefined) => void
  onReveal: (field: TypeField) => void
  onResetOverrides: () => void
  onDetach: () => void
}) {
  const preset = presetByName(project, layer.preset)
  const overrides = overrideCount(project, layer)
  const changesByViewport = preset ? [...coveredBy(preset)].filter((field) => presetVaries(preset, field)) : []
  const hint = [
    "Typography preset",
    preset && `${preset.name}: ${summary(project, presetAt(preset, viewport))}`,
    changesByViewport.length > 0 &&
      `Its ${changesByViewport.map((field) => fieldLabel(field).toLowerCase()).join(" and ")} changes with the viewport`
  ]
    .filter(Boolean)
    .join("\n")
  return (
    <Row
      label="Preset"
      hint={hint}
      dot={changesByViewport.length > 0}
      action={
        preset && (
          <PresetMenu
            preset={preset}
            hiddenFields={locking === "hidden" ? hiddenFields : []}
            overrides={overrides}
            onReveal={onReveal}
            onResetOverrides={onResetOverrides}
            onDetach={onDetach}
          />
        )
      }
    >
      <PresetPicker project={project} value={layer.preset} overrides={overrides} onPick={onPick} />
    </Row>
  )
}

const presetVaries = (preset: Preset, field: TypeField) =>
  (preset.from ?? []).some((step) => step.values[field] !== undefined)

function PresetMenu({
  preset,
  hiddenFields,
  overrides,
  onReveal,
  onResetOverrides,
  onDetach
}: {
  preset: Preset
  hiddenFields: TypeField[]
  overrides: number
  onReveal: (field: TypeField) => void
  onResetOverrides: () => void
  onDetach: () => void
}) {
  const revealing = useRef(false)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Hint label={`More for ${preset.name}`}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`More for ${preset.name}`}
              className="size-7 shrink-0 text-muted-foreground"
            >
              <Ellipsis />
            </Button>
          </Hint>
        }
      />
      {/* A row brought back to override takes focus, so the menu doesn't hand it back to its button. */}
      <DropdownMenuContent
        align="end"
        className="w-52"
        finalFocus={() => {
          const back = !revealing.current
          revealing.current = false
          return back
        }}
      >
        {hiddenFields.length > 0 && (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>Override</DropdownMenuLabel>
              {hiddenFields.map((field) => (
                <DropdownMenuItem
                  key={field}
                  onClick={() => {
                    revealing.current = true
                    onReveal(field)
                  }}
                >
                  {fieldLabel(field)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem disabled={overrides === 0} onClick={onResetOverrides}>
          {overrides === 0 ? "No overrides to reset" : `Reset ${overrideCountText(overrides)}`}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDetach}>Detach preset</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const valueCount = (count: number) => (count === 1 ? "1 value" : `${count} values`)
const overrideCountText = (count: number) => (count === 1 ? "1 override" : `${count} overrides`)

/** The largest a preset's name is drawn in the picker, so a display size still fits a row. */
const largestPreview = 28

/**
 * Picks one of the project's presets, each drawn in its own font, size and weight, under where it comes from. The
 * trigger is the preset's chip, with a dot while the layer overrides part of it.
 */
function PresetPicker({
  project,
  value,
  overrides,
  onPick
}: {
  project: PresetProject
  value: string | undefined
  overrides: number
  onPick: (name: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const current = presetByName(project, value)
  const groups = Map.groupBy(project.presets, (preset) => preset.source)
  const pick = (name: string | undefined) => {
    onPick(name)
    setOpen(false)
  }
  const label = current
    ? `Typography preset: ${current.name}${overrides > 0 ? `, ${valueCount(overrides)} overridden` : ""}`
    : "Typography preset: none"
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={label}
            className="h-7 w-full justify-between gap-1.5 px-2 text-xs font-normal"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {current ? (
                <>
                  <Sample project={project} preset={current} size={11} />
                  <span className="truncate font-mono">{current.name}</span>
                  {overrides > 0 && (
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: overrideColor }}
                    />
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </span>
            <ChevronsUpDown className="size-3 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start">
        {/* Opens on the preset the layer has, scrolled to it. */}
        <Command defaultValue={current?.name ?? "__none"}>
          <CommandInput placeholder="Search presets" className="h-8 text-xs" />
          <CommandList
            className="max-h-96"
            ref={(list) => list?.querySelector("[data-selected=true]")?.scrollIntoView({ block: "center" })}
          >
            <CommandEmpty>No preset matches.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none" onSelect={() => pick(undefined)} className="text-xs text-muted-foreground">
                None
                {!current && <Check className="ml-auto size-3.5" />}
              </CommandItem>
            </CommandGroup>
            {[...groups].map(([source, presets]) => (
              <CommandGroup key={source} heading={`From ${source}`}>
                {presets.map((preset) => (
                  <CommandItem
                    key={preset.name}
                    value={preset.name}
                    onSelect={() => pick(preset.name)}
                    className="items-start gap-2"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-foreground" style={previewStyle(project, preset)}>
                        {preset.name}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {summary(project, preset.values)}
                        {preset.from && ", changes with the viewport"}
                      </span>
                    </span>
                    {preset.name === value && <Check className="mt-1 size-3.5 shrink-0" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function previewStyle(project: PresetProject, preset: Preset) {
  const { font, weight, size, letterSpacing, case: textCase } = preset.values
  return {
    fontFamily: fontStack(project, font ?? project.inherited.font),
    fontWeight: weight ?? project.inherited.weight,
    fontSize: Math.min(size ?? project.inherited.size, largestPreview),
    lineHeight: 1.25,
    letterSpacing: letterSpacing && ("px" in letterSpacing ? `${letterSpacing.px}px` : `${letterSpacing.em}em`),
    textTransform: textCase === "none" ? undefined : textCase
  }
}

/** "Ag" in the preset's font and weight: the type kind's small preview on its chip. */
function Sample({ project, preset, size }: { project: PresetProject; preset: Preset; size: number }) {
  return (
    <span
      aria-hidden
      className="shrink-0 text-muted-foreground"
      style={{
        fontFamily: fontStack(project, preset.values.font ?? project.inherited.font),
        fontWeight: preset.values.weight ?? project.inherited.weight,
        fontSize: size
      }}
    >
      Ag
    </span>
  )
}

/** The folded preset's summary under its row, which opens and closes the rows it sets. */
function Disclosure({
  project,
  preset,
  viewport,
  open,
  onOpenChange
}: {
  project: PresetProject
  preset: Preset
  viewport: ViewportId
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <div className="-mt-1 grid grid-cols-[88px_1fr] gap-2">
      <span />
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} what ${preset.name} sets`}
        onClick={() => onOpenChange(!open)}
        className="flex min-w-0 items-center gap-1 rounded-sm py-0.5 text-left text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <ChevronRight className={`size-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="truncate">{summary(project, presetAt(preset, viewport))}</span>
      </button>
    </div>
  )
}

/**
 * A type row. With no preset, or one that doesn't set it, it's an ordinary row. With a preset that sets it, it follows
 * `locking`: shown locked until it's unlocked, or shown to edit; changing it overrides the preset there, in the
 * override color with a reset arrow.
 */
function TypeRow({
  field,
  locking,
  project,
  layer,
  viewport,
  preset,
  opened,
  onOpen,
  onChange
}: {
  field: TypeField
  locking: Locking
  project: PresetProject
  layer: TextLayer
  viewport: ViewportId
  preset: Preset | undefined
  opened: boolean
  onOpen: (on: boolean) => void
  onChange: (layer: TextLayer) => void
}) {
  const label = fieldLabel(field)
  const shown = shownAt(project, layer, viewport, field)
  const { source } = shown
  const set = (value: TypeValue | undefined) => onChange(setOwn(layer, viewport, field, value))
  const differs = differsByViewport(project, layer, field)
  const fromPatch = (source.kind === "override" || source.kind === "own") && source.from !== "mobile"
  const viewportName = fromPatch ? viewports.find((entry) => entry.id === source.from)!.name : undefined
  const hint = [
    preset && source.kind === "preset" && `From ${preset.name}`,
    source.kind === "override" &&
      `Overrides ${formatValue(field, presetAt(preset!, viewport)[field])} from ${preset?.name}`,
    source.kind === "inherited" && "Inherited",
    viewportName && `Set for ${viewportName} and wider`,
    differs && valuesByViewport(project, layer, field)
  ]
    .filter(Boolean)
    .join("\n")
  const row = (control: ReactNode, action?: ReactNode) => (
    <Row field={field} label={label} hint={hint} dot={differs} tone={fromPatch ? modeColor : undefined} action={action}>
      {control}
    </Row>
  )

  if (!preset) return row(<TypeControl field={field} project={project} shown={shown} onSet={set} label={label} />)

  if (source.kind === "override") {
    const reset = () => {
      onChange(resetOwn(layer, viewport, field))
      onOpen(false)
    }
    return row(
      <TypeControl field={field} project={project} shown={shown} onSet={set} label={label} tone={overrideColor} />,
      <RowAction label={`Reset ${label} to ${preset.name}`} onClick={reset} tone={overrideColor}>
        <RotateCcw className="size-3.5" />
      </RowAction>
    )
  }

  if (locking === "disabled" && !opened) {
    return row(
      <LockedControl field={field} shown={shown} label={label} preset={preset} />,
      <RowAction label={`Unlock ${label} to override it`} onClick={() => onOpen(true)}>
        <Lock className="size-3.5" />
      </RowAction>
    )
  }

  const control = <TypeControl field={field} project={project} shown={shown} onSet={set} label={label} />
  if (locking === "disabled") {
    return row(
      control,
      <RowAction label={`Lock ${label} to ${preset.name}`} onClick={() => onOpen(false)}>
        <LockOpen className="size-3.5" />
      </RowAction>
    )
  }
  if (locking === "hidden") {
    return row(
      control,
      <RowAction label={`Hide ${label}`} onClick={() => onOpen(false)}>
        <X className="size-3.5" />
      </RowAction>
    )
  }
  return row(control)
}

/** A value the preset sets, shown but not editable. */
function LockedControl({
  field,
  shown,
  label,
  preset
}: {
  field: TypeField
  shown: Shown
  label: string
  preset: Preset
}) {
  const { text, suffix } = display(field, shown.value)
  return (
    <div className="relative">
      <Input
        disabled
        value={text}
        aria-label={`${label}, set by ${preset.name}`}
        className="h-7 px-2 pr-7 text-xs md:text-xs"
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-muted-foreground opacity-50">
          {suffix}
        </span>
      )}
    </div>
  )
}

/** A menu row's choices: the project's fonts, the nine weights, or the cases. */
function menuOptions(field: "font" | "weight" | "case", project: PresetProject) {
  if (field === "font") return project.fonts.map((font) => ({ value: font.name, label: font.name }))
  if (field === "weight")
    return weights.map(({ weight, name }) => ({ value: String(weight), label: `${name} ${weight}` }))
  return (Object.entries(caseNames) as [TextCase, string][]).map(([key, name]) => ({ value: key, label: name }))
}

/** What a number row shows: px as px, a line height multiple bare, letter spacing in em as a percentage. */
function display(field: TypeField, value: TypeValue | undefined): { text: string; suffix?: string } {
  if (field === "size") return { text: formatValue(field, value), suffix: "px" }
  if (field === "lineHeight" && value) {
    return { text: formatValue(field, value), suffix: "px" in (value as LineHeight) ? "px" : undefined }
  }
  if (field === "letterSpacing" && value) {
    const spacing = value as LetterSpacing
    return "px" in spacing
      ? { text: String(spacing.px), suffix: "px" }
      : { text: String(round(spacing.em * 100)), suffix: "%" }
  }
  return { text: value === undefined ? "" : formatValue(field, value) }
}

const round = (value: number) => Math.round(value * 100) / 100

/** Edits one type value: a menu for font, weight and case, a number field for the rest. */
function TypeControl({
  field,
  project,
  shown,
  label,
  tone,
  onSet
}: {
  field: TypeField
  project: PresetProject
  shown: Shown
  label: string
  /** The value's color, for an override. */
  tone?: string
  onSet: (value: TypeValue | undefined) => void
}) {
  const inherited = shown.source.kind === "inherited"
  const value = inherited ? undefined : shown.value
  // An override's value is drawn in the override color, inside the input or the menu's trigger.
  const toned = tone ? "[&_input]:text-(--canvas-component) [&_[data-slot=select-value]]:text-(--canvas-component)" : ""

  if (field === "font" || field === "weight" || field === "case") {
    const options = menuOptions(field, project)
    const current = value === undefined ? undefined : String(value as number | string)
    const placeholder = formatValue(field, shown.value)
    return (
      <div className={toned}>
        <Select
          items={options}
          value={current ?? null}
          onValueChange={(next) => {
            if (next === null || next === current) return
            onSet(field === "weight" ? Number(next) : (next as TypeValue))
          }}
        >
          <SelectTrigger size="sm" aria-label={label} className="h-7 w-full text-xs">
            <SelectValue placeholder={<span className="text-muted-foreground">{placeholder}</span>} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} className="text-xs">
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  const { text, suffix } = display(field, shown.value)
  const number = value === undefined ? undefined : Number(display(field, value).text)
  const toValue = (next: number): TypeValue => {
    if (field === "size") return next
    if (field === "lineHeight") {
      const current = (shown.value ?? { multiple: next }) as LineHeight
      return "px" in current ? { px: next } : { multiple: next }
    }
    const current = (shown.value ?? { em: 0 }) as LetterSpacing
    return "px" in current ? { px: next } : { em: next / 100 }
  }
  return (
    <NumberField
      value={number}
      rules={{ kind: "number", min: field === "letterSpacing" ? undefined : 0, label }}
      title={label}
      placeholder={inherited ? text : undefined}
      suffix={suffix}
      blank={() => Number(text)}
      className={toned}
      onCommit={(update) => {
        const next = update(number ?? Number(text))
        if (typeof next !== "number") {
          if (next === undefined) onSet(undefined)
          return
        }
        if (next === number) return
        onSet(toValue(next))
      }}
    />
  )
}
