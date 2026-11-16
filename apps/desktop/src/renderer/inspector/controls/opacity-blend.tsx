import { DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuSeparator } from "@buildkitgg/shadcn-baseui-kit"
import { formatNumber } from "@parity-app/style-schema"
import { Contrast } from "lucide-react"
import { Fragment } from "react"
import { ownValue, Unstored, useTokens } from "./field-parts.tsx"
import { KeywordItem, KeywordTrigger, PreviewMenu } from "./keyword-sets.tsx"
import { PercentField } from "./number-field.tsx"
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
            : ownValue({
                value: own.percent,
                text: `${formatNumber(own.percent)}%`,
                tokens,
                measure: (each) => each.percent,
                make: (name) => opacityToken(name, own.percent),
                create,
                allow: own.allow,
                onToken: (name) => onChange({ token: name }),
                onAllow: (allow) => onChange({ percent: own.percent, allow })
              })
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

  if (mixed && value === undefined) {
    label = "Mixed"
  }

  return (
    <PreviewMenu onPreview={onPreview}>
      <KeywordTrigger
        label="Blend mode"
        shown={label}
        chosen={value !== undefined}
        detail={value === undefined ? "Unset: blends as its parent does (pass through)" : `mix-blend-mode: ${value}`}
        browsers={value !== undefined && "browsers" in chosen ? chosen.browsers : undefined}
        className="min-w-0 flex-1"
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup
          value={value ?? "normal"}
          onValueChange={(next: string) =>
            onChange(
              next === "normal" && value === undefined
                ? undefined
                : blendModes.find((mode) => mode.value === next)?.value
            )
          }
        >
          {blendModes.map((mode, index) => (
            <Fragment key={mode.value}>
              {index > 0 && blendModes[index - 1]!.group !== mode.group && <DropdownMenuSeparator />}
              <KeywordItem
                value={mode.value}
                label={mode.label}
                keyword={mode.value}
                browsers={"browsers" in mode ? mode.browsers : undefined}
                onPreview={(next) => onPreview(blendModes.find((each) => each.value === next)?.value)}
              />
            </Fragment>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </PreviewMenu>
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
    // Half each, as the panel's paired fields are: room for a token's name in Opacity and Color dodge in Blend mode.
    <div className="grid grid-cols-2 items-start gap-1">
      <OpacityField value={opacity} mixed={mixed} onChange={onOpacity} />
      <Unstored part="blend">
        <BlendMenu value={blend} mixed={mixed} onChange={onBlend} onPreview={onPreviewBlend} />
      </Unstored>
    </div>
  )
}
