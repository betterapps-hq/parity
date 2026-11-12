import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Toggle,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import {
  type ContainerSpec,
  type FieldRules,
  type Length,
  type NodeStyle,
  offScaleFlag,
  type Size
} from "@parity-app/core"
import {
  type Capabilities,
  type CapabilityDesign,
  fieldEdit,
  layoutTypeEdit,
  type ParentLayout,
  placementEdit,
  type RowKey,
  shownSize,
  sidesField,
  sidesOf,
  sizeEdit,
  sizeField,
  selectionCapabilities,
  type TakesStyle,
  type StyleControl,
  styleParts,
  type StyleRow,
  type StyleSection,
  type StyleValues,
  type TextSizing,
  textSizing,
  textSizingEdit
} from "@parity-app/editor"
import { spacingStepName } from "@parity-app/tokens"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowRight,
  ChevronDown,
  Grid3x3,
  Italic,
  MoveHorizontal,
  MoveVertical,
  Scan,
  Square,
  SquareDashed,
  Strikethrough,
  Underline,
  WrapText
} from "lucide-react"
import { type ComponentType, useState } from "react"
import { kindColors } from "../canvas/kinds.tsx"
import { EffectsSection } from "../inspector/sections/effects.tsx"
import { FillSection } from "../inspector/sections/FillSection.tsx"
import { LayerOrderSection } from "../inspector/sections/LayerOrderSection.tsx"
import { MotionSection } from "../inspector/sections/MotionSection.tsx"
import {
  ChoiceInput,
  Field,
  type FieldFlag,
  type FieldUpdate,
  type FieldValue,
  NumberField,
  type NumberFieldProps,
  NumberInput,
  TokenInput
} from "./fields.tsx"
import { Hint } from "./Hint.tsx"
import { PanelSection } from "./PanelSection.tsx"
import { numberValue } from "./prop-values.ts"
import type { StyleEditor } from "./style-editor.ts"

/** Whether a row's keys are changed or differ across the layers, and how to reset them. */
interface RowState {
  changed: boolean
  mixed: boolean
  onReset: () => void
}

/**
 * What a row shows and does, from the editor: the selection's shared style, whether the row's keys are changed or
 * differ across the layers, and its reset. The row's keys are listed once, in `@parity-app/editor`'s `styleRows`.
 */
function rowOf(editor: StyleEditor, row: StyleRow): RowState {
  return {
    changed: editor.selection.changed(row),
    mixed: editor.selection.differs(row),
    onReset: () => editor.reset(row)
  }
}

/** Whether one property differs across the selected layers; never, with one layer. */
function mixedOf(editor: StyleEditor): (name: keyof NodeStyle) => boolean {
  return (name) => editor.selection.mixed.includes(name)
}

/**
 * A number field's edits of a row: previewed while typed or scrubbed, then made, each worked out from every selected
 * layer's own value (`read`) and written back into its style (`write`).
 */
function fieldEdits<R extends StyleRow>(
  editor: StyleEditor,
  row: R,
  label: string,
  read: (style: NodeStyle) => FieldValue,
  write: (value: FieldValue, style: NodeStyle) => Pick<StyleValues, RowKey<R>>
): Pick<NumberFieldProps, "onPreview" | "onCancel" | "onCommit"> {
  const edit = (update: FieldUpdate) => fieldEdit(read, write, update)

  return {
    onPreview: (update) => editor.preview?.(row, edit(update)),
    onCancel: () => editor.endPreview?.(),
    onCommit: (update, gesture) => editor.set(row, edit(update), label, gesture)
  }
}

/** A number field's value as a style's number: its rules take no token names, so it's a number or unset. */
function numberOf(value: FieldValue): number | undefined {
  return numberValue.safeParse(value).data
}

/** A field's value as a length: steps, or a token's name. */
function asLength(value: FieldValue): Length | undefined {
  return value
}

/** Unset padding, margin, gaps and insets count as 0 when an edit works from them. */
const zero = () => 0

const opacityRules: FieldRules = { kind: "percent", min: 0, max: 100, label: "Opacity" }

interface SectionProps {
  editor: StyleEditor
  parent?: ParentLayout
  /** What the selected layers can do together. */
  can: Capabilities
  /** Whether one of the controls only some layers get shows, as `@parity-app/editor`'s `styleTable` says. */
  shows: (control: StyleControl) => boolean
}

/**
 * Each section the app draws, by the table's name for it. The table's other sections (Grid placement, Raw CSS) aren't
 * built yet, and draw nothing.
 */
const sectionViews: Partial<Record<StyleSection, ComponentType<SectionProps>>> = {
  // Until Frame size is built, a frame's root's Size is the frame's own size (see `useStyleEditor`).
  frameSize: SizeSection,
  placement: PositionSection,
  layerOrder: LayerOrderSection,
  size: SizeSection,
  layout: LayoutSection,
  spacing: SpacingSection,
  appearance: AppearanceSection,
  text: TextSection,
  fill: FillSection,
  stroke: StrokeSection,
  effects: EffectsSection,
  motion: MotionSection
}

/** The layer panel leaves out the design, since it never shows a design's root: no layer's id is empty. */
const noRoot: CapabilityDesign = { root: { id: "" } }

/**
 * Every style section the selected layers get, in the order `@parity-app/editor`'s `styleTable` gives, from what
 * they can do (`selectionCapabilities`). Components get the same controls as layouts: what's set on them lands on
 * their root element, over the component's own styles.
 */
export function StyleSections({
  editor,
  container,
  takesStyle
}: {
  editor: StyleEditor
  /** The design the layers are in, which says whether one is its root or a frame's. */
  container?: ContainerSpec
  /** Whether a code component takes the layer's style; unknown counts as taking it. */
  takesStyle?: TakesStyle
}) {
  const can = selectionCapabilities(container ?? noRoot, editor.selection.layers, takesStyle)
  const { sections, controls } = styleParts(can)

  const props: SectionProps = {
    editor,
    parent: editor.selection.parent,
    can,
    shows: (control) => controls.has(control)
  }

  return (
    <>
      {sections.map((section) => {
        const View = sectionViews[section]

        return View && <View key={section} {...props} />
      })}
    </>
  )
}

function LayoutSection({ editor }: SectionProps) {
  const { set } = editor
  const { style } = editor.selection
  const mixed = mixedOf(editor)
  const grid = style.display === "grid"
  const direction = style.direction ?? "column"
  const distributed = style.justify === "between" || style.justify === "around" || style.justify === "evenly"
  const mode = grid ? "grid" : direction

  return (
    <PanelSection title="Layout">
      <div className="flex flex-col gap-1">
        <Field label="Type" {...rowOf(editor, "layoutType")}>
          <div className="flex items-center gap-1.5">
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              // Mixed directions press no button, rather than the default.
              value={[mixed("display") || mixed("direction") ? "" : mode]}
              onValueChange={([value]) => {
                if (!value) {
                  return
                }

                // SAFETY: the group's items are "row", "column" and "grid", and an empty value returned above.
                const next = value as "row" | "column" | "grid"
                set("layoutType", layoutTypeEdit(next), next === "grid" ? "Use a grid" : "Change direction")
              }}
            >
              <Hint label="Vertical auto layout">
                <ToggleGroupItem value="column" aria-label="Vertical" className="h-7 px-2">
                  <ArrowDown />
                </ToggleGroupItem>
              </Hint>
              <Hint label="Horizontal auto layout">
                <ToggleGroupItem value="row" aria-label="Horizontal" className="h-7 px-2">
                  <ArrowRight />
                </ToggleGroupItem>
              </Hint>
              <Hint label="Grid">
                <ToggleGroupItem value="grid" aria-label="Grid" className="h-7 px-2">
                  <Grid3x3 />
                </ToggleGroupItem>
              </Hint>
            </ToggleGroup>
            {!grid && (
              <Hint label="Wrap onto new lines">
                <Toggle
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  aria-label="Wrap"
                  pressed={style.wrap ?? false}
                  onPressedChange={(wrap) => set("layoutType", { wrap: wrap || undefined }, "Toggle wrap")}
                >
                  <WrapText />
                </Toggle>
              </Hint>
            )}
          </div>
        </Field>
        {grid && (
          <Field label="Tracks" {...rowOf(editor, "tracks")}>
            <div className="grid grid-cols-2 gap-1">
              <CompactNumber
                label="Cols"
                title="Columns"
                value={style.columns}
                placeholder="2"
                // A grid without columns set has two.
                blank={() => 2}
                {...fieldEdits(
                  editor,
                  "tracks",
                  "Change columns",
                  (style) => style.columns,
                  (columns) => ({ columns: numberOf(columns) })
                )}
              />
              <CompactNumber
                label="Rows"
                title="Rows"
                value={style.rows}
                placeholder="Auto"
                {...fieldEdits(
                  editor,
                  "tracks",
                  "Change rows",
                  (style) => style.rows,
                  (rows) => ({ rows: numberOf(rows) })
                )}
              />
            </div>
          </Field>
        )}
        <Field label="Alignment" {...rowOf(editor, "alignment")}>
          <div className="flex items-start gap-2">
            <AlignmentGrid
              style={style}
              direction={grid ? "row" : direction}
              distributed={distributed}
              onChange={(values, label) => set("alignment", values, label)}
            />
            <div className="min-w-0 flex-1">
              <ChoiceInput
                value={distributed ? style.justify : undefined}
                options={distributeOptions}
                placeholder="Packed"
                onChange={(justify) => set("alignment", { justify: justify ?? "start" }, "Change distribution")}
              />
            </div>
          </div>
        </Field>
        <Field label="Gap" {...rowOf(editor, "gap")}>
          {grid || style.wrap ? (
            <div className="grid grid-cols-2 gap-1">
              <LengthInput
                editor={editor}
                label={grid ? "Col" : "X"}
                title="Gap between columns"
                value={style.gap}
                {...fieldEdits(
                  editor,
                  "gap",
                  "Change gap",
                  (style) => style.gap,
                  (gap) => ({ gap: asLength(gap) })
                )}
              />
              <LengthInput
                editor={editor}
                label={grid ? "Row" : "Y"}
                title="Gap between rows"
                value={style.rowGap ?? style.gap}
                {...fieldEdits(
                  editor,
                  "gap",
                  "Change row gap",
                  (style) => style.rowGap ?? style.gap,
                  (rowGap) => ({ rowGap: asLength(rowGap) })
                )}
              />
            </div>
          ) : (
            <LengthInput
              editor={editor}
              title="Gap"
              value={style.gap}
              {...fieldEdits(
                editor,
                "gap",
                "Change gap",
                (style) => style.gap,
                (gap) => ({ gap: asLength(gap) })
              )}
            />
          )}
        </Field>
      </div>
    </PanelSection>
  )
}

/**
 * Figma's alignment box: nine spots for where children sit. Rows and columns swap with the direction, since justify
 * runs along it and align across it. With space distributed, only the cross axis can be picked.
 */
function AlignmentGrid({
  style,
  direction,
  distributed,
  onChange
}: {
  style: NodeStyle
  direction: "row" | "column"
  distributed: boolean
  onChange: (values: StyleValues, label: string) => void
}) {
  const spots = ["start", "center", "end"] as const
  const justify = distributed ? undefined : (style.justify ?? "start")
  const align = style.align === "stretch" ? undefined : (style.align ?? "stretch")

  return (
    <div className="grid size-[60px] shrink-0 grid-cols-3 grid-rows-3 rounded-md border bg-muted/40 p-0.5">
      {spots.flatMap((row) =>
        spots.map((column) => {
          // In a column, rows run along the main axis; in a row, columns do.
          const main = direction === "column" ? row : column
          const cross = direction === "column" ? column : row
          const active = (distributed || justify === main) && align === cross

          return (
            <Hint
              key={`${row}-${column}`}
              label={`${labels[main]} on the main axis, ${labels[cross].toLowerCase()} across`}
              wait
            >
              <button
                type="button"
                aria-label={`Align ${row} ${column}`}
                onClick={() =>
                  onChange(distributed ? { align: cross } : { justify: main, align: cross }, "Change alignment")
                }
                className="group grid place-items-center rounded-sm hover:bg-accent"
              >
                <span
                  className={`block rounded-full ${active ? "size-2" : "size-1 bg-muted-foreground/50 group-hover:bg-muted-foreground"}`}
                  style={active ? { background: kindColors.layer } : undefined}
                />
              </button>
            </Hint>
          )
        })
      )}
    </div>
  )
}

const labels = { start: "Start", center: "Center", end: "End" } as const

/** Padding (inside the node) and margin (outside it), on every side or each on its own. */
function SpacingSection({ editor, shows }: SectionProps) {
  return (
    <PanelSection title="Spacing">
      <div className="flex flex-col gap-1">
        <SidesField editor={editor} name="padding" label="Padding" />
        {shows("margin") && <SidesField editor={editor} name="margin" label="Margin" />}
      </div>
    </PanelSection>
  )
}

function SidesField({ editor, name, label }: { editor: StyleEditor; name: "padding" | "margin"; label: string }) {
  const { style } = editor.selection
  const sides = sidesOf(style[name])
  const [perSide, setPerSide] = useState(Array.isArray(style[name]) && style[name].length === 4)

  /** Edits of some sides, read from the first of them, in each layer's own padding or margin. */
  const sideEdits = (indices: number[]) => {
    const { read, write } = sidesField(name, indices)

    return fieldEdits(editor, name, `Change ${name}`, read, (value, layer) => write(asLength(value), layer))
  }

  return (
    <Field label={label} {...rowOf(editor, name)}>
      <div className="flex items-center gap-1">
        {perSide ? (
          <div className="grid flex-1 grid-cols-2 gap-1">
            {(["Top", "Right", "Bottom", "Left"] as const).map((side, index) => (
              <LengthInput
                key={side}
                editor={editor}
                label={side[0]}
                title={`${side} ${name}`}
                value={sides?.[index]}
                {...sideEdits([index])}
              />
            ))}
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-1">
            <LengthInput
              editor={editor}
              label="V"
              title={`Top and bottom ${name}`}
              value={sides?.[0]}
              {...sideEdits([0, 2])}
            />
            <LengthInput
              editor={editor}
              label="H"
              title={`Left and right ${name}`}
              value={sides?.[1]}
              {...sideEdits([1, 3])}
            />
          </div>
        )}
        <Hint label={`${label} per side`}>
          <Toggle
            size="sm"
            className="size-7 min-w-7 shrink-0 self-start p-0"
            aria-label={`${label} per side`}
            pressed={perSide}
            onPressedChange={setPerSide}
          >
            <SquareDashed />
          </Toggle>
        </Hint>
      </div>
    </Field>
  )
}

function SizeSection({ editor, parent, shows }: SectionProps) {
  const { set } = editor
  const { style } = editor.selection

  const [limits, setLimits] = useState(
    [style.minWidth, style.maxWidth, style.minHeight, style.maxHeight].some((value) => value !== undefined)
  )

  const sizeRow = (axis: "width" | "height", label: string) => {
    const { read, write } = sizeField(axis, parent)

    return (
      <Field label={label} {...rowOf(editor, axis)}>
        <SizeInput
          editor={editor}
          axis={axis}
          value={shownSize(style, axis, parent)}
          canFill={shows("sizeFill")}
          onChange={(value) => set(axis, sizeEdit(axis, value, parent), `Change ${axis}`)}
          // A typed length makes a layer's size fixed; clearing it puts a fixed size back to auto and leaves fill or hug.
          edits={fieldEdits(editor, axis, `Change ${axis}`, read, (value, layer) => write(asLength(value), layer))}
        />
      </Field>
    )
  }

  const lengthEdits = (row: "min" | "max", name: RowKey<"min"> | RowKey<"max">, label: string) =>
    fieldEdits(
      editor,
      row,
      label,
      (layer) => layer[name],
      (value) => ({ [name]: asLength(value) })
    )

  return (
    <PanelSection
      title="Size"
      action={
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => setLimits(!limits)}
        >
          {limits ? "Hide limits" : "Min and max"}
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        {sizeRow("width", "Width")}
        {sizeRow("height", "Height")}
        {limits && (
          <>
            <Field label="Min" {...rowOf(editor, "min")}>
              <div className="grid grid-cols-2 gap-1">
                <LengthInput
                  editor={editor}
                  label="W"
                  title="Minimum width"
                  value={style.minWidth}
                  blank={none}
                  offScale="keep"
                  {...lengthEdits("min", "minWidth", "Change minimum width")}
                />
                <LengthInput
                  editor={editor}
                  label="H"
                  title="Minimum height"
                  value={style.minHeight}
                  blank={none}
                  offScale="keep"
                  {...lengthEdits("min", "minHeight", "Change minimum height")}
                />
              </div>
            </Field>
            <Field label="Max" {...rowOf(editor, "max")}>
              <div className="grid grid-cols-2 gap-1">
                <LengthInput
                  editor={editor}
                  label="W"
                  title="Maximum width"
                  value={style.maxWidth}
                  blank={none}
                  offScale="keep"
                  {...lengthEdits("max", "maxWidth", "Change maximum width")}
                />
                <LengthInput
                  editor={editor}
                  label="H"
                  title="Maximum height"
                  value={style.maxHeight}
                  blank={none}
                  offScale="keep"
                  {...lengthEdits("max", "maxHeight", "Change maximum height")}
                />
              </div>
            </Field>
          </>
        )}
        {shows("alignSelf") && (
          <Field label="Align self" {...rowOf(editor, "self")}>
            <ChoiceInput
              value={style.self}
              options={selfOptions}
              placeholder="Follow layout"
              onChange={(self) => set("self", { self }, "Change self alignment")}
            />
          </Field>
        )}
        {shows("span") && (
          <Field label="Span" {...rowOf(editor, "span")}>
            <div className="grid grid-cols-2 gap-1">
              <CompactNumber
                label="Cols"
                title="Columns spanned"
                value={style.colSpan}
                placeholder="1"
                blank={() => 1}
                {...fieldEdits(
                  editor,
                  "span",
                  "Change span",
                  (layer) => layer.colSpan,
                  (colSpan) => ({ colSpan: numberOf(colSpan) })
                )}
              />
              <CompactNumber
                label="Rows"
                title="Rows spanned"
                value={style.rowSpan}
                placeholder="1"
                blank={() => 1}
                {...fieldEdits(
                  editor,
                  "span",
                  "Change span",
                  (layer) => layer.rowSpan,
                  (rowSpan) => ({ rowSpan: numberOf(rowSpan) })
                )}
              />
            </div>
          </Field>
        )}
      </div>
    </PanelSection>
  )
}

/** Unset limits have no value an edit can work from. */
const none = () => undefined

/**
 * Fixed (a length), fill or hug. Typing a length or picking a token makes it fixed; maths that works from the size
 * there starts from the layer's measured size when it isn't fixed, as Figma's always-numeric sizes do.
 */
function SizeInput({
  editor,
  axis,
  value,
  canFill,
  onChange,
  edits
}: {
  editor: StyleEditor
  axis: "width" | "height"
  value: Size | undefined
  canFill: boolean
  onChange: (value: Size | undefined) => void
  edits: Pick<NumberFieldProps, "onPreview" | "onCancel" | "onCommit">
}) {
  const fixed = value !== undefined && value !== "fill" && value !== "hug"
  const mode = fixed ? "fixed" : (value ?? "auto")
  let placeholder = "Hug"

  if (mode === "auto") {
    placeholder = "Auto"
  } else if (mode === "fill") {
    placeholder = "Fill"
  }

  // The length keeps room for four digits and px beside the mode; a narrower panel puts the mode under it instead.
  return (
    <div className="@container">
      <div className="grid grid-cols-1 items-start gap-1 @min-[11rem]:grid-cols-[1fr_92px]">
        <LengthInput
          editor={editor}
          title={axis === "width" ? "Width" : "Height"}
          value={fixed ? value : undefined}
          placeholder={placeholder}
          blank={() => editor.measure(axis)}
          offScale="keep"
          {...edits}
        />
        <ChoiceInput
          value={mode === "auto" ? undefined : mode}
          options={[
            { value: "fixed", label: "Fixed" },
            ...(canFill ? [{ value: "fill" as const, label: "Fill" }] : []),
            { value: "hug", label: "Hug" }
          ]}
          placeholder="Auto"
          onChange={(next) => {
            if (next === "fixed") {
              onChange(fixed ? value : (editor.measure(axis) ?? 64))
            } else {
              onChange(next)
            }
          }}
        />
      </div>
    </div>
  )
}

function PositionSection({ editor }: SectionProps) {
  const { set } = editor
  const { style } = editor.selection
  const absolute = style.position === "absolute"
  const sides = ["top", "right", "bottom", "left"] as const

  return (
    <PanelSection title="Position">
      <div className="flex flex-col gap-1">
        <Field label="Placement" {...rowOf(editor, "placement")}>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            className="w-full"
            value={[absolute ? "absolute" : "flow"]}
            onValueChange={([value]) =>
              value &&
              set(
                "placement",
                placementEdit(value === "absolute"),
                value === "absolute" ? "Position absolutely" : "Put back in the layout"
              )
            }
          >
            <ToggleGroupItem value="flow" className="h-7 flex-1 text-xs">
              In layout
            </ToggleGroupItem>
            <ToggleGroupItem value="absolute" className="h-7 flex-1 text-xs">
              Absolute
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>
        {absolute && (
          <Field label="Insets" {...rowOf(editor, "insets")}>
            <div className="grid grid-cols-2 gap-1">
              {sides.map((side) => (
                <LengthInput
                  key={side}
                  editor={editor}
                  label={side[0]!.toUpperCase()}
                  title={`Distance from the parent's ${side} edge`}
                  value={style[side]}
                  // An inset can be negative, past the parent's edge.
                  min={-Infinity}
                  offScale="keep"
                  {...fieldEdits(
                    editor,
                    "insets",
                    `Change ${side}`,
                    (layer) => layer[side],
                    (value) => ({ [side]: asLength(value) })
                  )}
                />
              ))}
            </div>
          </Field>
        )}
      </div>
    </PanelSection>
  )
}

function AppearanceSection({ editor }: SectionProps) {
  const { set, tokens } = editor
  const { style } = editor.selection

  return (
    <PanelSection title="Appearance">
      <div className="flex flex-col gap-1">
        <Field label="Radius" {...rowOf(editor, "radius")}>
          <TokenInput
            label="Radius"
            value={style.radius}
            tokens={tokens}
            categories={["radius"]}
            onChange={(radius) => set("radius", { radius }, "Change radius")}
          />
        </Field>
        <Field label="Opacity" {...rowOf(editor, "opacity")}>
          <NumberInput
            value={style.opacity}
            rules={opacityRules}
            title="Opacity"
            placeholder="100"
            suffix="%"
            // Unset is fully opaque.
            blank={() => 100}
            {...fieldEdits(
              editor,
              "opacity",
              "Change opacity",
              (layer) => layer.opacity,
              (opacity) => ({ opacity: numberOf(opacity) })
            )}
          />
        </Field>
        <Field label="Overflow" {...rowOf(editor, "overflow")}>
          <ChoiceInput
            value={style.overflow}
            options={overflowOptions}
            placeholder="Visible"
            onChange={(overflow) => set("overflow", { overflow }, "Change overflow")}
          />
        </Field>
      </div>
    </PanelSection>
  )
}

function StrokeSection({ editor }: SectionProps) {
  const { set, tokens } = editor
  const { style } = editor.selection
  const on = style.border !== undefined || style.borderWidth !== undefined

  return (
    <PanelSection
      title="Stroke"
      action={
        on ? undefined : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => set("stroke", { border: "border", borderWidth: 1 }, "Add stroke")}
          >
            <Square /> Add
          </Button>
        )
      }
    >
      {on ? (
        <div className="flex flex-col gap-1">
          <Field label="Color" {...rowOf(editor, "strokeColor")}>
            <TokenInput
              label="Stroke color"
              value={style.border}
              tokens={tokens}
              categories={["color"]}
              onChange={(border) => set("strokeColor", { border }, "Change stroke color")}
            />
          </Field>
          <Field label="Width" {...rowOf(editor, "strokeWidth")}>
            <ToggleGroup
              variant="outline"
              size="sm"
              spacing={0}
              value={[String(style.borderWidth ?? 1)]}
              onValueChange={([value]) =>
                value && set("strokeWidth", { borderWidth: Number(value) }, "Change stroke width")
              }
            >
              {[1, 2, 4, 8].map((width) => (
                <ToggleGroupItem key={width} value={String(width)} className="h-7 w-9 text-xs tabular-nums">
                  {width}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field label="Style" {...rowOf(editor, "strokeStyle")}>
            <ChoiceInput
              value={style.borderStyle}
              options={borderStyleOptions}
              placeholder="Solid"
              onChange={(borderStyle) => set("strokeStyle", { borderStyle }, "Change stroke style")}
            />
          </Field>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 self-start text-xs text-muted-foreground"
            onClick={() =>
              set("stroke", { border: undefined, borderWidth: undefined, borderStyle: undefined }, "Remove stroke")
            }
          >
            Remove stroke
          </Button>
        </div>
      ) : (
        <p className="px-1 text-xs text-muted-foreground">No stroke.</p>
      )}
    </PanelSection>
  )
}

function TextSection({ editor, can, shows }: SectionProps) {
  const { set, tokens } = editor
  const { style } = editor.selection

  return (
    <PanelSection
      title={can.text ? "Text" : "Text inside"}
      description={can.text ? undefined : "Text in here inherits these unless it sets its own."}
    >
      <div className="flex flex-col gap-1">
        <Field label="Color" {...rowOf(editor, "textColor")}>
          <TokenInput
            label="Text color"
            value={style.foreground}
            tokens={tokens}
            categories={["color"]}
            onChange={(foreground) => set("textColor", { foreground }, "Change text color")}
          />
        </Field>
        <Field label="Font" {...rowOf(editor, "font")}>
          <TokenInput
            label="Font"
            value={style.font}
            tokens={tokens}
            categories={["font"]}
            onChange={(font) => set("font", { font }, "Change font")}
          />
        </Field>
        <Field label="Size" {...rowOf(editor, "textSize")}>
          <TokenInput
            label="Text size"
            value={style.size}
            tokens={tokens}
            categories={["font-size"]}
            onChange={(size) => set("textSize", { size }, "Change text size")}
          />
        </Field>
        <Field label="Weight" {...rowOf(editor, "weight")}>
          <ChoiceInput
            value={style.weight === undefined ? undefined : String(style.weight)}
            options={weightOptions}
            placeholder="Inherit"
            onChange={(weight) =>
              set("weight", { weight: weight === undefined ? undefined : Number(weight) }, "Change weight")
            }
          />
        </Field>
        <Field label="Line height" {...rowOf(editor, "lineHeight")}>
          <TokenInput
            label="Line height"
            value={style.leading}
            tokens={tokens}
            categories={["leading"]}
            onChange={(leading) => set("lineHeight", { leading }, "Change line height")}
          />
        </Field>
        <Field label="Letter spacing" {...rowOf(editor, "letterSpacing")}>
          <TokenInput
            label="Letter spacing"
            value={style.tracking}
            tokens={tokens}
            categories={["tracking"]}
            onChange={(tracking) => set("letterSpacing", { tracking }, "Change letter spacing")}
          />
        </Field>
        <Field label="Align" {...rowOf(editor, "textAlign")}>
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[style.textAlign ?? ""]}
            onValueChange={([value]) =>
              set(
                "textAlign",
                // SAFETY: the group's items come from `textAlignOptions`, each a text alignment; none pressed is "".
                { textAlign: (value || undefined) as NodeStyle["textAlign"] },
                "Change text alignment"
              )
            }
          >
            {textAlignOptions.map(({ value, label, Icon }) => (
              <Hint key={value} label={label}>
                <ToggleGroupItem value={value} aria-label={label} className="h-7 px-2">
                  <Icon />
                </ToggleGroupItem>
              </Hint>
            ))}
          </ToggleGroup>
        </Field>
        {shows("resizing") && <TextResizing editor={editor} />}
        <Field label="Decoration" {...rowOf(editor, "decoration")}>
          <div className="flex gap-1">
            <Hint label="Italic">
              <Toggle
                variant="outline"
                size="sm"
                className="h-7 px-2"
                aria-label="Italic"
                pressed={style.italic ?? false}
                onPressedChange={(italic) => set("decoration", { italic: italic || undefined }, "Toggle italic")}
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
                pressed={style.decoration === "underline"}
                onPressedChange={(on) =>
                  set("decoration", { decoration: on ? "underline" : undefined }, "Toggle underline")
                }
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
                pressed={style.decoration === "line-through"}
                onPressedChange={(on) =>
                  set("decoration", { decoration: on ? "line-through" : undefined }, "Toggle strikethrough")
                }
              >
                <Strikethrough />
              </Toggle>
            </Hint>
          </div>
        </Field>
        <Field label="Case" {...rowOf(editor, "case")}>
          <ChoiceInput
            value={style.textTransform}
            options={transformOptions}
            placeholder="As typed"
            onChange={(textTransform) => set("case", { textTransform }, "Change case")}
          />
        </Field>
        {shows("maxLines") && (
          <Field label="Max lines" {...rowOf(editor, "lines")}>
            <NumberInput
              value={style.lines}
              rules={linesRules}
              title="Max lines"
              placeholder="No limit"
              {...fieldEdits(
                editor,
                "lines",
                "Change max lines",
                (layer) => layer.lines,
                (lines) => ({ lines: numberOf(lines) })
              )}
            />
          </Field>
        )}
      </div>
    </PanelSection>
  )
}

/**
 * Figma's three ways a text layer sizes, which its width and height make up (see `textSizing`): picking one keeps the
 * layer the size it's drawn at, and Width and Height show what it set.
 */
function TextResizing({ editor }: { editor: StyleEditor }) {
  const { set } = editor
  const { style } = editor.selection
  const row = rowOf(editor, "resizing")

  return (
    <Field
      label="Resizing"
      hint="Auto width grows along its line, auto height wraps at its width and grows down, fixed keeps its size"
      {...row}
    >
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[row.mixed ? "" : textSizing(style)]}
        onValueChange={([value]) => {
          const sizing = textSizingOptions.find((option) => option.value === value)

          if (!sizing) {
            return
          }

          // Only the text layers of a mixed selection, each by its own parent.
          set("resizing", textSizingEdit(sizing.value), sizing.edit)
        }}
      >
        {textSizingOptions.map(({ value, label, Icon }) => (
          <Hint key={value} label={label}>
            <ToggleGroupItem value={value} aria-label={label} className="h-7 px-2">
              <Icon />
            </ToggleGroupItem>
          </Hint>
        ))}
      </ToggleGroup>
    </Field>
  )
}

const textSizingOptions = [
  { value: "auto-width", label: "Auto width", edit: "Make text auto width", Icon: MoveHorizontal },
  { value: "auto-height", label: "Auto height", edit: "Make text auto height", Icon: MoveVertical },
  { value: "fixed", label: "Fixed size", edit: "Fix text size", Icon: Scan }
] as const satisfies readonly { value: TextSizing; label: string; edit: string; Icon: unknown }[]

/**
 * A length, typed and shown in pixels (320 is 320px) and kept as steps of the spacing scale, or one of the project's
 * length tokens by name. The list beside it picks a step or a token. A size or an inset keeps a length off the scale as
 * typed (`offScale`); others land on the nearest step. Any length off the scale is flagged under the row, with a button
 * for the nearest step (PAR-194). What it reads is in `@parity-app/core`'s fields.ts.
 */
export function LengthInput({
  editor,
  value,
  label,
  title,
  placeholder = "0",
  min = 0,
  blank = zero,
  offScale,
  onPreview,
  onCancel,
  onCommit
}: {
  editor: Pick<StyleEditor, "tokens" | "unit">
  value: Length | undefined
  /** A letter or two inside the field, for rows of related lengths. Dragging it scrubs. */
  label?: string
  title: string
  placeholder?: string
  /** The least it takes, in steps: 0, or `-Infinity` for an inset. */
  min?: number
  /** What an unset value counts as when an edit works from it. */
  blank?: () => number | undefined
  /** `keep` for sizes and insets, which can leave the spacing scale; others snap to it. */
  offScale?: FieldRules["offScale"]
} & Pick<NumberFieldProps, "onPreview" | "onCancel" | "onCommit">) {
  const { tokens, unit } = editor
  const [open, setOpen] = useState(false)

  const lengthTokens = tokens.filter(
    (token) => (token.category === "spacing" || token.category === "container") && token.name !== "spacing"
  )

  const scale = lengthTokens.filter((token) => token.derived)
  const named = lengthTokens.filter((token) => !token.derived)

  const rules: FieldRules = offScale
    ? { kind: "length", unit, min, label: title, offScale }
    : { kind: "length", unit, min, label: title }

  const pick = (picked: Length) => {
    onCommit(() => picked)
    setOpen(false)
  }

  const off = offScaleFlag(value, rules)
  const steps = numberValue.safeParse(value).data

  const flag: FieldFlag | undefined = off && {
    text: off.text,
    action: {
      label: off.action,
      name: `${off.action} for ${title.charAt(0).toLowerCase()}${title.slice(1)}`,
      run: () => onCommit(() => off.nearest)
    }
  }

  return (
    <NumberField
      value={value}
      rules={rules}
      title={title}
      tokens={named.map((token) => token.name)}
      placeholder={placeholder}
      blank={blank}
      inner={label}
      hint={steps === undefined ? title : `${title}, ${off ? "off the spacing scale" : lengthLabel(steps)}`}
      flag={flag}
      suffix={steps === undefined ? undefined : "px"}
      onPreview={onPreview}
      onCancel={onCancel}
      onCommit={onCommit}
      after={
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={`Pick a token for ${title.toLowerCase()}`}
                className="grid h-full w-5 shrink-0 place-items-center rounded-r-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronDown className="size-3" />
              </button>
            }
          />
          <PopoverContent className="w-60 p-0" align="end">
            <Command>
              <CommandInput placeholder="Search spacing" className="h-8 text-xs" />
              <CommandList className="max-h-72">
                <CommandEmpty>No length matches.</CommandEmpty>
                {named.length > 0 && (
                  <CommandGroup heading="Semantic">
                    {named.map((token) => (
                      <CommandItem
                        key={token.name}
                        value={token.name}
                        onSelect={() => pick(token.name)}
                        className="gap-2 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono">{token.name}</span>
                        <span className="max-w-20 truncate text-muted-foreground">{token.values.default}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                <CommandGroup heading="Spacing scale">
                  {scale.map((token) => (
                    <CommandItem
                      key={token.name}
                      value={token.name}
                      onSelect={() => pick(token.derived!.factor)}
                      className="gap-2 text-xs"
                    >
                      <span
                        className="h-2 shrink-0 rounded-[2px]"
                        style={{
                          width: Math.max(1, Math.min(40, token.derived!.factor * unit)),
                          background: kindColors.layer
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate font-mono">{token.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatPx(token.derived!.factor * unit)}px
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      }
    />
  )
}

/** Whole numbers from 1: columns, rows and spans. */
const countRules: FieldRules = { kind: "count", min: 1 }
const linesRules: FieldRules = { kind: "count", min: 1, label: "Max lines" }

/** A whole number with a short label inside the field, which scrubs it. */
function CompactNumber({
  label,
  title,
  value,
  placeholder,
  blank,
  onPreview,
  onCancel,
  onCommit
}: {
  label: string
  title: string
  value: number | undefined
  placeholder: string
  blank?: () => number | undefined
} & Pick<NumberFieldProps, "onPreview" | "onCancel" | "onCommit">) {
  return (
    <NumberField
      value={value}
      rules={{ ...countRules, label: title }}
      title={title}
      inner={label}
      placeholder={placeholder}
      blank={blank}
      onPreview={onPreview}
      onCancel={onCancel}
      onCommit={onCommit}
    />
  )
}

/** A step's token name, for showing it the way the Tokens panel does. */
export function lengthLabel(value: Length): string {
  const steps = numberValue.safeParse(value)

  return steps.success ? spacingStepName(steps.data) : String(value)
}

function formatPx(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

const distributeOptions = [
  { value: "between" as const, label: "Space between" },
  { value: "around" as const, label: "Space around" },
  { value: "evenly" as const, label: "Space evenly" }
]

const selfOptions = [
  { value: "start" as const, label: "Start" },
  { value: "center" as const, label: "Center" },
  { value: "end" as const, label: "End" },
  { value: "stretch" as const, label: "Stretch" }
]

const overflowOptions = [
  { value: "hidden" as const, label: "Clip content" },
  { value: "scroll" as const, label: "Scroll" }
]

const borderStyleOptions = [
  { value: "dashed" as const, label: "Dashed" },
  { value: "dotted" as const, label: "Dotted" }
]

const transformOptions = [
  { value: "uppercase" as const, label: "Uppercase" },
  { value: "lowercase" as const, label: "Lowercase" },
  { value: "capitalize" as const, label: "Title case" }
]

const weightOptions = [
  [100, "Thin"],
  [200, "Extra light"],
  [300, "Light"],
  [400, "Regular"],
  [500, "Medium"],
  [600, "Semibold"],
  [700, "Bold"],
  [800, "Extra bold"],
  [900, "Black"]
].map(([weight, name]) => ({ value: String(weight), label: `${name} ${weight}` }))

const textAlignOptions = [
  { value: "start", label: "Align left", Icon: AlignLeft },
  { value: "center", label: "Align center", Icon: AlignCenter },
  { value: "end", label: "Align right", Icon: AlignRight },
  { value: "justify", label: "Justify", Icon: AlignJustify }
] as const
