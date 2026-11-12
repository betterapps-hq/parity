import { Collapsible, CollapsibleContent, CollapsibleTrigger, DropdownMenuItem } from "@buildkitgg/shadcn-baseui-kit"
import type { PreviewKind } from "@parity-app/tokens"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import { GroupLabel, PanelSection } from "../../chrome/PanelSection.tsx"
import { ColorInput } from "./color-picker.tsx"
import { PixelField } from "./controls.tsx"
import { shadowCss } from "./css-values.ts"
import { usedColors } from "./data.ts"
import {
  MessageLine,
  MissingMark,
  type Reading,
  type ScrubKeys,
  stepToken,
  TokenChip,
  TokenMark,
  tokenNamed,
  useTokens,
  ValueField
} from "./field-parts.tsx"
import { Field, FieldGrid, SectionButton, type Segment, Segments, SwitchRow, TitleMenu } from "./field-row.tsx"
import {
  CreateTokenNote,
  EntryType,
  entryList,
  ListRow,
  MixedList,
  moved,
  OffsetPad,
  TypeMenu,
  type TypeOption
} from "./list-parts.tsx"
import {
  boxLayersOf,
  colorWords,
  drawListColor,
  layerNumbers,
  layersOf,
  type ListColor,
  newId,
  type ShadowEntry,
  type ShadowKind,
  type ShadowLayer
} from "./lists-data.ts"
import { shadowDrawing, shadowsFitSlots, shadowTarget } from "./lists-writes.ts"
import { Card } from "./playground.tsx"
import type { Carried } from "./sortable.ts"
import { type ShadowToken, shadowToken } from "./tokens.ts"

/*
 * Effects' shadow list (design-options-values.md, Shadow list): drop shadows, inner shadows and rings, in two groups,
 * Inside then Outside, top first as Tailwind paints them, each dragged within its group. A drop shadow that follows
 * the shape is the filter's, listed after them. Each entry's card opens its editor: X, Y, blur, spread and color with
 * the offset pad, or a ring's width, position and color. A shadow token is a chip whose layers fold under a disclosure;
 * only its color can be overridden, as Tailwind can (`shadow-lg shadow-black/20`), and the rest offers Detach.
 */

const kindNames: Record<ShadowKind, string> = { drop: "Drop shadow", inner: "Inner shadow", ring: "Ring" }
const shadowKinds: readonly ShadowKind[] = ["drop", "inner", "ring"]

/** The namespace a shadow token's name has, which its chip leaves off: `shadow-` in `shadow-md`. */
const shadowNamespace = (name: string) => /^(inset-shadow|drop-shadow|text-shadow|shadow)-/.exec(name)?.[0]

/**
 * The project's shadow tokens of every kind, with any made with Create token, and how to add a box shadow one; and the
 * ones an entry offers, by the kind its card draws (a ring offers none).
 */
function useShadowTokens() {
  const shadow = useTokens("shadow")
  const inset = useTokens("insetShadow")
  const drop = useTokens("dropShadow")
  const text = useTokens("textShadow")
  const all: ShadowToken[] = [...shadow.tokens, ...inset.tokens, ...drop.tokens, ...text.tokens]

  const offered = (entry: ShadowEntry, onText: boolean) =>
    entry.kind === "ring" ? [] : all.filter((token) => token.kind === cardKind(entry, onText))

  return { all, offered, create: shadow.create }
}

/** Which group an entry is listed and dragged in. */
function groupOf(entry: ShadowEntry): "inside" | "outside" | "follow" {
  if (entry.kind === "inner" || (entry.kind === "ring" && entry.inset)) {
    return "inside"
  }

  if (entry.kind === "drop" && entry.follow) {
    return "follow"
  }

  return "outside"
}

/** Inside, then Outside, then what follows the shape, keeping each group's order. */
const inGroups = (entries: ShadowEntry[]) => [
  ...entries.filter((entry) => groupOf(entry) === "inside"),
  ...entries.filter((entry) => groupOf(entry) === "outside"),
  ...entries.filter((entry) => groupOf(entry) === "follow")
]

const defaultLayer: ShadowLayer = { x: 0, y: 4, blur: 12, spread: -2, color: "black", alpha: 10 }

/** What + and the section's menu add, as the list's usual entries. */
function newEntry(kind: ShadowKind | "follow", onText: boolean): ShadowEntry {
  const id = newId("shadow")

  if (kind === "ring") {
    return { id, kind: "ring", width: 1, layer: { ...defaultLayer, color: "ring", alpha: undefined } }
  }

  if (kind === "inner") {
    return { id, kind: "inner", token: "inset-shadow-sm", layer: defaultLayer }
  }

  if (kind === "follow") {
    return { id, kind: "drop", follow: true, token: "drop-shadow-md", layer: defaultLayer }
  }

  return { id, kind: "drop", token: onText ? "text-shadow-sm" : "shadow-sm", layer: defaultLayer }
}

export interface ShadowText {
  /** Whether the text layer has a fill or stroke, which gives a drop shadow a Shadow of toggle. */
  hasFill: boolean
  shadowOf: "text" | "box"
  onShadowOf: (shadowOf: "text" | "box") => void
}

export function ShadowList({
  entries,
  onChange,
  mixed = false,
  tokensOnly = false,
  text,
  onPreview,
  openId
}: {
  entries: ShadowEntry[]
  onChange: (entries: ShadowEntry[]) => void
  mixed?: boolean
  tokensOnly?: boolean
  /** On a text layer, a drop shadow shadows the text (`text-shadow`) unless Shadow of is Box. */
  text?: ShadowText
  /** The shadows in the order one's being carried over, for the layer to draw before it's let go; nothing after. */
  onPreview?: (entries: ShadowEntry[] | undefined) => void
  openId?: string
}) {
  const { all, create } = useShadowTokens()
  const ordered = inGroups(entries)
  const list = entryList(ordered, onChange)
  const onText = text !== undefined && text.shadowOf === "text"

  // A shadow moves only past others of its group, its place counted within the group.
  const reordered = (group: string, rows: ShadowEntry[], from: number, to: number) => {
    const moves = moved(rows, from, to)

    return inGroups(ordered.map((other) => (groupOf(other) === group ? moves.shift()! : other)))
  }

  const add = (kind: ShadowKind | "follow") => {
    const added = newEntry(kind, onText)

    if (mixed) {
      onChange([added])

      return
    }

    // Each goes on top of its kind, so Tailwind's order holds: a drop shadow on top of the drop shadows, below any rings.
    let at = -1

    if (kind === "inner") {
      at = 0
    }

    if (kind === "ring") {
      at = ordered.findIndex((entry) => groupOf(entry) !== "inside")
    }

    if (kind === "drop") {
      at = ordered.findIndex((entry) => entry.kind === "drop" && groupOf(entry) === "outside")

      if (at < 0) {
        at = ordered.findIndex((entry) => groupOf(entry) === "follow")
      }
    }

    if (at < 0) {
      at = ordered.length
    }

    onChange(inGroups([...ordered.slice(0, at), added, ...ordered.slice(at)]))
  }

  const fits = shadowsFitSlots(ordered, onText)

  // A group with no shadows doesn't show.
  const groups = (["inside", "outside", "follow"] as const).flatMap((group) => {
    const rows = ordered.filter((entry) => groupOf(entry) === group)

    return rows.length > 0 ? [{ group, rows }] : []
  })

  const titles = { inside: "Inside", outside: onText ? "Outside, on the text" : "Outside", follow: "Follows the shape" }
  // Handles show where a group has two shadows or more; the others keep their room so the rows line up.
  const handles = groups.some(({ rows }) => rows.length > 1)

  // The shadows on the box become one token, by the name given, which takes their place.
  const saveAsToken = (name: string) => {
    const box = ordered.filter((entry) => !entry.off && shadowTarget(entry, onText) === "box")
    create?.(
      shadowToken(
        "shadow",
        name,
        box.flatMap((entry) => boxLayersOf(entry, all))
      )
    )
    onChange([
      { id: newId("shadow"), kind: "drop", token: name, layer: defaultLayer },
      ...ordered.filter((entry) => !box.includes(entry))
    ])
  }

  const unfit = "These shadows don't fit Tailwind's shadow utilities, so they're written as one arbitrary value."

  return (
    <PanelSection
      title="Effects"
      action={
        <div className="flex items-center">
          <TitleMenu label="More effects">
            <DropdownMenuItem className="text-xs" onClick={() => add("inner")}>
              Add inner shadow
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={() => add("ring")}>
              Add ring
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={() => add("follow")}>
              Add drop shadow that follows the shape
            </DropdownMenuItem>
          </TitleMenu>
          <SectionButton
            what="drop shadow"
            hint={mixed ? "Replace every layer's shadows with one" : undefined}
            onClick={() => add("drop")}
          />
        </div>
      }
    >
      {mixed && <MixedList what="shadows" />}
      {!mixed && entries.length > 0 && (
        <div className="flex flex-col gap-1">
          {/* The groups' titles and rows are siblings, so a shadow that changes group (Follow shape) keeps its row and
              its open details rather than being drawn anew under the other title. */}
          {groups.flatMap(({ group, rows }) => [
            <GroupLabel key={`group-${group}`} className={handles ? "px-4" : ""}>
              {titles[group]}
            </GroupLabel>,
            ...rows.map((entry, index) => (
              <ShadowRow
                key={entry.id}
                entry={entry}
                index={index}
                group={group}
                tokensOnly={tokensOnly}
                text={text}
                startOpen={entry.id === openId}
                onChange={(change) => list.update(entry.id, change)}
                // A shadow moves only past another in its group, so one alone has no handle.
                onMove={rows.length > 1 ? (from, to) => onChange(reordered(group, rows, from, to)) : undefined}
                onCarry={(carried) => onPreview?.(carried && reordered(group, rows, carried.from, carried.to))}
                gutter={handles}
                onRemove={() => list.remove(entry.id)}
              />
            ))
          ])}
          {!fits && (
            <div className={handles ? "px-4" : ""}>
              {create ? (
                <CreateTokenNote
                  says={unfit}
                  namespace="shadow-"
                  placeholder="card"
                  isTaken={(full) => tokenNamed(all, full) !== undefined}
                  onSave={saveAsToken}
                />
              ) : (
                <MessageLine message={{ tone: "note", text: unfit }} />
              )}
            </div>
          )}
        </div>
      )}
    </PanelSection>
  )
}

/** The preview kind an entry's card is drawn as: a shadow on a card, inside it, under a shape, or on letters. */
function cardKind(entry: ShadowEntry, onText: boolean): PreviewKind {
  if (entry.kind === "inner" || (entry.kind === "ring" && entry.inset)) {
    return "inset-shadow"
  }

  if (entry.kind === "drop" && entry.follow) {
    return "drop-shadow"
  }

  if (entry.kind === "drop" && onText) {
    return "text-shadow"
  }

  return "shadow"
}

/**
 * An entry's card: its shadow drawn by the Tokens panel's preview for its kind, on the design's sheet, as a shadow
 * token's is in its list, with the entry's own color.
 */
export function ShadowCard({ entry, onText = false }: { entry: ShadowEntry; onText?: boolean }) {
  const { tokens: colors } = useTokens("color")
  const { all } = useShadowTokens()
  const draw = (value: ListColor) => drawListColor(value, colors)
  const kind = cardKind(entry, onText)
  let value = shadowCss(boxLayersOf(entry, all), draw)

  // A drop shadow's preview takes one `drop-shadow()`'s arguments, and a text shadow's has no spread either.
  if (kind === "drop-shadow") {
    value = shadowCss(layersOf(entry, all).slice(0, 1), draw, { spread: false })
  }

  if (kind === "text-shadow") {
    value = shadowCss(layersOf(entry, all), draw, { spread: false })
  }

  return <TokenMark kind={kind} value={value} />
}

/**
 * A shadow token in a row: its chip alone, with a dot where its color is changed here. Its numbers are in its hint and
 * the entry's details, so the row stays readable.
 */
function ShadowTokenSummary({ entry }: { entry: ShadowEntry }) {
  const name = entry.token ?? ""
  const token = useShadowTokens().all.find((option) => option.name === name)

  return (
    // Room for the chip's dot, which sits over its corner: the row clips what spills out of it.
    <span className="flex min-w-0 pt-1 pr-1 text-foreground">
      <TokenChip
        name={name}
        token={token}
        namespace={shadowNamespace(name)}
        // The row's card is its preview, so the chip doesn't draw another.
        preview={null}
        struck={!token}
        overridden={entry.colorOverride !== undefined}
      />
    </span>
  )
}

function ShadowRow({
  entry,
  index,
  group,
  tokensOnly,
  text,
  startOpen,
  onChange,
  onMove,
  onCarry,
  gutter,
  onRemove
}: {
  entry: ShadowEntry
  index: number
  group: string
  tokensOnly: boolean
  text: ShadowText | undefined
  startOpen: boolean
  onChange: (change: Partial<ShadowEntry>) => void
  onMove?: (from: number, to: number) => void
  onCarry: (carried: Carried) => void
  gutter: boolean
  onRemove: () => void
}) {
  const onText = text !== undefined && text.shadowOf === "text"
  const name = `${kindNames[entry.kind]} ${index + 1}`
  const spread = entry.kind !== "drop" || (!entry.follow && !onText)
  let summary = `${layerNumbers(entry.layer, spread)} ${colorWords(entry.layer)}`

  if (entry.kind === "ring") {
    summary = `${entry.width ?? 1}px ${colorWords(entry.layer)}`
  }

  const types: TypeOption<ShadowKind>[] = shadowKinds.map((kind) => ({
    value: kind,
    label: kind === "ring" && entry.kind === "ring" && entry.inset ? "Inset ring" : kindNames[kind]
  }))

  return (
    <ListRow
      name={name}
      group={group}
      off={entry.off}
      onMove={onMove}
      onCarry={onCarry}
      gutter={gutter}
      onToggle={() => onChange({ off: !entry.off })}
      onRemove={onRemove}
      preview={<ShadowCard entry={entry} onText={onText} />}
      title={types.find((type) => type.value === entry.kind)?.label}
      details={{
        content: (
          <>
            <EntryType className="mb-1">
              <TypeMenu
                label={name}
                value={entry.kind}
                options={types}
                onChange={(kind) => {
                  const next = newEntry(kind, onText)
                  onChange({
                    kind: next.kind,
                    token: next.token,
                    width: next.width,
                    layer: next.kind === "ring" ? next.layer : entry.layer,
                    colorOverride: undefined,
                    follow: undefined,
                    inset: undefined
                  })
                }}
              />
            </EntryType>
            <ShadowEditor entry={entry} tokensOnly={tokensOnly} text={text} onChange={onChange} />
          </>
        ),
        defaultOpen: startOpen,
        className: "w-72 p-3"
      }}
    >
      {entry.token === undefined || entry.kind === "ring" ? (
        <span className="truncate">{summary}</span>
      ) : (
        <ShadowTokenSummary entry={entry} />
      )}
    </ListRow>
  )
}

/**
 * One shadow's editor, each row's name above its control so the control takes the row: a token, its color overridable
 * and its layers under a disclosure, or the offset pad with X and Y beside it, Blur and Spread side by side, and the
 * color; Shadow of on a text layer with a fill, and Follow shape's switch for a drop shadow. A ring has its width and
 * position (Outside or Inside) side by side, then its color.
 */
export function ShadowEditor({
  entry,
  tokensOnly = false,
  text,
  inFilter = false,
  onChange
}: {
  entry: ShadowEntry
  tokensOnly?: boolean
  text?: ShadowText
  /** In the filter list, where a drop shadow always follows the shape, so Follow shape isn't offered. */
  inFilter?: boolean
  onChange: (change: Partial<ShadowEntry>) => void
}) {
  const onText = text !== undefined && text.shadowOf === "text"
  const { all, offered } = useShadowTokens()
  const tokens = offered(entry, onText)
  const layer = entry.layer
  const setLayer = (change: Partial<ShadowLayer>) => onChange({ layer: { ...layer, ...change } })
  const spread = entry.kind === "inner" || (entry.kind === "drop" && !entry.follow && !onText)

  if (entry.kind === "ring") {
    return (
      <FieldGrid>
        <Field label="Width" half>
          <PixelField
            label="Ring width"
            value={entry.width ?? 1}
            min={0}
            onChange={(width) => onChange({ width: Math.round(width ?? 1) })}
          />
        </Field>
        <Field label="Position" half>
          <Segments
            label="Ring position"
            value={entry.inset ? "inside" : "outside"}
            options={ringPositions}
            onChange={(position) => onChange({ inset: position === "inside" || undefined })}
          />
        </Field>
        <Field label="Color">
          <ColorInput
            label="Ring color"
            value={layer.color}
            alpha={layer.alpha}
            tokensOnly={tokensOnly}
            used={usedColors}
            onChange={(color, alpha) => setLayer({ color: color ?? layer.color, alpha })}
          />
        </Field>
      </FieldGrid>
    )
  }

  const token = entry.token

  return (
    <FieldGrid>
      <Field label="Token">
        <ShadowTokenField entry={entry} tokens={tokens} onChange={onChange} />
      </Field>
      {token !== undefined ? (
        <TokenParts entry={entry} tokensOnly={tokensOnly} spread={spread} onChange={onChange} />
      ) : (
        <>
          <Field label="Offset">
            <div className="flex items-center gap-2">
              <OffsetPad x={layer.x} y={layer.y} onChange={(x, y) => setLayer({ x, y })} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <PixelField
                  label="X offset"
                  inner="X"
                  min={-999}
                  value={layer.x}
                  onChange={(x) => setLayer({ x: x ?? 0 })}
                />
                <PixelField
                  label="Y offset"
                  inner="Y"
                  min={-999}
                  value={layer.y}
                  onChange={(y) => setLayer({ y: y ?? 0 })}
                />
              </div>
            </div>
          </Field>
          <Field label="Blur" half={spread}>
            <PixelField label="Blur" value={layer.blur} onChange={(blur) => setLayer({ blur: blur ?? 0 })} />
          </Field>
          {spread && (
            <Field label="Spread" half>
              <PixelField
                label="Spread"
                min={-999}
                value={layer.spread}
                onChange={(next) => setLayer({ spread: next ?? 0 })}
              />
            </Field>
          )}
          <Field label="Color">
            <ColorInput
              label="Shadow color"
              value={layer.color}
              alpha={layer.alpha}
              tokensOnly={tokensOnly}
              used={usedColors}
              onChange={(color, alpha) => setLayer({ color: color ?? layer.color, alpha })}
            />
          </Field>
        </>
      )}
      {entry.kind === "drop" && text?.hasFill && (
        <Field label="Shadow of">
          <Segments label="Shadow of" value={text.shadowOf} options={shadowOfs} onChange={text.onShadowOf} />
        </Field>
      )}
      {entry.kind === "drop" && !onText && !inFilter && (
        <SwitchRow
          label="Follow shape"
          detail="Shadows what's drawn rather than the box, with no spread: filter: drop-shadow(), the filter's last entry"
          checked={entry.follow ?? false}
          onCheckedChange={(follow) => {
            // A token keeps its size across, shadow-lg to drop-shadow-lg and back, where the other scale has it.
            const size = token?.replace(/^(drop-)?shadow-/, "")
            const same = all.find((option) => option.name === `${follow ? "drop-shadow" : "shadow"}-${size}`)
            const next = same?.name ?? (follow ? "drop-shadow-md" : "shadow-sm")
            onChange({
              follow: follow || undefined,
              token: token === undefined ? undefined : next,
              colorOverride: undefined
            })
          }}
        />
      )}
    </FieldGrid>
  )
}

const ringPositions = [
  { value: "outside", label: "Outside", detail: "Around the edge: ring" },
  { value: "inside", label: "Inside", detail: "Within the edge: inset-ring" }
] as const satisfies readonly Segment<string>[]

const shadowOfs = [
  { value: "text", label: "Text", detail: "Shadows the letters: text-shadow" },
  { value: "box", label: "Box", detail: "Shadows the fill's box: box-shadow" }
] as const satisfies readonly Segment<string>[]

/**
 * A shadow's token, on the shared field: the token as a chip, or Custom for the entry's own numbers. Its list draws
 * each token with its preview; typing a token's name (`md`, `shadow-md`) takes it, Up and Down step through the scale,
 * and Custom, the chip's ×, Backspace on it, or Detach in its list detaches the token, keeping its first layer as the
 * entry's own.
 */
function ShadowTokenField({
  entry,
  tokens,
  onChange
}: {
  entry: ShadowEntry
  tokens: ShadowToken[]
  onChange: (change: Partial<ShadowEntry>) => void
}) {
  const { all } = useShadowTokens()
  const name = entry.token
  const token = tokens.find((option) => option.name === name)
  // The tokens an entry offers are all of one kind, so they share a namespace: `shadow-`, `inset-shadow-`.
  const namespace = shadowNamespace(tokens[0]?.name ?? "") ?? ""

  const pick = (next: string | undefined) => {
    if (next === undefined) {
      detach(entry, all, onChange)
    } else if (next !== name) {
      onChange({ token: next, colorOverride: undefined })
    }
  }

  const read = (text: string): Reading<string | undefined> => {
    if (text.trim() === "") {
      return { value: name }
    }

    const named = tokenNamed(tokens, text, namespace)

    if (named) {
      return { value: named.name }
    }

    const example = tokens[0] ? `, such as ${tokens[0].name.slice(namespace.length)}` : ""

    return { reason: `Enter a token's name${example}` }
  }

  const step = (up: boolean, { shift }: ScrubKeys) => {
    if (token) {
      pick(stepToken(tokens, token, up, shift).name)
    }
  }

  return (
    <ValueField
      label="Shadow token"
      shown={undefined}
      placeholder="Custom"
      chip={
        name === undefined
          ? undefined
          : {
              name,
              token,
              namespace: shadowNamespace(name),
              overridden: entry.colorOverride !== undefined,
              onRemove: () => pick(undefined),
              // Its first layer's values become the shadow's own, to edit.
              onDetach: () => pick(undefined)
            }
      }
      status={{ missing: name !== undefined && !token ? <MissingMark name={name} /> : undefined }}
      tokens={{ list: tokens, current: name, none: "Custom", onPick: pick }}
      inputMode="text"
      read={read}
      onCommit={pick}
      onStep={step}
    />
  )
}

/** A token's own layers written as the entry's values, so every part can be edited. */
function detach(entry: ShadowEntry, tokens: ShadowToken[], onChange: (change: Partial<ShadowEntry>) => void) {
  const [first] = layersOf(entry, tokens)
  onChange({ token: undefined, colorOverride: undefined, layer: first ?? entry.layer })
}

/**
 * A composite token's parts (design-options-values.md, Composite token). Its color is a row of its own, which can be
 * overridden on the layer, shown in the override color with a reset arrow and a dot on the chip. Its layers fold under
 * a disclosure in the token's color, as a table of their offsets, blur and spread; those can't be changed in Tailwind,
 * so Detach, in the token field's list, makes them the entry's own.
 */
function TokenParts({
  entry,
  tokensOnly,
  spread,
  onChange
}: {
  entry: ShadowEntry
  tokensOnly: boolean
  spread: boolean
  onChange: (change: Partial<ShadowEntry>) => void
}) {
  const [open, setOpen] = useState(true)
  const token = useShadowTokens().all.find((option) => option.name === entry.token)
  const own = token?.layers[0] ?? entry.layer
  const color: ListColor = entry.colorOverride ?? { color: own.color, alpha: own.alpha }
  const overridden = entry.colorOverride !== undefined

  const layers = token?.layers ?? [entry.layer]
  const columns = spread ? ["X", "Y", "Blur", "Spread"] : ["X", "Y", "Blur"]
  const cell = "px-1 py-0.5 text-right font-normal"

  return (
    <>
      <Field
        label="Color"
        overrides={overridden ? entry.token : undefined}
        onReset={() => onChange({ colorOverride: undefined })}
      >
        <ColorInput
          label="Shadow color"
          value={color.color}
          alpha={color.alpha}
          tokensOnly={tokensOnly}
          used={usedColors}
          onChange={(next, alpha) =>
            onChange({ colorOverride: next === undefined ? undefined : { color: next, alpha } })
          }
        />
      </Field>
      <Collapsible open={open} onOpenChange={setOpen} className="col-span-2 flex min-w-0 flex-col gap-1">
        <CollapsibleTrigger className="flex h-5 items-center gap-1 self-start rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          {`${layers.length} ${layers.length === 1 ? "layer" : "layers"} in ${entry.token}`}
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-1.5 border-l-2 pl-2" style={{ borderColor: "var(--primary)" }}>
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="py-0.5 text-left font-normal">
                  <span className="sr-only">Layer</span>
                </th>
                {columns.map((column) => (
                  <th key={column} scope="col" className={cell}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {layers.map((part, index) => (
                <tr key={index}>
                  <th scope="row" className="py-0.5 text-left font-normal">{`Layer ${index + 1}`}</th>
                  {layerNumbers(part, spread)
                    .split(" ")
                    .map((number, at) => (
                      <td key={columns[at]} className={cell}>
                        {number}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
          <MessageLine
            message={{
              tone: "note",
              text: "Only a shadow token's color can be changed. To edit the rest, detach it."
            }}
          />
        </CollapsibleContent>
      </Collapsible>
    </>
  )
}

/** The card drawn with the shadows, and a line of text for a text shadow. */
export function ShadowPreview({
  entries,
  onText = false,
  filled = true
}: {
  entries: ShadowEntry[]
  onText?: boolean
  /** Whether the layer has a fill; a text layer without one shows only its letters. */
  filled?: boolean
}) {
  const { tokens: colors } = useTokens("color")
  const { all } = useShadowTokens()
  const draw = (value: ListColor) => drawListColor(value, colors)
  const drawing = shadowDrawing(entries, draw, all)

  const boxShadow = onText
    ? shadowDrawing(
        entries.filter((entry) => entry.kind !== "drop"),
        draw,
        all
      ).boxShadow
    : drawing.boxShadow

  return (
    <Card
      style={{
        borderRadius: 12,
        fontWeight: 600,
        fontSize: onText ? 30 : undefined,
        lineHeight: onText ? "36px" : undefined,
        background: filled ? "white" : undefined,
        boxShadow: boxShadow || undefined,
        filter: drawing.dropShadow || undefined,
        textShadow: onText ? drawing.textShadow || undefined : undefined
      }}
    />
  )
}
