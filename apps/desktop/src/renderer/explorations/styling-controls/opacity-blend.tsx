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
import { formatNumber } from "./css-values.ts"
import { fieldBox, nearestToken, NotBaseline, PercentField, useTokens } from "./field-parts.tsx"
import { type BlendMode, blendModes } from "./text-data.ts"
import type { Opacity } from "./text-writes.ts"
import { opacityToken } from "./tokens.ts"

/*
 * Appearance's Opacity and Blend mode row (PAR-186, design-options-values.md's Percentage and opacity): a percentage
 * with opacity tokens, then the blend menu, each option previewed on the canvas as it's hovered.
 */

/**
 * Opacity: a percentage, the core's PercentField, typed with the app's maths (`50`, `*0.5`, `-10`), or an opacity
 * token's chip. On opacity's steps, a quarter of a percent, it's written bare (`opacity-47.5`); finer, it's a value of
 * its own, in brackets and marked. Up and Down step 1%, Shift 10%, Alt a quarter, and its icon scrubs.
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
  const { tokens, create } = useTokens("opacity")
  const own = value !== undefined && "percent" in value ? value : undefined
  const nearest = own === undefined ? undefined : nearestToken(tokens, (each) => each.percent, own.percent)
  const token = value !== undefined && "token" in value ? value.token : undefined
  return (
    // The row's width, beside the blend menu, with what it says under both.
    <div className="min-w-0 flex-1">
      <PercentField
        label="Opacity"
        inner={<Contrast aria-hidden className="size-3.5" />}
        value={own?.percent}
        mixed={mixed}
        // A token's chip needs the room beside the blend menu, so it fills the field and its percentage is in the hint.
        narrow={token !== undefined}
        tokens={{
          list: tokens,
          current: token,
          onPick: (name) => onChange(name === undefined ? undefined : { token: name })
        }}
        own={
          own === undefined
            ? undefined
            : {
                text: `${formatNumber(own.percent)}%`,
                nearest,
                same: nearest?.percent === own.percent,
                onCreate:
                  create &&
                  ((name) => {
                    create(opacityToken(name, own.percent))
                    onChange({ token: name })
                  }),
                allowed: own.allow,
                onAllow: (allow) => onChange({ percent: own.percent, allow })
              }
        }
        onChange={(percent) => onChange(percent === undefined ? undefined : { percent })}
      />
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
                <span className="font-mono text-2xs text-muted-foreground">{mode.value}</span>
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
