import { Button, DropdownMenuItem, Tabs, TabsContent, TabsList, TabsTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { unclosedInValue } from "@parity-app/tokens"
import { Braces, ListOrdered, Plus, SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { GroupLabel, PanelSection } from "../../chrome/PanelSection.tsx"
import { BlurChoice } from "./controls.tsx"
import { isLengthToken, type Length } from "./data.ts"
import {
  MessageLine,
  type Reading,
  TokenChip,
  TokenList,
  TokenMark,
  useTokens,
  useTokenSets,
  ValueField
} from "./field-parts.tsx"
import { TitleMenu } from "./field-row.tsx"
import { CenteredSlider, entryList, ListRow } from "./list-parts.tsx"
import {
  type AdjustmentKey,
  adjustmentFunctions,
  adjustments,
  type Adjustments,
  colorWords,
  drawListColor,
  type FilterEntry,
  filterOrder,
  imagePreview,
  isBehind,
  layerNumbers,
  type ListColor,
  newId
} from "./lists-data.ts"
import { adjustmentWrites, filterDrawing } from "./lists-writes.ts"
import { angleUnits, splitUnit } from "./motion-data.ts"
import { Card } from "./preview-card.tsx"
import { ShadowCard, ShadowEditor } from "./shadow-list.tsx"
import { optionNamed } from "./typing.ts"

/*
 * The filter list (design-options-values.md, Filter list): `filter` in Effects, and `backdrop-filter` behind the layer.
 * Layer blur, Background blur and a Drop shadow that follows the shape are entries of their own, and Adjustments is one
 * entry of sliders, so it isn't reordered: they're written in Tailwind's filter order whatever the panel shows. A
 * filter read from code in another order, or with a function twice, is one Custom entry, edited as text, with Put in
 * order where that doesn't change what's drawn.
 */

type Addable = "blur" | "backdropBlur" | "adjust" | "adjustBehind" | "dropShadow"

const addNames: Record<Addable, string> = {
  blur: "Layer blur",
  adjust: "Adjustments",
  dropShadow: "Drop shadow",
  backdropBlur: "Background blur",
  adjustBehind: "Background adjustments"
}

const addables: readonly Addable[] = ["blur", "adjust", "dropShadow", "backdropBlur", "adjustBehind"]

/** The kind an entry is added as, so + offers each once. */
function addableOf(entry: FilterEntry): Addable | undefined {
  if (entry.kind === "adjust") {
    return entry.behind ? "adjustBehind" : "adjust"
  }

  if (entry.kind === "custom") {
    return undefined
  }

  return entry.kind
}

/** Tailwind's order, which the list shows each property's entries in: blur, adjustments, then the drop shadow. */
const order = (entry: FilterEntry) => ({ custom: 0, blur: 1, backdropBlur: 1, adjust: 2, dropShadow: 3 })[entry.kind]

function newEntry(kind: Addable): FilterEntry {
  const id = newId("filter")

  if (kind === "blur" || kind === "backdropBlur") {
    return { id, kind, value: kind === "blur" ? "blur-sm" : "blur-md" }
  }

  if (kind === "dropShadow") {
    return {
      id,
      kind,
      shadow: {
        id: newId("shadow"),
        kind: "drop",
        follow: true,
        token: "drop-shadow-md",
        layer: { x: 0, y: 4, blur: 6, spread: 0, color: "black", alpha: 15 }
      }
    }
  }

  return { id, kind: "adjust", behind: kind === "adjustBehind", values: {} }
}

export function FilterList({
  entries,
  onChange,
  tokensOnly = false,
  title = "Effects",
  dropShadows = true,
  openId
}: {
  entries: FilterEntry[]
  onChange: (entries: FilterEntry[]) => void
  tokensOnly?: boolean
  /** Its title: Filters under the Shadow list, which the Design tab's Effects section opens with. */
  title?: string
  /** Whether + offers a drop shadow, which the Shadow list beside it adds instead. */
  dropShadows?: boolean
  /** The entry whose editor is open at first, for a story. */
  openId?: string
}) {
  const taken = new Set(entries.map(addableOf))
  // An entry's change is the whole entry, since a kind's fields differ.
  const set = (id: string, entry: FilterEntry) => onChange(entries.map((other) => (other.id === id ? entry : other)))
  const { remove } = entryList(entries, onChange)

  // A group with no rows doesn't show.
  const groups = [
    { title: "On the layer", rows: entries.filter((entry) => !isBehind(entry)).sort((a, b) => order(a) - order(b)) },
    { title: "Behind the layer", rows: entries.filter(isBehind).sort((a, b) => order(a) - order(b)) }
  ].filter(({ rows }) => rows.length > 0)

  return (
    <PanelSection
      title={title}
      action={
        <TitleMenu label="Add an effect" icon={<Plus className="size-4" />} hinted menuClassName="w-52">
          {addables
            .flatMap((kind) => (kind === "dropShadow" && !dropShadows ? [] : [kind]))
            .map((kind) => (
              <DropdownMenuItem
                key={kind}
                className="text-xs"
                disabled={taken.has(kind)}
                onClick={() => onChange([...entries, newEntry(kind)])}
              >
                {addNames[kind]}
              </DropdownMenuItem>
            ))}
        </TitleMenu>
      }
    >
      {entries.length > 0 && (
        <div className="flex flex-col gap-1">
          {groups.map(({ title, rows }) => (
            <div key={title} className="flex flex-col gap-1">
              <GroupLabel>{title}</GroupLabel>
              {rows.map((entry) => (
                <FilterRow
                  key={entry.id}
                  entry={entry}
                  tokensOnly={tokensOnly}
                  startOpen={entry.id === openId}
                  onChange={(next) => set(entry.id, next)}
                  onReplace={(next) => onChange([...entries.filter((other) => other.id !== entry.id), ...next])}
                  onRemove={() => remove(entry.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  )
}

function FilterRow({
  entry,
  tokensOnly,
  startOpen,
  onChange,
  onReplace,
  onRemove
}: {
  entry: FilterEntry
  tokensOnly: boolean
  startOpen: boolean
  onChange: (entry: FilterEntry) => void
  onReplace: (entries: FilterEntry[]) => void
  onRemove: () => void
}) {
  const { tokens: blurs } = useTokens("blur")
  const { tokens: dropShadows } = useTokens("dropShadow")
  // A blur's popover is its tokens, and picking one closes it, as a menu does.
  const [blurOpen, setBlurOpen] = useState(startOpen)

  const row = {
    group: "filters",
    off: entry.off,
    onToggle: () => onChange({ ...entry, off: !entry.off }),
    onRemove
  }

  if (entry.kind === "blur" || entry.kind === "backdropBlur") {
    const label = entry.kind === "blur" ? "Layer blur" : "Background blur"
    const named = entry.value !== undefined && isLengthToken(entry.value)
    const token = named ? blurs.find((other) => other.name === entry.value) : undefined
    let drawn: string | undefined = token?.value

    if (entry.value !== undefined && !isLengthToken(entry.value)) {
      drawn = `${entry.value.px}px`
    }

    return (
      <ListRow
        {...row}
        name={label}
        preview={<TokenMark kind="blur" value={drawn ?? "0px"} />}
        title={label}
        details={{
          content: (
            <BlurTokens
              label={label}
              value={entry.value}
              tokensOnly={tokensOnly}
              onPick={(value) => {
                onChange({ ...entry, value })
                setBlurOpen(false)
              }}
              onChange={(value) => onChange({ ...entry, value })}
            />
          ),
          open: blurOpen,
          onOpenChange: setBlurOpen,
          className: "w-60 p-0"
        }}
      >
        {entry.value !== undefined && isLengthToken(entry.value) ? (
          <span className="flex min-w-0 text-foreground">
            <TokenChip name={entry.value} token={token} namespace="blur-" preview={null} struck={!token} />
          </span>
        ) : (
          <span className="truncate">{drawn}</span>
        )}
      </ListRow>
    )
  }

  if (entry.kind === "adjust") {
    const label = entry.behind ? "Background adjustments" : "Adjustments"
    const words = adjustmentWords(entry.values)

    return (
      <ListRow
        {...row}
        name={label}
        preview={
          <span className="grid size-5 place-items-center text-muted-foreground">
            <SlidersHorizontal className="size-3.5" />
          </span>
        }
        details={{
          content: (
            <AdjustmentsEditor
              values={entry.values}
              behind={entry.behind ?? false}
              onChange={(values) => onChange({ ...entry, values })}
            />
          ),
          defaultOpen: startOpen,
          className: "w-72 p-3"
        }}
        title={label}
      >
        <span className="truncate">{words}</span>
      </ListRow>
    )
  }

  if (entry.kind === "dropShadow") {
    const { shadow } = entry
    const token = dropShadows.find((option) => option.name === shadow.token)

    return (
      <ListRow
        {...row}
        name="Drop shadow"
        preview={<ShadowCard entry={shadow} />}
        details={{
          content: (
            <ShadowEditor
              entry={shadow}
              tokensOnly={tokensOnly}
              inFilter
              onChange={(change) => onChange({ ...entry, shadow: { ...shadow, ...change } })}
            />
          ),
          defaultOpen: startOpen,
          className: "w-72 p-3"
        }}
        title="Drop shadow"
      >
        {shadow.token === undefined ? (
          <span className="truncate">{`${layerNumbers(shadow.layer, false)} ${colorWords(shadow.layer)}`}</span>
        ) : (
          <span className="flex min-w-0 text-foreground">
            <TokenChip
              name={shadow.token}
              token={token}
              namespace="drop-shadow-"
              preview={null}
              struck={!token}
              overridden={shadow.colorOverride !== undefined}
            />
          </span>
        )}
      </ListRow>
    )
  }

  return (
    <ListRow {...row} name="Custom filter">
      <CustomEntry entry={entry} onChange={onChange} onReplace={onReplace} />
    </ListRow>
  )
}

const blurTabs = ["tokens", "custom"] as const

/**
 * A blur's popover, laid out as the color picker's is: Tokens first, None and the blur scale, each drawn with its
 * preview, so the row opens straight onto them and one click picks one; Custom holds the blur field, for a value of
 * the layer's own, typed or scrubbed. It opens on Custom where the blur is already one of its own.
 */
function BlurTokens({
  label,
  value,
  tokensOnly,
  onPick,
  onChange
}: {
  label: string
  value: Length | undefined
  tokensOnly: boolean
  /** A token or None picked from the list, which closes the popover. */
  onPick: (value: Length | undefined) => void
  onChange: (value: Length | undefined) => void
}) {
  const { tokens } = useTokens("blur")
  const own = value !== undefined && !isLengthToken(value)
  const [tab, setTab] = useState<(typeof blurTabs)[number]>(own ? "custom" : "tokens")

  const list = (
    <TokenList
      label={label}
      tokens={tokens}
      current={value !== undefined && isLengthToken(value) ? value : undefined}
      none="None"
      noneValue="0px"
      own={own}
      onPick={onPick}
    />
  )

  // Locked to tokens, it's only the tokens: no tabs, and no Custom to type a length of its own in.
  if (tokensOnly) {
    return <div className="p-1">{list}</div>
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        const picked = optionNamed(blurTabs, next)

        if (picked) {
          setTab(picked)
        }
      }}
    >
      <TabsList className="m-2 mb-0 w-[calc(100%-1rem)]">
        <TabsTrigger value="tokens" className="text-xs">
          Tokens
        </TabsTrigger>
        <TabsTrigger value="custom" className="text-xs">
          Custom
        </TabsTrigger>
      </TabsList>
      <TabsContent value="tokens" className="p-1">
        {list}
      </TabsContent>
      <TabsContent value="custom" className="p-2">
        <BlurChoice label={label} value={value} onChange={onChange} />
      </TabsContent>
    </Tabs>
  )
}

/** Each adjustment set, in words: `Brightness +25, Saturation −10`. */
function adjustmentWords(values: Adjustments): string {
  const set = adjustments.filter((adjustment) => (values[adjustment.key] ?? 0) !== 0)

  if (set.length === 0) {
    return "No change"
  }

  return set
    .map((adjustment) => {
      const value = values[adjustment.key]!
      const signed = adjustment.min < 0 && value > 0 ? `+${value}` : String(value).replace("-", "−")

      return `${adjustment.label} ${signed}${adjustment.unit}`
    })
    .join(", ")
}

/**
 * The sliders: brightness, contrast and saturation centered on no change from −100 to 100, hue from −180° to 180°, then
 * grayscale, sepia and invert from 0 to 100. Each slider's hint names the class it writes; one at no change writes
 * nothing. On an image, Image's Adjustments shows the first four (`only`).
 */
export function AdjustmentsEditor({
  values,
  behind = false,
  only,
  onChange
}: {
  values: Adjustments
  behind?: boolean
  only?: AdjustmentKey[]
  onChange: (values: Adjustments) => void
}) {
  const shown = adjustments.filter((adjustment) => only === undefined || only.includes(adjustment.key))

  return (
    <div className="flex flex-col gap-2">
      {behind && (
        <p className="type-description text-muted-foreground">
          {"Brightness, contrast and saturation of what's behind"}
        </p>
      )}
      {shown.map((adjustment) => {
        const value = values[adjustment.key] ?? 0

        return (
          <CenteredSlider
            key={adjustment.key}
            label={adjustment.label}
            value={value}
            min={adjustment.min}
            max={adjustment.max}
            unit={adjustment.unit}
            hint={`${behind ? "backdrop-" : ""}${adjustmentWrites(adjustment.key, value).className}`}
            onChange={(next) => onChange({ ...values, [adjustment.key]: next === 0 ? undefined : next })}
          />
        )
      })}
    </div>
  )
}

/** The functions a filter is written with: `contrast(1.2) blur(4px)` is contrast and blur, with their arguments. */
function functionsOf(text: string): { name: string; args: string }[] | undefined {
  const found: { name: string; args: string }[] = []
  let rest = text.trim()

  while (rest.length > 0) {
    const name = /^([a-z-]+)\(/.exec(rest)?.[1]

    if (!name) {
      return undefined
    }

    let depth = 0
    let end = name.length

    for (; end < rest.length; end++) {
      if (rest[end] === "(") {
        depth++
      }

      if (rest[end] === ")") {
        depth--
      }

      if (depth === 0) {
        break
      }
    }

    if (depth !== 0) {
      return undefined
    }

    found.push({ name, args: rest.slice(name.length + 1, end).trim() })
    rest = rest.slice(end + 1).trim()
  }

  return found
}

/** Each filter function's adjustment: `hue-rotate()` is Hue. */
const adjustmentFor: Readonly<Record<string, AdjustmentKey>> = Object.fromEntries(
  adjustments.map((adjustment) => [adjustmentFunctions[adjustment.key], adjustment.key])
)

/** A function's amount as a percentage: `1.25` and `125%` are both 125. */
const percentOf = (args: string) => {
  const number = Number.parseFloat(args)

  return args.trim().endsWith("%") ? number : number * 100
}

/**
 * The entries a Custom filter becomes when put in Tailwind's order, or why it stays as text. Only blur can move, since
 * blurring and then adjusting colors draws what adjusting and then blurring does; the color adjustments and a drop
 * shadow don't commute, so they must already be in Tailwind's order.
 */
export function putInOrder(text: string, behind: boolean): { entries: FilterEntry[] } | { reason: string } {
  const functions = functionsOf(text)

  if (!functions) {
    return { reason: "This isn't a valid list of filters" }
  }

  const names = functions.map((part) => part.name)
  const twice = names.find((name, index) => names.indexOf(name) !== index)

  if (twice) {
    return { reason: `${twice}() is used more than once` }
  }

  if (names.includes("drop-shadow")) {
    return { reason: "A drop shadow in a custom filter is kept as text" }
  }

  const unknown = names.find((name) => name !== "blur" && !(name in adjustmentFor))

  if (unknown) {
    return { reason: `${unknown}() has no slider` }
  }

  const colors = names.filter((name) => name !== "blur")
  const tailwindOrder = filterOrder.map((key) => adjustmentFunctions[key])
  const sorted = [...colors].sort((a, b) => tailwindOrder.indexOf(a) - tailwindOrder.indexOf(b))
  const outOfPlace = colors.findIndex((name, index) => name !== sorted[index])

  if (outOfPlace >= 0) {
    return {
      reason: `Reordering these filters would change the result, so they're kept as text`
    }
  }

  const entries: FilterEntry[] = []
  const values: Adjustments = {}

  for (const part of functions) {
    if (part.name === "blur") {
      const px = Number.parseFloat(part.args)

      if (!part.args.endsWith("px") || !Number.isFinite(px)) {
        return { reason: `blur(${part.args}) isn't in px` }
      }

      entries.push({ id: newId("filter"), kind: behind ? "backdropBlur" : "blur", value: { px } })
      continue
    }

    const key = adjustmentFor[part.name]!
    const adjustment = adjustments.find((option) => option.key === key)!
    let value: number

    if (key === "hue") {
      // An angle in any of CSS's angle units, as degrees.
      const split = splitUnit(part.args)
      const perUnit = split && angleUnits[split.unit || "deg"]

      if (!split || perUnit === undefined) {
        return { reason: `hue-rotate(${part.args}) isn't an angle` }
      }

      value = split.number * perUnit
    } else if (key === "brightness" || key === "contrast" || key === "saturate") {
      value = percentOf(part.args) - 100
    } else {
      value = percentOf(part.args)
    }

    value = Math.round(value)

    if (value < adjustment.min || value > adjustment.max) {
      return { reason: `${part.name}(${part.args}) is past the slider's end` }
    }

    values[key] = value
  }

  if (Object.keys(values).length > 0) {
    entries.push({ id: newId("filter"), kind: "adjust", behind, values })
  }

  return { entries }
}

/**
 * Custom: a filter read from code, kept as text, on the shared field. What's typed is checked as CSS checks it
 * (`CSS.supports`), and for a bracket or quote left open, which the browser would close on its own. Put in order
 * writes it as utilities where that draws the same.
 */
function CustomEntry({
  entry,
  onChange,
  onReplace
}: {
  entry: Extract<FilterEntry, { kind: "custom" }>
  onChange: (entry: FilterEntry) => void
  onReplace: (entries: FilterEntry[]) => void
}) {
  const property = entry.behind ? "backdrop-filter" : "filter"

  const read = (text: string): Reading<string> => {
    const trimmed = text.trim()

    if (trimmed === "") {
      return { reason: `${property} can't be empty` }
    }

    const open = unclosedInValue(trimmed)

    if (open) {
      return { reason: open }
    }

    if (!CSS.supports(property, trimmed)) {
      return { reason: `${property} can't be ${trimmed}` }
    }

    return { value: trimmed }
  }

  const ordered = putInOrder(entry.text, entry.behind ?? false)

  return (
    <div className="grid min-w-0 flex-1 gap-1">
      <ValueField
        label="Custom filter"
        inner={
          <Hint
            label="Custom"
            detail="Read from code in an order Tailwind's utilities can't write, so it's kept as text"
          >
            <Braces aria-label="Custom" className="size-3.5 shrink-0 text-muted-foreground" />
          </Hint>
        }
        shown={entry.text}
        inputMode="text"
        inputClassName="font-mono"
        read={read}
        onCommit={(text) => onChange({ ...entry, text })}
      />
      {"entries" in ordered ? (
        <Hint label="Put in order" detail="Writes it as Tailwind's utilities. It draws the same, since only blur moves">
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 justify-self-start px-1.5 text-xs"
            onClick={() => onReplace(ordered.entries)}
          >
            <ListOrdered className="size-3.5" /> Put in order
          </Button>
        </Hint>
      ) : (
        <MessageLine message={{ tone: "note", text: `${ordered.reason}.` }} />
      )}
    </div>
  )
}

/**
 * A translucent card with a picture on it: the layer's filter changes the card and its picture, and the backdrop
 * filter what shows through it.
 */
export function FilterPreview({ entries }: { entries: FilterEntry[] }) {
  const { color, blur, dropShadow } = useTokenSets()
  const drawing = filterDrawing(entries, (value: ListColor) => drawListColor(value, color), { blur, dropShadow })

  return (
    <Card
      style={{
        alignContent: "center",
        gap: 8,
        borderRadius: 12,
        boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.4)",
        background: "rgb(255 255 255 / 0.35)",
        filter: drawing.filter,
        backdropFilter: drawing.backdropFilter
      }}
    >
      <span
        aria-hidden
        className="block h-12 w-32 rounded-md bg-cover bg-center"
        style={{ backgroundImage: `url("${imagePreview("/images/hero.jpg") ?? ""}")` }}
      />
      Plans
    </Card>
  )
}
