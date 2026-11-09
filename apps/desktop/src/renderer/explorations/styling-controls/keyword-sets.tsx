import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Toggle
} from "@buildkitgg/shadcn-baseui-kit"
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ChevronDown, Crop, Ellipsis } from "lucide-react"
import { type ReactNode, useState } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { fieldBox, NotBaseline, NotBaselineMark, type Reading, TokenMark, ValueField } from "./field-parts.tsx"
import type { KeywordOption, KeywordValue } from "./text-writes.ts"
import { cursorTokens } from "./tokens.ts"

/*
 * Keyword sets (PAR-186, design-options-values.md's Keyword sets): icon toggles or a menu, each option's hint naming
 * the CSS it writes. Unset, the option the layer inherits or starts with shows faintly; setting one presses it fully.
 * Mixed presses none. A keyword outside the set, read from code, is a text chip marked Custom, edited as text and never
 * snapped to the set.
 */

/** One option of a set: what it's called, how it's drawn, and what it writes. */
export interface KeywordChoice extends KeywordOption {
  label: string
  icon?: ReactNode
  /** Browsers that draw it, when it isn't Baseline. */
  browsers?: string
  /** Listed under the menu's More, as Stroke's Groove, Ridge, Inset and Outset are. */
  more?: boolean
  /** What a token comes to, shown where the other options show the value they write. */
  comesTo?: string
}

/** Keywords every field takes, shown in words. */
const globalKeywords: Record<string, string> = {
  inherit: "Inherit",
  initial: "Initial",
  unset: "Unset",
  revert: "Revert"
}

/**
 * A keyword outside the set, read from code or typed from the menu: a ValueField marked Custom, edited as text and
 * checked with `CSS.supports`. A keyword every field takes (`inherit`) shows in words, its CSS in the hint, and is
 * typed over as written.
 */
function CustomKeyword({
  property,
  value,
  onChange
}: {
  property: string
  value: string
  onChange: (value: KeywordValue | undefined) => void
}) {
  const word = globalKeywords[value]
  return (
    <div className="min-w-32 flex-1">
      <ValueField
        label={`${property}, custom`}
        inner={
          word === undefined ? (
            <Hint label="Custom" detail="A value outside this set, kept as it was written">
              <span className="shrink-0 rounded bg-accent px-1 text-2xs text-muted-foreground">Custom</span>
            </Hint>
          ) : undefined
        }
        shown={word ?? value}
        editText={word === undefined ? undefined : value}
        hint={word === undefined ? undefined : { label: word, detail: `${property}: ${value}` }}
        inputMode="text"
        inputClassName={word === undefined ? "font-mono" : ""}
        read={(text): Reading<string> => {
          const trimmed = text.trim()
          if (trimmed === "") return { reason: `Enter a value for ${property}, or choose one` }
          if (!CSS.supports(property, trimmed)) return { reason: `${property} can't be ${trimmed}` }
          return { value: trimmed }
        }}
        onCommit={(next) => onChange({ custom: next })}
      />
    </div>
  )
}

/** The ⋯ menu after a set: Inherit where the property inherits, a custom value, and Unset once it's set. */
function SetMenu({
  label,
  inherits,
  set,
  inheritedLabel,
  onInherit,
  onCustom,
  onUnset
}: {
  label: string
  inherits: boolean
  set: boolean
  inheritedLabel: string
  onInherit: () => void
  onCustom: () => void
  onUnset: () => void
}) {
  return (
    <DropdownMenu>
      <Hint label={`More ${label.toLowerCase()} options`}>
        <DropdownMenuTrigger
          aria-label={`More ${label.toLowerCase()} options`}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent"
        >
          <Ellipsis className="size-3.5" />
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-56">
        {inherits && (
          <DropdownMenuItem className="text-xs" onClick={onInherit}>
            Inherit
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-xs" onClick={onCustom}>
          Custom value
        </DropdownMenuItem>
        {set && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onClick={onUnset}>
              Unset, back to {inheritedLabel}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Icon toggles for a keyword set, as text Align and Case are. Unset, the inherited option is pressed faintly; Mixed
 * presses none and says Mixed. A custom keyword shows as its chip after them.
 */
export function KeywordToggles({
  label,
  property,
  choices,
  value,
  inherited,
  inheritedFrom,
  mixed = false,
  inherits = false,
  onChange
}: {
  label: string
  property: string
  choices: readonly KeywordChoice[]
  value: KeywordValue | undefined
  /** The option the layer has while unset. */
  inherited: string
  /** Where it's inherited from, for the hint (Plans). */
  inheritedFrom?: string
  mixed?: boolean
  inherits?: boolean
  onChange: (value: KeywordValue | undefined) => void
}) {
  const [editingCustom, setEditingCustom] = useState(false)
  const custom = value !== undefined && "custom" in value ? value.custom : undefined
  const inheritedChoice = choices.find((choice) => choice.value === inherited)
  const showMixed = mixed && value === undefined
  return (
    <div className="flex flex-wrap items-center gap-1">
      <fieldset aria-label={label} className="m-0 flex h-7 items-center gap-px rounded-md border p-0.5">
        {choices.map((choice) => {
          const pressed = value !== undefined && "option" in value && value.option === choice.value
          const faint = value === undefined && !showMixed && choice.value === inherited
          let look = "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          if (pressed) look = "bg-accent text-foreground shadow-xs"
          if (faint) look = "bg-accent/40 text-muted-foreground"
          const detail = [
            choice.css,
            faint ? `Unset: ${inheritedFrom ? `inherited from ${inheritedFrom}` : "the starting value"}` : undefined,
            choice.browsers ? `Not Baseline: only ${choice.browsers} draws it` : undefined
          ]
            .filter(Boolean)
            .join("\n")
          return (
            <Hint key={choice.value} label={choice.label} detail={detail}>
              <button
                type="button"
                aria-label={choice.label}
                aria-pressed={pressed}
                onClick={() => {
                  setEditingCustom(false)
                  onChange({ option: choice.value })
                }}
                className={`relative grid h-full min-w-6 place-items-center rounded-sm px-1 text-xs ${look}`}
              >
                {choice.icon ?? choice.label}
                {choice.browsers && <NotBaselineMark className="absolute -top-0.5 right-0 text-2xs leading-none" />}
              </button>
            </Hint>
          )
        })}
      </fieldset>
      {showMixed && <span className="text-xs text-muted-foreground">Mixed</span>}
      {(custom !== undefined || editingCustom) && (
        <CustomKeyword
          property={property}
          value={custom ?? ""}
          onChange={(next) => {
            setEditingCustom(false)
            onChange(next)
          }}
        />
      )}
      {value !== undefined &&
        "option" in value &&
        choices.find((choice) => choice.value === value.option)?.browsers && (
          <NotBaseline
            what={choices.find((choice) => choice.value === value.option)!.label}
            browsers={choices.find((choice) => choice.value === value.option)!.browsers}
          />
        )}
      <SetMenu
        label={label}
        inherits={inherits}
        set={value !== undefined}
        inheritedLabel={inheritedChoice?.label ?? inherited}
        onInherit={() => onChange({ custom: "inherit" })}
        onCustom={() => setEditingCustom(true)}
        onUnset={() => {
          setEditingCustom(false)
          onChange(undefined)
        }}
      />
    </div>
  )
}

/**
 * A menu for a keyword set, as Wrap, Cursor and Stroke's Style are: its trigger shows the option, or what the layer has
 * while unset, muted. Each option shows its CSS keyword and is previewed on the canvas while hovered or highlighted.
 * Tokens come first where the set has them; More holds the rarer options.
 */
export function KeywordMenu({
  label,
  property,
  choices,
  value,
  placeholder,
  mixed = false,
  inherits = false,
  moreLabel = "More",
  draw,
  onChange,
  onPreview
}: {
  label: string
  property: string
  choices: readonly KeywordChoice[]
  value: KeywordValue | undefined
  /** What the layer has while unset (Auto, Solid), shown muted. */
  placeholder: string
  mixed?: boolean
  inherits?: boolean
  moreLabel?: string
  /** Draws an option where words alone don't show it, as a stroke's dash or a cursor. */
  draw?: (choice: KeywordChoice) => ReactNode
  onChange: (value: KeywordValue | undefined) => void
  onPreview?: (value: string | undefined) => void
}) {
  const [editingCustom, setEditingCustom] = useState(false)
  const custom = value !== undefined && "custom" in value ? value.custom : undefined
  const chosen = value !== undefined && "option" in value ? choices.find((c) => c.value === value.option) : undefined
  let shown = chosen?.label ?? placeholder
  if (mixed && value === undefined) shown = "Mixed"
  const tokens = choices.filter((choice) => choice.token)
  const main = choices.filter((choice) => !choice.token && !choice.more)
  const more = choices.filter((choice) => choice.more)
  const radioValue = chosen?.value ?? ""
  const item = (choice: KeywordChoice) => (
    <DropdownMenuRadioItem
      key={choice.value}
      value={choice.value}
      className="text-xs"
      onPointerEnter={() => onPreview?.(choice.value)}
      onFocus={() => onPreview?.(choice.value)}
    >
      {draw?.(choice)}
      <span className="min-w-0 flex-1 truncate">{choice.label}</span>
      {choice.browsers && <NotBaseline what={choice.label} browsers={choice.browsers} />}
      <span className="shrink-0 font-mono text-2xs whitespace-nowrap text-muted-foreground">
        {choice.comesTo ?? (choice.token ? `--${property}-${choice.value}` : choice.css.split(": ")[1])}
      </span>
    </DropdownMenuRadioItem>
  )
  const pick = (next: string) => {
    setEditingCustom(false)
    onChange({ option: next })
  }
  const showCustom = custom !== undefined || editingCustom
  return (
    <div className="flex items-start gap-1">
      {showCustom && (
        <CustomKeyword
          property={property}
          value={custom ?? ""}
          onChange={(next) => {
            setEditingCustom(false)
            onChange(next)
          }}
        />
      )}
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) onPreview?.(undefined)
        }}
      >
        <Hint label={`${label}: ${shown}`} detail={chosen ? chosen.css : `Unset: ${placeholder}`} wait>
          <DropdownMenuTrigger
            aria-label={`${label}: ${showCustom ? "Custom" : shown}`}
            className={`${fieldBox(false, `${showCustom ? "w-7 justify-center" : "flex-1 justify-between"} pr-1 outline-none`)} data-popup-open:ring-2 data-popup-open:ring-ring`}
          >
            {!showCustom && (
              <span className={`flex min-w-0 items-center gap-1.5 ${chosen ? "" : "text-muted-foreground"}`}>
                {chosen && draw?.(chosen)}
                <span className="truncate">{shown}</span>
                {chosen?.browsers && <NotBaseline what={chosen.label} browsers={chosen.browsers} />}
              </span>
            )}
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
        </Hint>
        <DropdownMenuContent align="end" className="w-64">
          {tokens.length > 0 && (
            <>
              <DropdownMenuRadioGroup value={radioValue} onValueChange={(next) => pick(next as string)}>
                <DropdownMenuLabel>Tokens</DropdownMenuLabel>
                {tokens.map(item)}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuRadioGroup value={radioValue} onValueChange={(next) => pick(next as string)}>
            {main.map(item)}
          </DropdownMenuRadioGroup>
          {more.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">{moreLabel}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuRadioGroup value={radioValue} onValueChange={(next) => pick(next as string)}>
                  {more.map(item)}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          {inherits && (
            <DropdownMenuItem className="text-xs" onClick={() => onChange({ custom: "inherit" })}>
              Inherit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-xs" onClick={() => setEditingCustom(true)}>
            Custom value
          </DropdownMenuItem>
          {value !== undefined && (
            <DropdownMenuItem
              className="text-xs"
              onClick={() => {
                setEditingCustom(false)
                onChange(undefined)
              }}
            >
              Unset, back to {placeholder}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Text's Align: Left and Right in a left-to-right layer, written as start and end so they follow the direction. */
export const alignChoices: KeywordChoice[] = [
  {
    value: "start",
    label: "Left",
    icon: <AlignLeft className="size-3.5" />,
    css: "text-align: start",
    tailwind: "text-start"
  },
  {
    value: "center",
    label: "Center",
    icon: <AlignCenter className="size-3.5" />,
    css: "text-align: center",
    tailwind: "text-center"
  },
  {
    value: "end",
    label: "Right",
    icon: <AlignRight className="size-3.5" />,
    css: "text-align: end",
    tailwind: "text-end"
  },
  {
    value: "justify",
    label: "Justify",
    icon: <AlignJustify className="size-3.5" />,
    css: "text-align: justify",
    tailwind: "text-justify"
  }
]

/** Text's Case, Small caps included, which is `font-variant-caps` rather than `text-transform`. */
export const caseChoices: KeywordChoice[] = [
  { value: "none", label: "As typed", icon: "—", css: "text-transform: none", tailwind: "normal-case" },
  { value: "uppercase", label: "Uppercase", icon: "AG", css: "text-transform: uppercase", tailwind: "uppercase" },
  { value: "lowercase", label: "Lowercase", icon: "ag", css: "text-transform: lowercase", tailwind: "lowercase" },
  { value: "capitalize", label: "Title case", icon: "Ag", css: "text-transform: capitalize", tailwind: "capitalize" },
  { value: "small-caps", label: "Small caps", icon: "Aɢ", css: "font-variant-caps: small-caps" }
]

/** Text's Wrap; Pretty isn't Baseline. */
export const wrapChoices: KeywordChoice[] = [
  { value: "wrap", label: "Wrap", css: "text-wrap: wrap", tailwind: "text-wrap" },
  { value: "balance", label: "Balance", css: "text-wrap: balance", tailwind: "text-balance" },
  {
    value: "pretty",
    label: "Pretty",
    css: "text-wrap: pretty",
    tailwind: "text-pretty",
    browsers: "Chromium and Safari"
  },
  { value: "nowrap", label: "No wrap", css: "text-wrap: nowrap", tailwind: "text-nowrap" }
]

const cursor = (value: string, label: string): KeywordChoice => ({
  value,
  label,
  css: `cursor: ${value}`,
  tailwind: `cursor-${value}`
})

const cursorTokenValue = (name: string) => cursorTokens.find((token) => token.name === `cursor-${name}`)?.value

/**
 * Interaction's Cursor: the project's cursor tokens, each with the cursor it comes to, then each cursor, drawn and
 * shown as the pointer on hover.
 */
export const cursorChoices: KeywordChoice[] = [
  {
    value: "interactive",
    label: "Interactive",
    css: "cursor: var(--cursor-interactive)",
    tailwind: "cursor-(--cursor-interactive)",
    token: true,
    comesTo: cursorTokenValue("interactive")
  },
  {
    value: "busy",
    label: "Busy",
    css: "cursor: var(--cursor-busy)",
    tailwind: "cursor-(--cursor-busy)",
    token: true,
    comesTo: cursorTokenValue("busy")
  },
  cursor("default", "Default"),
  cursor("pointer", "Pointer"),
  cursor("text", "Text"),
  cursor("move", "Move"),
  cursor("grab", "Grab"),
  cursor("grabbing", "Grabbing"),
  cursor("not-allowed", "Not allowed"),
  cursor("wait", "Wait"),
  cursor("progress", "Progress"),
  cursor("help", "Help"),
  cursor("crosshair", "Crosshair"),
  cursor("zoom-in", "Zoom in"),
  cursor("zoom-out", "Zoom out"),
  cursor("copy", "Copy"),
  cursor("ew-resize", "Resize left and right"),
  cursor("ns-resize", "Resize up and down"),
  cursor("none", "None")
]

/** The CSS cursor a cursor choice comes to, a token's included. */
export const cursorValue = (value: string): string =>
  cursorTokens.find((token) => token.name === `cursor-${value}`)?.value ?? value

/**
 * Draws a cursor option as the Tokens panel draws a cursor token (chrome's `TokenArt`), so a token and the cursor it
 * holds look the same, and shows that cursor while it's hovered.
 */
export function drawCursor(choice: KeywordChoice) {
  return <TokenMark kind="cursor" value={cursorValue(choice.value)} width={16} height={16} />
}

const strokeStyle = (value: string, label: string, more = false): KeywordChoice => ({
  value,
  label,
  more,
  css: `border-style: ${value}`,
  tailwind: more ? undefined : `border-${value}`
})

/** Stroke's Style; Groove, Ridge, Inset and Outset under More styles, with no Tailwind utility of their own. */
export const strokeStyleChoices: KeywordChoice[] = [
  strokeStyle("solid", "Solid"),
  strokeStyle("dashed", "Dashed"),
  strokeStyle("dotted", "Dotted"),
  strokeStyle("double", "Double"),
  strokeStyle("groove", "Groove", true),
  strokeStyle("ridge", "Ridge", true),
  strokeStyle("inset", "Inset", true),
  strokeStyle("outset", "Outset", true)
]

/** Draws a stroke style as a short line in it. */
export function drawStrokeStyle(choice: KeywordChoice) {
  const width = choice.value === "double" || choice.more ? 4 : 2
  return (
    <span
      aria-hidden
      className="block w-7 shrink-0"
      style={{ borderTop: `${width}px ${choice.value} ${choice.more ? "#a1a1a1" : "currentColor"}` }}
    />
  )
}

/** Clip content's modes: Clip doesn't make a scroll container, so a sticky layer inside still sticks. */
export const clipChoices: KeywordChoice[] = [
  { value: "clip", label: "Clip", css: "overflow: clip", tailwind: "overflow-clip" },
  { value: "scroll", label: "Scroll", css: "overflow: scroll", tailwind: "overflow-scroll" },
  { value: "auto", label: "Scroll when needed", css: "overflow: auto", tailwind: "overflow-auto" }
]

/**
 * Clip content: a toggle, and the menu beside it for how (Clip, Scroll, Scroll when needed). Off, the layer's content
 * shows outside it (Visible). Turning it on clips, written as `overflow: clip` rather than `hidden`.
 */
export function ClipContentField({
  value,
  mixed = false,
  onChange
}: {
  value: KeywordValue | undefined
  mixed?: boolean
  onChange: (value: KeywordValue | undefined) => void
}) {
  const on = value !== undefined
  return (
    <div className="flex items-start gap-1">
      <Hint
        label={on ? "Stop clipping content" : "Clip content"}
        detail={on ? undefined : "Unset: content shows outside the layer (visible)"}
      >
        <Toggle
          variant="outline"
          size="sm"
          className="h-7 px-2"
          aria-label="Clip content"
          pressed={on}
          onPressedChange={(pressed) => onChange(pressed ? { option: "clip" } : undefined)}
        >
          <Crop />
        </Toggle>
      </Hint>
      <div className="min-w-0 flex-1">
        <KeywordMenu
          label="Clip content"
          property="overflow"
          choices={clipChoices}
          value={value}
          placeholder="Visible"
          mixed={mixed}
          onChange={onChange}
        />
      </div>
    </div>
  )
}
