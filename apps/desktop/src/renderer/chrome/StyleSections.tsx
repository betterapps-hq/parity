import {
  type DesignNode,
  type FieldRules,
  type Length,
  type NodeStyle,
  type Padding,
  type Size
} from "@parity-app/core"
import { type TextSizing, textSizing, withTextSizing } from "@parity-app/editor"
import { spacingStepName, type Token } from "@parity-app/tokens"
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
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { kindColors } from "../canvas/kinds.tsx"
import {
  ChoiceInput,
  Field,
  type FieldUpdate,
  type FieldValue,
  NumberField,
  type NumberFieldProps,
  NumberInput,
  TokenInput
} from "./fields.tsx"
import { Hint } from "./Hint.tsx"
import { PanelSection } from "./PanelSection.tsx"

/** Style properties to set; `undefined` clears one. */
export type StyleValues = Partial<{ [K in keyof NodeStyle]: NodeStyle[K] | undefined }>

/** Properties to set, or how to work them out from each selected layer's own style, as `Mixed+8` does. */
export type StyleEdit = StyleValues | ((style: NodeStyle) => StyleValues)

/** An edit's values for one layer, from its style as shown in the state being edited. */
export function styleValues(edit: StyleEdit, style: NodeStyle): StyleValues {
  return typeof edit === "function" ? edit(style) : edit
}

/** Reads and writes one node's style in the state being edited. */
export interface StyleEditor {
  style: NodeStyle
  changed: (name: keyof NodeStyle) => boolean
  reset: (name: keyof NodeStyle) => void
  /** Several properties as one undoable change. `undefined` clears a property. */
  set: (values: StyleEdit, label?: string) => void
  /**
   * Shows properties on the canvas at once, without changing the design, while a field is typed in or scrubbed:
   * `set` then makes them, or `endPreview` takes them back.
   */
  preview?(values: StyleEdit): void
  endPreview?(): void
  tokens: Token[]
  /** Pixels per spacing step. */
  unit: number
  /**
   * The node's rendered length, in whole spacing steps, so switching to a fixed size keeps it where it is: the nearest
   * step, or the one above with `Math.ceil`, so text fixed at it doesn't wrap again.
   */
  measure(axis: "width" | "height", round?: (steps: number) => number): number | undefined
  /** With several layers selected: whether they have different values for a property. */
  mixed?(name: keyof NodeStyle): boolean
}

/** Whether a property differs across the selected layers; never, with one layer. */
function mixedOf(editor: StyleEditor): (name: keyof NodeStyle) => boolean {
  return (name) => editor.mixed?.(name) ?? false
}

/**
 * A number field's edits of a style: previewed while typed or scrubbed, then made, each worked out from every selected
 * layer's own value (`read`) and written back into its style (`write`).
 */
function fieldEdits(
  editor: StyleEditor,
  label: string,
  read: (style: NodeStyle) => FieldValue,
  write: (value: FieldValue, style: NodeStyle) => StyleValues
): Pick<NumberFieldProps, "onPreview" | "onCancel" | "onCommit"> {
  const edit =
    (update: FieldUpdate): StyleEdit =>
    (style) =>
      write(update(read(style)), style)
  return {
    onPreview: (update) => editor.preview?.(edit(update)),
    onCancel: () => editor.endPreview?.(),
    onCommit: (update) => editor.set(edit(update), label)
  }
}

/** A field's value as a length: steps, or a token's name. */
function asLength(value: FieldValue): Length | undefined {
  return value
}

/** Unset padding, margin, gaps and insets count as 0 when an edit works from them. */
const zero = () => 0

const opacityRules: FieldRules = { kind: "percent", min: 0, max: 100, label: "Opacity" }

/** The layout a node sits in, when it sits in one. */
export interface ParentLayout {
  direction: "row" | "column"
  grid: boolean
}

interface SectionProps {
  editor: StyleEditor
  node: DesignNode
  parent?: ParentLayout
}

/**
 * Every style section that applies to a node, in Figma's order. Components get the same control as layouts: what's
 * set on them lands on their root element, over the component's own styles.
 */
export function StyleSections(props: SectionProps) {
  const { node } = props
  return (
    <>
      {node.type === "layout" && <LayoutSection {...props} />}
      <SpacingSection {...props} />
      <SizeSection {...props} />
      <PositionSection {...props} />
      <AppearanceSection {...props} />
      <StrokeSection {...props} />
      <TextSection {...props} />
    </>
  )
}

function LayoutSection({ editor }: SectionProps) {
  const { style, changed, reset, set } = editor
  const mixed = mixedOf(editor)
  const grid = style.display === "grid"
  const direction = style.direction ?? "column"
  const distributed = style.justify === "between" || style.justify === "around" || style.justify === "evenly"
  const mode = grid ? "grid" : direction
  return (
    <PanelSection title="Layout">
      <div className="flex flex-col gap-1">
        <Field
          label="Type"
          changed={changed("display") || changed("direction") || changed("wrap")}
          mixed={mixed("display") || mixed("direction") || mixed("wrap")}
          onReset={() => (reset("display"), reset("direction"), reset("wrap"))}
        >
          <div className="flex items-center gap-1.5">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              // Mixed directions press no button, rather than the default.
              value={mixed("display") || mixed("direction") ? "" : mode}
              onValueChange={(value) => {
                if (!value) return
                if (value === "grid") set({ display: "grid", columns: style.columns ?? 2 }, "Use a grid")
                else set({ display: undefined, direction: value as "row" | "column" }, "Change direction")
              }}
            >
              <Hint label="Vertical auto layout">
                <ToggleGroupItem value="column" aria-label="Vertical" className="h-7 px-2 aria-checked:bg-muted">
                  <ArrowDown />
                </ToggleGroupItem>
              </Hint>
              <Hint label="Horizontal auto layout">
                <ToggleGroupItem value="row" aria-label="Horizontal" className="h-7 px-2 aria-checked:bg-muted">
                  <ArrowRight />
                </ToggleGroupItem>
              </Hint>
              <Hint label="Grid">
                <ToggleGroupItem value="grid" aria-label="Grid" className="h-7 px-2 aria-checked:bg-muted">
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
                  onPressedChange={(wrap) => set({ wrap: wrap || undefined }, "Toggle wrap")}
                >
                  <WrapText />
                </Toggle>
              </Hint>
            )}
          </div>
        </Field>
        {grid && (
          <Field
            label="Tracks"
            changed={changed("columns") || changed("rows")}
            mixed={mixed("columns") || mixed("rows")}
            onReset={() => (reset("columns"), reset("rows"))}
          >
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
                  "Change columns",
                  (style) => style.columns,
                  (columns) => ({ columns: columns as number | undefined })
                )}
              />
              <CompactNumber
                label="Rows"
                title="Rows"
                value={style.rows}
                placeholder="Auto"
                {...fieldEdits(
                  editor,
                  "Change rows",
                  (style) => style.rows,
                  (rows) => ({ rows: rows as number | undefined })
                )}
              />
            </div>
          </Field>
        )}
        <Field
          label="Alignment"
          changed={changed("align") || changed("justify")}
          mixed={mixed("align") || mixed("justify")}
          onReset={() => (reset("align"), reset("justify"))}
        >
          <div className="flex items-start gap-2">
            <AlignmentGrid
              style={style}
              direction={grid ? "row" : direction}
              distributed={distributed}
              onChange={set}
            />
            <div className="min-w-0 flex-1">
              <ChoiceInput
                value={distributed ? style.justify : undefined}
                options={distributeOptions}
                placeholder="Packed"
                onChange={(justify) => set({ justify: justify ?? "start" }, "Change distribution")}
              />
            </div>
          </div>
        </Field>
        <Field
          label="Gap"
          changed={changed("gap") || changed("rowGap")}
          mixed={mixed("gap") || mixed("rowGap")}
          onReset={() => (reset("gap"), reset("rowGap"))}
        >
          {grid || style.wrap ? (
            <div className="grid grid-cols-2 gap-1">
              <LengthInput
                editor={editor}
                label={grid ? "Col" : "X"}
                title="Gap between columns"
                value={style.gap}
                {...fieldEdits(
                  editor,
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
  onChange: StyleEditor["set"]
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
function SpacingSection({ editor }: SectionProps) {
  return (
    <PanelSection title="Spacing">
      <div className="flex flex-col gap-1">
        <SidesField editor={editor} name="padding" label="Padding" />
        <SidesField editor={editor} name="margin" label="Margin" />
      </div>
    </PanelSection>
  )
}

function SidesField({ editor, name, label }: { editor: StyleEditor; name: "padding" | "margin"; label: string }) {
  const { style, changed, reset } = editor
  const mixed = mixedOf(editor)
  const sides = sidesOf(style[name])
  const [perSide, setPerSide] = useState(Array.isArray(style[name]) && style[name].length === 4)
  /** Edits of some sides, read from the first of them, in each layer's own padding or margin. */
  const sideEdits = (indices: number[]) =>
    fieldEdits(
      editor,
      `Change ${name}`,
      (layer) => sidesOf(layer[name])?.[indices[0]!],
      (value, layer) => {
        const next = [...(sidesOf(layer[name]) ?? [0, 0, 0, 0])] as SideValues
        for (const index of indices) next[index] = asLength(value) ?? 0
        return { [name]: tidySides(next) }
      }
    )
  return (
    <Field label={label} changed={changed(name)} mixed={mixed(name)} onReset={() => reset(name)}>
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

function SizeSection({ editor, node, parent }: SectionProps) {
  const { style, changed, reset, set } = editor
  const mixed = mixedOf(editor)
  const [limits, setLimits] = useState(
    [style.minWidth, style.maxWidth, style.minHeight, style.maxHeight].some((value) => value !== undefined)
  )
  // `grow` is the older way to fill along the parent's direction; it shows, and is replaced, as fill.
  const grows = (axis: "width" | "height", layer: NodeStyle = style) =>
    layer.grow === true && (axis === "width") === (parent?.direction !== "column")
  const sizeOf = (axis: "width" | "height", layer: NodeStyle) => (grows(axis, layer) ? "fill" : layer[axis])
  const sizeField = (axis: "width" | "height", label: string) => (
    <Field label={label} changed={changed(axis)} mixed={mixed(axis)} onReset={() => reset(axis)}>
      <SizeInput
        editor={editor}
        axis={axis}
        value={sizeOf(axis, style)}
        canFill={parent !== undefined || node.type === "layout"}
        onChange={(value) => set({ [axis]: value, ...(grows(axis) ? { grow: undefined } : {}) }, `Change ${axis}`)}
        // A typed length makes a layer's size fixed; clearing it puts a fixed size back to auto and leaves fill or hug.
        edits={fieldEdits(
          editor,
          `Change ${axis}`,
          (layer) => fixedSize(sizeOf(axis, layer)),
          (value, layer) => {
            const size = sizeOf(axis, layer)
            return {
              [axis]: asLength(value) ?? (fixedSize(size) === undefined ? size : undefined),
              ...(grows(axis, layer) ? { grow: undefined } : {})
            }
          }
        )}
      />
    </Field>
  )
  const lengthEdits = (name: "minWidth" | "minHeight" | "maxWidth" | "maxHeight", label: string) =>
    fieldEdits(
      editor,
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
        {sizeField("width", "Width")}
        {sizeField("height", "Height")}
        {limits && (
          <>
            <Field
              label="Min"
              changed={changed("minWidth") || changed("minHeight")}
              mixed={mixed("minWidth") || mixed("minHeight")}
              onReset={() => (reset("minWidth"), reset("minHeight"))}
            >
              <div className="grid grid-cols-2 gap-1">
                <LengthInput
                  editor={editor}
                  label="W"
                  title="Minimum width"
                  value={style.minWidth}
                  blank={none}
                  {...lengthEdits("minWidth", "Change minimum width")}
                />
                <LengthInput
                  editor={editor}
                  label="H"
                  title="Minimum height"
                  value={style.minHeight}
                  blank={none}
                  {...lengthEdits("minHeight", "Change minimum height")}
                />
              </div>
            </Field>
            <Field
              label="Max"
              changed={changed("maxWidth") || changed("maxHeight")}
              mixed={mixed("maxWidth") || mixed("maxHeight")}
              onReset={() => (reset("maxWidth"), reset("maxHeight"))}
            >
              <div className="grid grid-cols-2 gap-1">
                <LengthInput
                  editor={editor}
                  label="W"
                  title="Maximum width"
                  value={style.maxWidth}
                  blank={none}
                  {...lengthEdits("maxWidth", "Change maximum width")}
                />
                <LengthInput
                  editor={editor}
                  label="H"
                  title="Maximum height"
                  value={style.maxHeight}
                  blank={none}
                  {...lengthEdits("maxHeight", "Change maximum height")}
                />
              </div>
            </Field>
          </>
        )}
        {parent && !parent.grid && (
          <Field label="Align self" changed={changed("self")} mixed={mixed("self")} onReset={() => reset("self")}>
            <ChoiceInput
              value={style.self}
              options={selfOptions}
              placeholder="Follow layout"
              onChange={(self) => set({ self }, "Change self alignment")}
            />
          </Field>
        )}
        {parent?.grid && (
          <Field
            label="Span"
            changed={changed("colSpan") || changed("rowSpan")}
            mixed={mixed("colSpan") || mixed("rowSpan")}
            onReset={() => (reset("colSpan"), reset("rowSpan"))}
          >
            <div className="grid grid-cols-2 gap-1">
              <CompactNumber
                label="Cols"
                title="Columns spanned"
                value={style.colSpan}
                placeholder="1"
                blank={() => 1}
                {...fieldEdits(
                  editor,
                  "Change span",
                  (layer) => layer.colSpan,
                  (colSpan) => ({ colSpan: colSpan as number | undefined })
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
                  "Change span",
                  (layer) => layer.rowSpan,
                  (rowSpan) => ({ rowSpan: rowSpan as number | undefined })
                )}
              />
            </div>
          </Field>
        )}
      </div>
    </PanelSection>
  )
}

/** A size's fixed length, or nothing when it's unset, fill or hug. */
function fixedSize(size: Size | undefined): Length | undefined {
  return size === "fill" || size === "hug" ? undefined : size
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
  if (mode === "auto") placeholder = "Auto"
  else if (mode === "fill") placeholder = "Fill"
  return (
    <div className="grid grid-cols-[1fr_92px] items-start gap-1">
      <LengthInput
        editor={editor}
        title={axis === "width" ? "Width" : "Height"}
        value={fixed ? value : undefined}
        placeholder={placeholder}
        blank={() => editor.measure(axis)}
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
          if (next === "fixed") onChange(fixed ? value : (editor.measure(axis) ?? 64))
          else onChange(next)
        }}
      />
    </div>
  )
}

function PositionSection({ editor, parent }: SectionProps) {
  const { style, changed, reset, set } = editor
  const mixed = mixedOf(editor)
  const absolute = style.position === "absolute"
  if (!parent && !absolute) return null
  const sides = ["top", "right", "bottom", "left"] as const
  return (
    <PanelSection title="Position">
      <div className="flex flex-col gap-1">
        <Field
          label="Placement"
          changed={changed("position")}
          mixed={mixed("position")}
          onReset={() => reset("position")}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            className="w-full"
            value={absolute ? "absolute" : "flow"}
            onValueChange={(value) =>
              value &&
              set(
                value === "absolute"
                  ? { position: "absolute", top: style.top ?? 0, left: style.left ?? 0 }
                  : { position: undefined, top: undefined, right: undefined, bottom: undefined, left: undefined },
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
          <Field
            label="Insets"
            changed={sides.some(changed)}
            mixed={sides.some(mixed)}
            onReset={() => sides.forEach(reset)}
          >
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
                  {...fieldEdits(
                    editor,
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
  const { style, changed, reset, set, tokens } = editor
  const mixed = mixedOf(editor)
  return (
    <PanelSection title="Appearance">
      <div className="flex flex-col gap-1">
        <Field
          label="Fill"
          changed={changed("background")}
          mixed={mixed("background")}
          onReset={() => reset("background")}
        >
          <TokenInput
            value={style.background}
            tokens={tokens}
            categories={["color"]}
            onChange={(background) => set({ background }, "Change fill")}
          />
        </Field>
        <Field label="Radius" changed={changed("radius")} mixed={mixed("radius")} onReset={() => reset("radius")}>
          <TokenInput
            value={style.radius}
            tokens={tokens}
            categories={["radius"]}
            onChange={(radius) => set({ radius }, "Change radius")}
          />
        </Field>
        <Field label="Shadow" changed={changed("shadow")} mixed={mixed("shadow")} onReset={() => reset("shadow")}>
          <TokenInput
            value={style.shadow}
            tokens={tokens}
            categories={["shadow"]}
            onChange={(shadow) => set({ shadow }, "Change shadow")}
          />
        </Field>
        <Field label="Opacity" changed={changed("opacity")} mixed={mixed("opacity")} onReset={() => reset("opacity")}>
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
              "Change opacity",
              (layer) => layer.opacity,
              (opacity) => ({ opacity: opacity as number | undefined })
            )}
          />
        </Field>
        <Field
          label="Overflow"
          changed={changed("overflow")}
          mixed={mixed("overflow")}
          onReset={() => reset("overflow")}
        >
          <ChoiceInput
            value={style.overflow}
            options={overflowOptions}
            placeholder="Visible"
            onChange={(overflow) => set({ overflow }, "Change overflow")}
          />
        </Field>
      </div>
    </PanelSection>
  )
}

function StrokeSection({ editor }: SectionProps) {
  const { style, changed, reset, set, tokens } = editor
  const mixed = mixedOf(editor)
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
            onClick={() => set({ border: "border", borderWidth: 1 }, "Add stroke")}
          >
            <Square /> Add
          </Button>
        )
      }
    >
      {on ? (
        <div className="flex flex-col gap-1">
          <Field label="Color" changed={changed("border")} mixed={mixed("border")} onReset={() => reset("border")}>
            <TokenInput
              value={style.border}
              tokens={tokens}
              categories={["color"]}
              onChange={(border) => set({ border }, "Change stroke color")}
            />
          </Field>
          <Field
            label="Width"
            changed={changed("borderWidth")}
            mixed={mixed("borderWidth")}
            onReset={() => reset("borderWidth")}
          >
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={String(style.borderWidth ?? 1)}
              onValueChange={(value) => value && set({ borderWidth: Number(value) }, "Change stroke width")}
            >
              {[1, 2, 4, 8].map((width) => (
                <ToggleGroupItem key={width} value={String(width)} className="h-7 w-9 text-xs tabular-nums">
                  {width}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          <Field
            label="Style"
            changed={changed("borderStyle")}
            mixed={mixed("borderStyle")}
            onReset={() => reset("borderStyle")}
          >
            <ChoiceInput
              value={style.borderStyle}
              options={borderStyleOptions}
              placeholder="Solid"
              onChange={(borderStyle) => set({ borderStyle }, "Change stroke style")}
            />
          </Field>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 self-start text-xs text-muted-foreground"
            onClick={() => set({ border: undefined, borderWidth: undefined, borderStyle: undefined }, "Remove stroke")}
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

function TextSection({ editor, node }: SectionProps) {
  const { style, changed, reset, set, tokens } = editor
  const mixed = mixedOf(editor)
  return (
    <PanelSection
      title={node.type === "text" ? "Text" : "Text inside"}
      description={node.type === "text" ? undefined : "Text in here inherits these unless it sets its own."}
    >
      <div className="flex flex-col gap-1">
        <Field
          label="Color"
          changed={changed("foreground")}
          mixed={mixed("foreground")}
          onReset={() => reset("foreground")}
        >
          <TokenInput
            value={style.foreground}
            tokens={tokens}
            categories={["color"]}
            onChange={(foreground) => set({ foreground }, "Change text color")}
          />
        </Field>
        <Field label="Font" changed={changed("font")} mixed={mixed("font")} onReset={() => reset("font")}>
          <TokenInput
            value={style.font}
            tokens={tokens}
            categories={["font"]}
            onChange={(font) => set({ font }, "Change font")}
          />
        </Field>
        <Field label="Size" changed={changed("size")} mixed={mixed("size")} onReset={() => reset("size")}>
          <TokenInput
            value={style.size}
            tokens={tokens}
            categories={["font-size"]}
            onChange={(size) => set({ size }, "Change text size")}
          />
        </Field>
        <Field label="Weight" changed={changed("weight")} mixed={mixed("weight")} onReset={() => reset("weight")}>
          <ChoiceInput
            value={style.weight === undefined ? undefined : String(style.weight)}
            options={weightOptions}
            placeholder="Inherit"
            onChange={(weight) => set({ weight: weight === undefined ? undefined : Number(weight) }, "Change weight")}
          />
        </Field>
        <Field
          label="Line height"
          changed={changed("leading")}
          mixed={mixed("leading")}
          onReset={() => reset("leading")}
        >
          <TokenInput
            value={style.leading}
            tokens={tokens}
            categories={["leading"]}
            onChange={(leading) => set({ leading }, "Change line height")}
          />
        </Field>
        <Field
          label="Letter spacing"
          changed={changed("tracking")}
          mixed={mixed("tracking")}
          onReset={() => reset("tracking")}
        >
          <TokenInput
            value={style.tracking}
            tokens={tokens}
            categories={["tracking"]}
            onChange={(tracking) => set({ tracking }, "Change letter spacing")}
          />
        </Field>
        <Field
          label="Align"
          changed={changed("textAlign")}
          mixed={mixed("textAlign")}
          onReset={() => reset("textAlign")}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={style.textAlign ?? ""}
            onValueChange={(value) =>
              set({ textAlign: (value || undefined) as NodeStyle["textAlign"] }, "Change text alignment")
            }
          >
            {textAlignOptions.map(({ value, label, Icon }) => (
              <Hint key={value} label={label}>
                <ToggleGroupItem value={value} aria-label={label} className="h-7 px-2 aria-checked:bg-muted">
                  <Icon />
                </ToggleGroupItem>
              </Hint>
            ))}
          </ToggleGroup>
        </Field>
        {node.type === "text" && <TextResizing editor={editor} />}
        <Field
          label="Decoration"
          changed={changed("italic") || changed("decoration")}
          mixed={mixed("italic") || mixed("decoration")}
          onReset={() => (reset("italic"), reset("decoration"))}
        >
          <div className="flex gap-1">
            <Hint label="Italic">
              <Toggle
                variant="outline"
                size="sm"
                className="h-7 px-2"
                aria-label="Italic"
                pressed={style.italic ?? false}
                onPressedChange={(italic) => set({ italic: italic || undefined }, "Toggle italic")}
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
                onPressedChange={(on) => set({ decoration: on ? "underline" : undefined }, "Toggle underline")}
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
                onPressedChange={(on) => set({ decoration: on ? "line-through" : undefined }, "Toggle strikethrough")}
              >
                <Strikethrough />
              </Toggle>
            </Hint>
          </div>
        </Field>
        <Field
          label="Case"
          changed={changed("transform")}
          mixed={mixed("transform")}
          onReset={() => reset("transform")}
        >
          <ChoiceInput
            value={style.transform}
            options={transformOptions}
            placeholder="As typed"
            onChange={(transform) => set({ transform }, "Change case")}
          />
        </Field>
        {node.type === "text" && (
          <Field label="Max lines" changed={changed("lines")} mixed={mixed("lines")} onReset={() => reset("lines")}>
            <NumberInput
              value={style.lines}
              rules={linesRules}
              title="Max lines"
              placeholder="No limit"
              {...fieldEdits(
                editor,
                "Change max lines",
                (layer) => layer.lines,
                (lines) => ({ lines: lines as number | undefined })
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
  const { style, set, changed, reset } = editor
  const mixed = mixedOf(editor)
  const differs = mixed("width") || mixed("height") || mixed("grow")
  return (
    <Field
      label="Resizing"
      hint="Auto width grows along its line, auto height wraps at its width and grows down, fixed keeps its size"
      changed={changed("width") || changed("height")}
      mixed={differs}
      onReset={() => (reset("width"), reset("height"))}
    >
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={differs ? "" : textSizing(style)}
        onValueChange={(value) => {
          const sizing = textSizingOptions.find((option) => option.value === value)
          if (!sizing) return
          set(
            (layer) =>
              withTextSizing(layer, sizing.value, {
                width: editor.measure("width", Math.ceil),
                height: editor.measure("height", Math.ceil)
              }),
            sizing.edit
          )
        }}
      >
        {textSizingOptions.map(({ value, label, Icon }) => (
          <Hint key={value} label={label}>
            <ToggleGroupItem value={value} aria-label={label} className="h-7 px-2 aria-checked:bg-muted">
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
 * length tokens by name. The list beside it picks a step or a token. What it reads is in `@parity-app/core`'s fields.ts.
 */
export function LengthInput({
  editor,
  value,
  label,
  title,
  placeholder = "0",
  min = 0,
  blank = zero,
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
} & Pick<NumberFieldProps, "onPreview" | "onCancel" | "onCommit">) {
  const { tokens, unit } = editor
  const [open, setOpen] = useState(false)
  const lengthTokens = tokens.filter(
    (token) => (token.category === "spacing" || token.category === "container") && token.name !== "spacing"
  )
  const scale = lengthTokens.filter((token) => token.derived)
  const named = lengthTokens.filter((token) => !token.derived)
  const rules: FieldRules = { kind: "length", unit, min, label: title }
  const pick = (picked: Length) => {
    onCommit(() => picked)
    setOpen(false)
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
      hint={typeof value === "number" ? `${title}, ${lengthLabel(value)}` : title}
      suffix={typeof value === "number" ? "px" : undefined}
      onPreview={onPreview}
      onCancel={onCancel}
      onCommit={onCommit}
      after={
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Pick a token for ${title.toLowerCase()}`}
              className="grid h-full w-5 shrink-0 place-items-center rounded-r-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronDown className="size-3" />
            </button>
          </PopoverTrigger>
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

type SideValues = [Length, Length, Length, Length]

/** Padding or margin as four sides, whichever form it's written in. */
export function sidesOf(value: Padding | undefined): SideValues | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return [value, value, value, value]
  if (value.length === 2) return [value[0], value[1], value[0], value[1]]
  return value
}

/** The shortest form of four sides. */
export function tidySides([top, right, bottom, left]: SideValues): Padding {
  if (top === bottom && right === left) return top === right ? top : [top, right]
  return [top, right, bottom, left]
}

/** A step's token name, for showing it the way the Tokens panel does. */
export function lengthLabel(value: Length): string {
  return typeof value === "number" ? spacingStepName(value) : value
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
