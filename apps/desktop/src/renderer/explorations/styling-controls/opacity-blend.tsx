import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, Contrast } from "lucide-react"
import { Fragment } from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { OffSystemMark } from "./color-picker.tsx"
import {
  fieldBox,
  fieldInput,
  formatNumber,
  InvalidMark,
  MessageLine,
  NotBaseline,
  readNumber,
  scrub,
  TokenChip,
  TokenMark,
  useTyped
} from "./field-parts.tsx"
import { type BlendMode, blendModes, opacityTokens } from "./text-data.ts"
import { onOpacityStep, type Opacity } from "./text-writes.ts"

/*
 * Appearance's Opacity and Blend mode row (PAR-186, design-options-values.md's Percentage and opacity): a percentage
 * with opacity tokens, then the blend menu, each option previewed on the canvas as it's hovered.
 */

const percentOf = (opacity: Opacity | undefined): number | undefined => {
  if (opacity === undefined) return undefined
  if ("token" in opacity) return opacityTokens.find((token) => token.name === opacity.token)?.percent
  return opacity.percent
}

/**
 * Opacity: a percentage, typed with the app's maths (`50`, `*0.5`, `-10`), or an opacity token's chip. On opacity's
 * steps, a quarter of a percent, it's written bare (`opacity-47.5`); finer, it's a value of its own, in brackets and
 * marked. Up and Down step 1%, Shift 10%, and its icon scrubs.
 */
export function OpacityField({
  value,
  mixed = false,
  onChange
}: {
  value: Opacity | undefined
  mixed?: boolean
  onChange: (value: Opacity | undefined) => void
}) {
  const token = value !== undefined && "token" in value ? value.token : undefined
  const percent = percentOf(value)
  const own = value !== undefined && "percent" in value ? value : undefined
  const offStep = own !== undefined && !onOpacityStep(own.percent)
  const typed = useTyped<Opacity | undefined>({
    label: "Opacity",
    shown: token === undefined && percent !== undefined ? formatNumber(percent) : "",
    read: (text) => {
      const trimmed = text.trim().toLowerCase()
      if (trimmed === "") return { value: undefined }
      const name = trimmed.replace(/^opacity-/, "")
      if (opacityTokens.some((each) => each.name === name)) return { value: { token: name } }
      const reading = readNumber(trimmed.replace(/%$/, ""), percent ?? 100, "Opacity")
      if ("reason" in reading) return { reason: "Opacity takes a percentage, such as 50, or an opacity token" }
      if ("clear" in reading) return { value: undefined }
      const kept = Math.min(100, Math.max(0, reading.value))
      if (kept !== reading.value) {
        return {
          value: { percent: kept },
          message: { tone: "note", text: `Kept at ${kept}%: it can't go ${kept === 100 ? "higher" : "lower"}` }
        }
      }
      return { value: { percent: kept } }
    },
    onCommit: onChange,
    onStep: (up, shift) => {
      if (token !== undefined) {
        const at = opacityTokens.findIndex((each) => each.name === token)
        let index = at + (up ? 1 : -1)
        if (shift) index = up ? opacityTokens.length - 1 : 0
        onChange({ token: opacityTokens[Math.min(opacityTokens.length - 1, Math.max(0, index))]!.name })
        return
      }
      const by = (up ? 1 : -1) * (shift ? 10 : 1)
      onChange({ percent: Math.min(100, Math.max(0, Math.round((percent ?? 100) + by))) })
    }
  })
  const nearestStep = own === undefined ? 0 : Math.round(own.percent * 4) / 4
  let placeholder = "100"
  if (mixed && value === undefined) placeholder = "Mixed"
  return (
    <div className="min-w-0 flex-1">
      <label className={fieldBox(typed.error, "group/field")}>
        {/*
          The field is too narrow for a token's preview, name and percentage, so with a token the drag handle draws the
          token's preview and its hint says the percentage.
        */}
        <Hint label="Drag to change opacity" detail={token === undefined ? undefined : `${token} is ${percent}%`}>
          <span
            onPointerDown={scrub(
              () => percent ?? 100,
              (next) => onChange({ percent: Math.round(next) }),
              { step: 1, shiftStep: 10, min: 0, max: 100 }
            )}
            className="shrink-0 cursor-ew-resize touch-none text-muted-foreground select-none"
          >
            {token === undefined ? (
              <Contrast aria-hidden className="size-3.5" />
            ) : (
              <TokenMark kind="opacity" value={String((percent ?? 100) / 100)} width={16} />
            )}
          </span>
        </Hint>
        {token !== undefined && <TokenChip name={token} fill onRemove={() => onChange(undefined)} />}
        <input
          aria-label="Opacity"
          inputMode="decimal"
          placeholder={token === undefined ? placeholder : ""}
          {...typed.input}
          onKeyDown={(event) => {
            if (token !== undefined && event.currentTarget.value === "" && event.key === "Backspace")
              onChange(undefined)
            typed.input.onKeyDown(event)
          }}
          className={`${fieldInput} ${token === undefined ? "" : "basis-0"}`}
        />
        {typed.error && <InvalidMark />}
        {!typed.error && offStep && own !== undefined && (
          <OffSystemMark
            compact
            label="Opacity"
            description={`${formatNumber(own.percent)}% is finer than opacity's steps, a quarter of a percent.`}
            nearest={{ name: `opacity-${formatNumber(nearestStep)}` }}
            allowed={own.allow}
            isTaken={(name) => opacityTokens.some((each) => each.name === name)}
            namePlaceholder="faint"
            onUse={() => onChange({ percent: nearestStep })}
            onCreate={(name) => onChange({ token: name })}
            onAllow={(allow) => onChange({ percent: own.percent, allow })}
          />
        )}
        {/* A narrow field shows one mark at rest: the status mark takes the unit's place. */}
        {token === undefined && !typed.focused && !typed.error && !offStep && (
          <span className="shrink-0 text-muted-foreground">%</span>
        )}
      </label>
      <MessageLine message={typed.message} />
    </div>
  )
}

/**
 * The blend menu: each mode previewed on the canvas while it's hovered or highlighted, with its CSS keyword beside it.
 * Unset is Normal, which blends as the parent does (Figma's pass through). Plus darker and Plus lighter aren't
 * Baseline, marked † beside the option and after the value.
 */
export function BlendMenu({
  value,
  mixed = false,
  onChange,
  onPreview
}: {
  value: BlendMode | undefined
  mixed?: boolean
  onChange: (value: BlendMode | undefined) => void
  onPreview: (value: BlendMode | undefined) => void
}) {
  const chosen = blendModes.find((mode) => mode.value === (value ?? "normal"))!
  let label: string = chosen.label
  if (mixed && value === undefined) label = "Mixed"
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) onPreview(undefined)
      }}
    >
      <Hint
        label={`Blend mode: ${label}`}
        detail={value === undefined ? "Unset: blends as its parent does (pass through)" : `mix-blend-mode: ${value}`}
        wait
      >
        <DropdownMenuTrigger
          aria-label={`Blend mode: ${label}`}
          className={`${fieldBox(false, "w-24 shrink-0 justify-between pr-1 outline-none")} data-popup-open:ring-2 data-popup-open:ring-ring`}
        >
          <span className={`truncate ${value === undefined ? "text-muted-foreground" : ""}`}>{label}</span>
          <span className="flex shrink-0 items-center gap-0.5">
            {value !== undefined && "browsers" in chosen && (
              <NotBaseline what={chosen.label} browsers={chosen.browsers} />
            )}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup
          value={value ?? "normal"}
          onValueChange={(next) => onChange(next === "normal" && value === undefined ? undefined : (next as BlendMode))}
        >
          {blendModes.map((mode, index) => (
            <Fragment key={mode.value}>
              {index > 0 && blendModes[index - 1]!.group !== mode.group && <DropdownMenuSeparator />}
              <DropdownMenuRadioItem
                value={mode.value}
                className="text-xs"
                onPointerEnter={() => onPreview(mode.value)}
                onFocus={() => onPreview(mode.value)}
              >
                <span className="flex-1">{mode.label}</span>
                {"browsers" in mode && <NotBaseline what={mode.label} browsers={mode.browsers} />}
                <span className="font-mono text-[10px] text-muted-foreground">{mode.value}</span>
              </DropdownMenuRadioItem>
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Opacity and Blend mode on one row, as design-options-panel.md's Appearance lays them out. */
export function OpacityRow({
  opacity,
  blend,
  mixed = false,
  onOpacity,
  onBlend,
  onPreviewBlend
}: {
  opacity: Opacity | undefined
  blend: BlendMode | undefined
  mixed?: boolean
  onOpacity: (value: Opacity | undefined) => void
  onBlend: (value: BlendMode | undefined) => void
  onPreviewBlend: (value: BlendMode | undefined) => void
}) {
  return (
    <div className="flex items-start gap-1">
      <OpacityField value={opacity} mixed={mixed} onChange={onOpacity} />
      <BlendMenu value={blend} mixed={mixed} onChange={onBlend} onPreview={onPreviewBlend} />
    </div>
  )
}
