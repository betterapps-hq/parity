import {
  type DesignNode,
  type Length,
  type NodeStyle,
  type Padding,
  type Size,
  spacingStepName,
  type Token
} from "@parity/core"
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
  Square,
  SquareDashed,
  Strikethrough,
  Underline,
  WrapText
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { kindColors } from "../canvas/kinds.tsx"
import { ChoiceInput, Field, NumberInput, TokenInput, useMixed } from "./fields.tsx"
import { PanelSection } from "./PanelSection.tsx"

/** Reads and writes one node's style in the state being edited. */
export interface StyleEditor {
  style: NodeStyle
  changed(name: keyof NodeStyle): boolean
  reset(name: keyof NodeStyle): void
  /** Several properties as one undoable change. `undefined` clears a property. */
  set(values: Partial<{ [K in keyof NodeStyle]: NodeStyle[K] | undefined }>, label?: string): void
  tokens: Token[]
  /** Pixels per spacing step. */
  unit: number
  /** The node's rendered length, in whole spacing steps, so switching to a fixed size keeps it where it is. */
  measure(axis: "width" | "height"): number | undefined
  /** With several layers selected: whether they have different values for a property. */
  mixed?(name: keyof NodeStyle): boolean
}

/** Whether a property differs across the selected layers; never, with one layer. */
function mixedOf(editor: StyleEditor): (name: keyof NodeStyle) => boolean {
  return (name) => editor.mixed?.(name) ?? false
}

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
              <ToggleGroupItem value="column" aria-label="Vertical" title="Vertical auto layout" className="h-7 px-2">
                <ArrowDown />
              </ToggleGroupItem>
              <ToggleGroupItem value="row" aria-label="Horizontal" title="Horizontal auto layout" className="h-7 px-2">
                <ArrowRight />
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Grid" title="Grid" className="h-7 px-2">
                <Grid3x3 />
              </ToggleGroupItem>
            </ToggleGroup>
            {!grid && (
              <Toggle
                variant="outline"
                size="sm"
                className="h-7 px-2"
                aria-label="Wrap"
                title="Wrap onto new lines"
                pressed={style.wrap ?? false}
                onPressedChange={(wrap) => set({ wrap: wrap || undefined }, "Toggle wrap")}
              >
                <WrapText />
              </Toggle>
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
                value={style.columns}
                placeholder="2"
                onCommit={(columns) => set({ columns: columns && Math.max(1, Math.round(columns)) }, "Change columns")}
              />
              <CompactNumber
                label="Rows"
                value={style.rows}
                placeholder="Auto"
                onCommit={(rows) => set({ rows: rows && Math.max(1, Math.round(rows)) }, "Change rows")}
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
                onCommit={(gap) => set({ gap }, "Change gap")}
              />
              <LengthInput
                editor={editor}
                label={grid ? "Row" : "Y"}
                title="Gap between rows"
                value={style.rowGap ?? style.gap}
                onCommit={(rowGap) => set({ rowGap }, "Change row gap")}
              />
            </div>
          ) : (
            <LengthInput editor={editor} title="Gap" value={style.gap} onCommit={(gap) => set({ gap }, "Change gap")} />
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
            <button
              key={`${row}-${column}`}
              type="button"
              aria-label={`Align ${row} ${column}`}
              title={`${labels[main]} on the main axis, ${labels[cross].toLowerCase()} across`}
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
  const { style, changed, reset, set } = editor
  const mixed = mixedOf(editor)
  const sides = sidesOf(style[name])
  const [perSide, setPerSide] = useState(Array.isArray(style[name]) && style[name].length === 4)
  const commit = (next: SideValues) => set({ [name]: tidySides(next) }, `Change ${name}`)
  const at = (index: number, value: Length | undefined): SideValues => {
    const next = [...(sides ?? [0, 0, 0, 0])] as SideValues
    next[index] = value ?? 0
    return next
  }
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
                onCommit={(value) => commit(at(index, value))}
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
              onCommit={(value) => commit([value ?? 0, sides?.[1] ?? 0, value ?? 0, sides?.[3] ?? 0])}
            />
            <LengthInput
              editor={editor}
              label="H"
              title={`Left and right ${name}`}
              value={sides?.[1]}
              onCommit={(value) => commit([sides?.[0] ?? 0, value ?? 0, sides?.[2] ?? 0, value ?? 0])}
            />
          </div>
        )}
        <Toggle
          size="sm"
          className="size-7 min-w-7 shrink-0 self-start p-0"
          aria-label={`${label} per side`}
          title={`${label} per side`}
          pressed={perSide}
          onPressedChange={setPerSide}
        >
          <SquareDashed />
        </Toggle>
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
  const grows = (axis: "width" | "height") =>
    style.grow === true && (axis === "width") === (parent?.direction !== "column")
  const sizeField = (axis: "width" | "height", label: string) => (
    <Field label={label} changed={changed(axis)} mixed={mixed(axis)} onReset={() => reset(axis)}>
      <SizeInput
        editor={editor}
        axis={axis}
        value={grows(axis) ? "fill" : style[axis]}
        canFill={parent !== undefined || node.type === "layout"}
        onChange={(value) => set({ [axis]: value, ...(grows(axis) ? { grow: undefined } : {}) }, `Change ${axis}`)}
      />
    </Field>
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
                  onCommit={(minWidth) => set({ minWidth }, "Change minimum width")}
                />
                <LengthInput
                  editor={editor}
                  label="H"
                  title="Minimum height"
                  value={style.minHeight}
                  onCommit={(minHeight) => set({ minHeight }, "Change minimum height")}
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
                  onCommit={(maxWidth) => set({ maxWidth }, "Change maximum width")}
                />
                <LengthInput
                  editor={editor}
                  label="H"
                  title="Maximum height"
                  value={style.maxHeight}
                  onCommit={(maxHeight) => set({ maxHeight }, "Change maximum height")}
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
                value={style.colSpan}
                placeholder="1"
                onCommit={(colSpan) => set({ colSpan: colSpan && Math.max(1, Math.round(colSpan)) }, "Change span")}
              />
              <CompactNumber
                label="Rows"
                value={style.rowSpan}
                placeholder="1"
                onCommit={(rowSpan) => set({ rowSpan: rowSpan && Math.max(1, Math.round(rowSpan)) }, "Change span")}
              />
            </div>
          </Field>
        )}
      </div>
    </PanelSection>
  )
}

/** Fixed (a length), fill or hug. Typing a length or picking a token makes it fixed. */
function SizeInput({
  editor,
  axis,
  value,
  canFill,
  onChange
}: {
  editor: StyleEditor
  axis: "width" | "height"
  value: Size | undefined
  canFill: boolean
  onChange(value: Size | undefined): void
}) {
  const fixed = value !== undefined && value !== "fill" && value !== "hug"
  const mode = fixed ? "fixed" : (value ?? "auto")
  return (
    <div className="grid grid-cols-[1fr_92px] gap-1">
      <LengthInput
        editor={editor}
        title={axis === "width" ? "Width" : "Height"}
        value={fixed ? value : undefined}
        placeholder={mode === "auto" ? "Auto" : mode === "fill" ? "Fill" : "Hug"}
        onCommit={(next) => onChange(next ?? (fixed ? undefined : value))}
      />
      <ChoiceInput
        value={mode === "auto" ? undefined : mode}
        options={[
          { value: "fixed", label: "Fixed" },
          ...(canFill ? [{ value: "fill" as const, label: "Fill" }] : []),
          { value: "hug", label: "Hug" }
        ]}
        placeholder="Auto"
        onChange={(next) => onChange(next === "fixed" ? (fixed ? value : (editor.measure(axis) ?? 64)) : next)}
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
                  onCommit={(value) => set({ [side]: value }, `Change ${side}`)}
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
            placeholder="100"
            suffix="%"
            onCommit={(opacity) =>
              set(
                { opacity: opacity === undefined ? undefined : Math.min(100, Math.max(0, opacity)) },
                "Change opacity"
              )
            }
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
              <ToggleGroupItem key={value} value={value} aria-label={label} title={label} className="h-7 px-2">
                <Icon />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field
          label="Decoration"
          changed={changed("italic") || changed("decoration")}
          mixed={mixed("italic") || mixed("decoration")}
          onReset={() => (reset("italic"), reset("decoration"))}
        >
          <div className="flex gap-1">
            <Toggle
              variant="outline"
              size="sm"
              className="h-7 px-2"
              aria-label="Italic"
              title="Italic"
              pressed={style.italic ?? false}
              onPressedChange={(italic) => set({ italic: italic || undefined }, "Toggle italic")}
            >
              <Italic />
            </Toggle>
            <Toggle
              variant="outline"
              size="sm"
              className="h-7 px-2"
              aria-label="Underline"
              title="Underline"
              pressed={style.decoration === "underline"}
              onPressedChange={(on) => set({ decoration: on ? "underline" : undefined }, "Toggle underline")}
            >
              <Underline />
            </Toggle>
            <Toggle
              variant="outline"
              size="sm"
              className="h-7 px-2"
              aria-label="Strikethrough"
              title="Strikethrough"
              pressed={style.decoration === "line-through"}
              onPressedChange={(on) => set({ decoration: on ? "line-through" : undefined }, "Toggle strikethrough")}
            >
              <Strikethrough />
            </Toggle>
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
              placeholder="No limit"
              onCommit={(lines) => set({ lines: lines && Math.max(1, Math.round(lines)) }, "Change max lines")}
            />
          </Field>
        )}
      </div>
    </PanelSection>
  )
}

/**
 * A length: type a step of the spacing scale (`4` is 16px with a 4px unit), or pick a step or one of the project's
 * length tokens from the list. Shows what it comes to in pixels.
 */
export function LengthInput({
  editor,
  value,
  label,
  title,
  placeholder = "0",
  onCommit
}: {
  editor: Pick<StyleEditor, "tokens" | "unit">
  value: Length | undefined
  /** A letter or two inside the field, for rows of related lengths. */
  label?: string
  title: string
  placeholder?: string
  onCommit(value: Length | undefined): void
}) {
  const { tokens, unit } = editor
  const mixed = useMixed()
  const [open, setOpen] = useState(false)
  const lengthTokens = tokens.filter(
    (token) => (token.category === "spacing" || token.category === "container") && token.name !== "spacing"
  )
  const scale = lengthTokens.filter((token) => token.derived)
  const named = lengthTokens.filter((token) => !token.derived)
  const shown = value === undefined ? "" : typeof value === "number" ? String(value) : value
  const px = typeof value === "number" ? `${formatPx(value * unit)}px` : undefined
  const commitText = (text: string) => {
    const raw = text.trim()
    if (raw === shown) return
    if (raw === "") return onCommit(undefined)
    const step = /^spacing-([\d.]+)$/.exec(raw)?.[1] ?? raw
    if (Number.isFinite(Number(step))) return onCommit(Math.max(0, Number(step)))
    const token = named.find((candidate) => candidate.name === raw.replace(/^--/, ""))
    if (token) onCommit(token.name)
  }
  return (
    <div
      title={`${title}${px ? `, ${px}` : ""}`}
      className="flex h-7 min-w-0 items-center rounded-md border border-input shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30"
    >
      {label && <span className="pointer-events-none shrink-0 pl-1.5 text-[10px] text-muted-foreground">{label}</span>}
      <Input
        key={shown}
        aria-label={title}
        defaultValue={shown}
        placeholder={mixed && value === undefined ? "Mixed" : placeholder}
        className={`h-6 min-w-0 flex-1 border-0 bg-transparent px-1.5 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent ${
          typeof value === "string" ? "font-mono" : "tabular-nums"
        }`}
        onBlur={(event) => commitText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
      {px && <span className="pointer-events-none shrink-0 pr-0.5 text-[10px] text-muted-foreground">{px}</span>}
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
                <CommandGroup heading="Project tokens">
                  {named.map((token) => (
                    <CommandItem
                      key={token.name}
                      value={token.name}
                      onSelect={() => {
                        onCommit(token.name)
                        setOpen(false)
                      }}
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
                    onSelect={() => {
                      onCommit(token.derived!.factor)
                      setOpen(false)
                    }}
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
    </div>
  )
}

/** A whole number with a short label inside the field. */
function CompactNumber({
  label,
  value,
  placeholder,
  onCommit
}: {
  label: string
  value: number | undefined
  placeholder: string
  onCommit(value: number | undefined): void
}) {
  const mixed = useMixed()
  return (
    <label className="flex h-7 min-w-0 items-center gap-1 rounded-md border border-input px-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
      <span className="shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <Input
        key={value ?? ""}
        type="number"
        min={1}
        aria-label={label}
        defaultValue={value ?? ""}
        placeholder={mixed && value === undefined ? "Mixed" : placeholder}
        className="h-6 min-w-0 flex-1 border-0 bg-transparent p-0 text-xs tabular-nums shadow-none focus-visible:ring-0 dark:bg-transparent"
        onBlur={(event) => {
          const raw = event.currentTarget.value.trim()
          const next = raw === "" ? undefined : Number(raw)
          if (next !== value && (next === undefined || Number.isFinite(next))) onCommit(next)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </label>
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
