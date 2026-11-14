import { Button, Popover, PopoverContent, PopoverTrigger } from "@buildkitgg/shadcn-baseui-kit"
import {
  besideScales,
  type ContainerSpec,
  type ContainerViewSettings,
  frameGeometry,
  type ModeVariable,
  previewKey,
  previewOf,
  previewScale,
  previewSettingsOf,
  type PreviewSettings,
  type PreviewValue,
  previewValues,
  type ResolvedMode,
  withoutPreviewValues,
  withPreviewValues
} from "@parity-app/core"
import { pickPreviews } from "@parity-app/editor"
import { RotateCcw, Search, SlidersHorizontal } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import { stopEventPropagation } from "tldraw"
import { AppSelect } from "../chrome/AppSelect.tsx"
import { Hint } from "../chrome/Hint.tsx"
import { Name } from "../chrome/Name.tsx"
import { PanelSectionTitle } from "../chrome/PanelSection.tsx"
import { ModeViewportIcon } from "../chrome/viewports.tsx"
import { PixelField } from "../inspector/controls/controls.tsx"
import { ChangeMark, Changed } from "../inspector/controls/field-parts.tsx"
import { Field, FieldGrid } from "../inspector/controls/field-row.tsx"
import { PercentField } from "../inspector/controls/number-field.tsx"
import { useProject } from "./context.ts"
import { kindColors } from "./kinds.tsx"

/*
 * The settings of a design's previews, set on the canvas above what they change (PAR-1071): the zoom of the previews
 * selected in the header of the last one picked, and a button that opens their width and each of their modes' variables
 * other than the viewport, as many as the project registers, each a select so a long list fits. A preview that sets
 * anything over its mode has the button and a reset in its own header. Values the previews selected don't share show
 * Mixed, and setting one sets each.
 */

/** A preview whose settings these change: its key, its state's and mode's, and whether it's in the first mode shown. */
export interface PreviewTarget {
  key: string
  mode: ResolvedMode
  /** In the first mode shown, drawn at full size, where the rest fit beside it. */
  first: boolean
}

/** What the settings work from for one preview: its own values, and what it's drawn at now. */
interface Selected extends PreviewTarget {
  own: PreviewSettings | undefined
  scale: number
  width: number
  /** Its option for each variable, its own or its mode's, by variable id. */
  options: Record<string, string>
}

/** How the settings change a design's view: one undoable step, named. */
export type ChangeView = (label: string, update: (view: ContainerViewSettings) => ContainerViewSettings) => void

function selectedOf(design: ContainerSpec, targets: readonly PreviewTarget[]): Selected[] {
  return targets.map((target) => {
    const at = previewOf(target.key)
    const own = previewSettingsOf(design, at.state, at.mode)
    const options = Object.fromEntries(target.mode.options.map(({ variable, option }) => [variable.id, option.id]))

    return {
      ...target,
      own,
      scale: previewScale(design, target.mode, target.first, own),
      width: own?.width ?? frameGeometry(design, target.mode).width,
      options: { ...options, ...own?.options }
    }
  })
}

/** What every one of `list` shares, or `undefined` where they differ. */
function shared<T>(list: readonly T[]): T | undefined {
  return list.every((each) => each === list[0]) ? list[0] : undefined
}

/**
 * The previews' zoom, as the inspector's percentages take one: its glyph scrubs it, typed it goes from 10% to 400%, and
 * its chevron offers Fit beside the first mode, for a preview beside it, and 100, 75, 50 and 25%. It shows Mixed where
 * they differ, and the change mark while any sets its own.
 */
export function ZoomField({
  design,
  targets,
  onChange
}: {
  design: ContainerSpec
  targets: readonly PreviewTarget[]
  onChange: ChangeView
}) {
  const previews = selectedOf(design, targets)
  const percentOf = (each: Selected) => Math.round(each.scale * 100)
  const fitOf = (each: Selected) => Math.round(previewScale(design, each.mode, each.first, undefined) * 100)
  const percent = shared(previews.map(percentOf))
  const fitted = previews.every((each) => each.own?.scale === undefined && !each.first)
  const fixed = previews.every((each) => each.own?.scale !== undefined || each.first)
  const mixed = !fitted && !(fixed && percent !== undefined)
  const besides = previews.some((each) => !each.first)
  const fit = shared(previews.filter((each) => !each.first).map(fitOf))

  // Each to `next`, or to Fit with `undefined`. A first mode's preview is at full size unset, so 100 unsets it.
  const setPercent = (next: number | undefined) =>
    onChange(next === undefined ? "Fit previews" : `Show previews at ${next}%`, (view) =>
      previews.reduce(
        (each, preview) =>
          withPreviewValues(each, preview.key, {
            scale: next === undefined || (preview.first && next === 100) ? undefined : next / 100
          }),
        view
      )
    )

  return (
    <Changed when={previews.some((each) => each.own?.scale !== undefined)}>
      <PercentField
        label="Zoom"
        // A plain magnifier, not zoom in: it goes either way. Typing or scrubbing goes past 100%; the options stop there.
        inner={<Search aria-hidden className="size-3.5" />}
        min={10}
        max={400}
        places={0}
        // Fitted, it shows what Fit comes to, faintly, as unset does.
        placeholder={String(fitted && percent !== undefined ? percent : 100)}
        unsetIs={percentOf(previews.at(-1)!)}
        mixed={mixed}
        rowClassName="w-24 shrink-0"
        value={fitted || mixed ? undefined : percent}
        options={{
          name: "Presets",
          heading: "Zoom",
          rows: [
            ...(besides
              ? [
                  {
                    key: "fit",
                    name: "Fit",
                    detail: fit === undefined ? "" : `${fit}%`,
                    current: fitted,
                    onPick: () => setPercent(undefined)
                  }
                ]
              : []),
            ...besideScales.toReversed().map((scale) => ({
              key: String(scale),
              name: `${scale * 100}%`,
              detail: "",
              current: fixed && percent === scale * 100,
              onPick: () => setPercent(scale * 100)
            }))
          ]
        }}
        onChange={setPercent}
      />
    </Changed>
  )
}

/**
 * The button that opens the settings of the previews given: every one selected, in the header of the last picked, or a
 * preview's own, in its header where it sets anything over its mode. It has the change mark while any sets anything
 * other than a zoom its header has a field for. The settings open above it, clear of what they change.
 */
export function SettingsMenu({
  design,
  targets,
  variables,
  changed,
  tabbable,
  narrowest,
  onChange
}: {
  design: ContainerSpec
  targets: readonly PreviewTarget[]
  variables: readonly ModeVariable[]
  changed: boolean
  tabbable: boolean
  /** The narrowest width a preview can be tried at: a page's, or a story's or component's. */
  narrowest: number
  onChange: ChangeView
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Hint label="Preview settings" hidden={open}>
            <button
              type="button"
              aria-label="Preview settings"
              tabIndex={tabbable ? 0 : -1}
              data-canvas-control
              onPointerDown={stopEventPropagation}
              className="pointer-events-auto relative flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-accent aria-expanded:text-foreground dark:bg-input/40"
            >
              <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden />
              {changed && <ChangeMark />}
            </button>
          </Hint>
        }
      />
      <PopoverContent
        side="top"
        align="start"
        className="w-56 gap-0 p-3"
        data-canvas-control
        onPointerDown={stopEventPropagation}
      >
        <PreviewSettingsPanel
          design={design}
          targets={targets}
          variables={variables}
          narrowest={narrowest}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The previews' settings: their width with the px field, and a select for each of their modes' variables other than
 * the viewport. A value set over a mode has the reset arrow back to the mode's, and the title's reset puts every value of
 * each back, its zoom too.
 */
function PreviewSettingsPanel({
  design,
  targets,
  variables,
  narrowest,
  onChange
}: {
  design: ContainerSpec
  targets: readonly PreviewTarget[]
  variables: readonly ModeVariable[]
  narrowest: number
  onChange: ChangeView
}) {
  const previews = selectedOf(design, targets)
  const one = previews.length === 1 ? previews[0] : undefined
  const width = shared(previews.map((each) => each.width))
  const anySet = previews.some((each) => previewValues(each.own).length > 0)
  const resetHint = one ? `Reset to ${one.mode.name}` : "Reset to their modes"

  // What a value's reset goes back to: the mode's, where the previews that set it share one.
  const resetTo = (value: PreviewValue, describe: (each: Selected) => string) => {
    const set = previews.filter((each) => previewValues(each.own).includes(value))

    return set.length === 0 ? undefined : (shared(set.map(describe)) ?? "their modes")
  }

  const resetValue = (value: PreviewValue, label: string) =>
    onChange(label, (view) =>
      previews.reduce((each, preview) => withoutPreviewValues(each, preview.key, [value]), view)
    )

  const optionOfMode = (each: Selected, variable: string) =>
    each.mode.options.find((option) => option.variable.id === variable)?.option

  return (
    <>
      <PanelSectionTitle
        title="Preview settings"
        // As tall as its reset, so the reset showing doesn't move the fields.
        spacing="mb-3 min-h-7"
        action={
          anySet && (
            <Hint label={resetHint}>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Reset preview settings"
                onClick={() =>
                  onChange("Reset preview settings", (view) =>
                    previews.reduce((each, preview) => withoutPreviewValues(each, preview.key), view)
                  )
                }
              >
                <RotateCcw />
              </Button>
            </Hint>
          )
        }
      />
      <FieldGrid>
        <Field
          label="Width"
          overrides={resetTo("width", (each) => `${frameGeometry(design, each.mode).width}px`)}
          onReset={() => resetValue("width", "Reset preview width")}
        >
          <PixelField
            label="Width"
            inner="W"
            min={narrowest}
            mixed={width === undefined}
            value={width}
            onChange={(next) =>
              onChange(next === undefined ? "Reset preview width" : `Try previews at ${next}px`, (view) =>
                previews.reduce((each, preview) => {
                  const base = frameGeometry(design, preview.mode).width

                  return withPreviewValues(each, preview.key, {
                    width: next === undefined || next === base ? undefined : next
                  })
                }, view)
              )
            }
          />
        </Field>
        {variables
          .filter((variable) => variable.kind !== "viewport")
          .map((variable) => {
            const value: PreviewValue = `option:${variable.id}`
            const chosen = shared(previews.map((each) => each.options[variable.id]))

            return (
              <Field
                key={variable.id}
                label={variable.name}
                overrides={resetTo(value, (each) => optionOfMode(each, variable.id)?.name ?? "")}
                onReset={() => resetValue(value, `Reset preview ${variable.name.toLowerCase()}`)}
              >
                <AppSelect
                  variant="panel"
                  className="w-full"
                  aria-label={variable.name}
                  items={variable.options.map((each) => ({ value: each.id, label: each.name }))}
                  value={chosen ?? null}
                  placeholder="Mixed"
                  onValueChange={(next) => {
                    if (next === null) {
                      return
                    }

                    const name = variable.options.find((each) => each.id === next)?.name ?? next

                    onChange(`Show previews in ${name}`, (view) =>
                      previews.reduce(
                        (each, preview) =>
                          withPreviewValues(each, preview.key, {
                            options: {
                              [variable.id]: optionOfMode(preview, variable.id)?.id === next ? undefined : next
                            }
                          }),
                        view
                      )
                    )
                  }}
                />
              </Field>
            )
          })}
      </FieldGrid>
    </>
  )
}

/** A preview's reset in its header: back to its mode's values, or several previews' back to theirs (no `mode`). */
export function PreviewReset({
  mode,
  tabbable,
  onReset
}: {
  mode: ResolvedMode | undefined
  tabbable: boolean
  onReset: () => void
}) {
  return (
    <Hint label={mode ? `Reset to ${mode.name}` : "Reset to their modes"}>
      <button
        type="button"
        aria-label="Reset preview settings"
        tabIndex={tabbable ? 0 : -1}
        data-canvas-control
        onPointerDown={stopEventPropagation}
        onClick={onReset}
        className="pointer-events-auto grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <RotateCcw className="size-3" />
      </button>
    </Hint>
  )
}

/**
 * A preview's header, in the band above it (PAR-1071): its mode's name, which selects the preview on its own, or with
 * Shift adds it to the previews selected or takes it away, then what it holds. The header of the last preview picked
 * holds the settings of every one selected: their zoom as a field, the settings button, and a reset while any sets
 * anything. Another preview that sets anything over its mode has the settings button for its own and a reset. What
 * follows the name goes beside it where it fits over the preview, and otherwise on a line under it, which its row makes
 * room for (see `onStack`), so nothing is cut off.
 */
export function PreviewHeader({
  design,
  designKey,
  state,
  mode,
  first,
  targets,
  selected,
  named,
  tabbable,
  variables,
  narrowest,
  stacked,
  onStack
}: {
  design: ContainerSpec
  designKey: string
  state: { id: string; name: string }
  mode: ResolvedMode
  first: boolean
  /** The previews whose settings it holds, as the last of them picked, or none. */
  targets: readonly PreviewTarget[] | undefined
  selected: boolean
  /** Its design names its rows, so its accessible name names its state too, as `Popular in Desktop Light`. */
  named: boolean
  tabbable: boolean
  variables: readonly ModeVariable[]
  narrowest: number
  /** What follows its name is on a line under it. */
  stacked: boolean
  /** Says whether what follows its name fits beside it over the preview, by the preview's key. */
  onStack: (key: string, stacked: boolean) => void
}) {
  const { store, selection } = useProject()
  const key = previewKey(state.id, mode.id)
  const own = previewSettingsOf(design, state.id, mode.id)
  const set = previewValues(own)
  const name = named ? `${state.name} in ${mode.name}` : mode.name
  const row = useRef<HTMLDivElement>(null)
  const nameButton = useRef<HTMLButtonElement>(null)
  const rest = useRef<HTMLDivElement>(null)
  const holds = targets !== undefined
  const onChange: ChangeView = (label, update) => store.updateView(designKey, label, update)

  // Holding the selected previews' settings, it resets every one of them; otherwise its own.
  const resets = targets?.map((target) => target.key) ?? [key]

  const resettable = resets.some((each) => {
    const at = previewOf(each)

    return previewValues(previewSettingsOf(design, at.state, at.mode)).length > 0
  })

  // Whether what follows its name fits beside it, measured at the size it reads, however it's laid out now.
  useLayoutEffect(() => {
    const element = row.current
    const label = nameButton.current
    const after = rest.current

    if (!element || !label) {
      return undefined
    }

    const report = () =>
      onStack(key, after !== null && label.offsetWidth + after.offsetWidth + 8 > element.parentElement!.clientWidth)

    report()
    const observer = new ResizeObserver(report)
    observer.observe(element.parentElement!)
    observer.observe(label)

    if (after) {
      observer.observe(after)
    }

    return () => observer.disconnect()
  }, [key, onStack, holds, set.length, resettable])

  const reset = resettable && (
    <PreviewReset
      mode={targets && targets.length > 1 ? undefined : mode}
      tabbable={tabbable}
      onReset={() =>
        onChange(`Reset ${name}`, (view) => resets.reduce((each, preview) => withoutPreviewValues(each, preview), view))
      }
    />
  )

  let after = null

  if (targets) {
    after = (
      <div ref={rest} className="flex w-max shrink-0 items-center gap-1.5">
        <ZoomField design={design} targets={targets} onChange={onChange} />
        <SettingsMenu
          design={design}
          targets={targets}
          variables={variables}
          // The zoom has its own field and mark here.
          changed={set.some((value) => value !== "scale")}
          tabbable={tabbable}
          narrowest={narrowest}
          onChange={onChange}
        />
        {reset}
      </div>
    )
  } else if (set.length > 0) {
    after = (
      <div ref={rest} className="flex w-max shrink-0 items-center gap-1.5">
        <SettingsMenu
          design={design}
          targets={[{ key, mode, first }]}
          variables={variables}
          changed
          tabbable={tabbable}
          narrowest={narrowest}
          onChange={onChange}
        />
        {reset}
      </div>
    )
  }

  return (
    <div
      ref={row}
      className={`flex gap-1.5 whitespace-nowrap ${stacked ? "flex-col items-start" : "h-7 items-center"}`}
      data-canvas-control
    >
      <Hint label={`Select ${mode.name}`} detail="Shift+click to add it" wait>
        <button
          ref={nameButton}
          type="button"
          tabIndex={tabbable ? 0 : -1}
          aria-label={named ? name : undefined}
          aria-pressed={selected}
          onPointerDown={stopEventPropagation}
          onClick={(event) => selection.set(pickPreviews(selection.get(), designKey, [key], event.shiftKey))}
          // As wide as it reads, so what follows it goes under it rather than cutting it off.
          className="pointer-events-auto flex h-7 w-max shrink-0 items-center gap-1.5 rounded px-0.5 font-medium outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          style={selected ? { color: kindColors.mode } : undefined}
        >
          <ModeViewportIcon of={mode} className="size-3.5 shrink-0 opacity-70" aria-hidden />
          <Name>{mode.name}</Name>
        </button>
      </Hint>
      {after}
    </div>
  )
}
