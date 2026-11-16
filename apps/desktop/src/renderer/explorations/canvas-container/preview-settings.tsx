import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { besideScales, type ResolvedMode } from "@parity-app/core"
import { RotateCcw, Search } from "lucide-react"
import { AppSelect } from "../../chrome/AppSelect.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { PanelSectionTitle } from "../../chrome/PanelSection.tsx"
import { PixelField } from "../../inspector/controls/controls.tsx"
import { Changed } from "../../inspector/controls/field-parts.tsx"
import { Field, FieldGrid } from "../../inspector/controls/field-row.tsx"
import { PercentField } from "../../inspector/controls/number-field.tsx"
import {
  type BoardData,
  baseWidth,
  type OwnValues,
  ownKeys,
  previewOf,
  type PreviewValues,
  previewValues,
  type StateItem,
  unsavedKeys,
  type ValueKey,
  withValue
} from "./model.ts"
import { shownModes, useSketch } from "./sketch-state.tsx"

/*
 * The settings of the selected previews, set on the canvas: their zoom in the header of the last one picked, and their
 * width and each of their modes' variables in the settings it opens there, with the inspector's own fields. A value
 * they don't share shows Mixed, and setting it sets it on each. A value changed since the last save has the change mark,
 * with a reset back to that.
 */

/** A selected preview, as its settings work from it: its values now and as last saved. */
interface Selected {
  key: string
  state: StateItem
  mode: ResolvedMode
  /** In the first mode shown, so drawn at full size, where the rest fit beside it. */
  first: boolean
  own: OwnValues | undefined
  saved: OwnValues | undefined
  values: PreviewValues
  /** Its values as last saved. */
  baseline: PreviewValues
  unsaved: ValueKey[]
}

/** The previews the settings change, by key, and how to change each. */
function useSelected(board: BoardData, keys: string[]) {
  const { views, modes, setValue, reset } = useSketch()
  const view = views[board.id]!
  const shown = shownModes(view, modes)

  const previews = keys.flatMap((key): Selected[] => {
    const at = previewOf(key)
    const state = board.states.find((each) => each.id === at.state)
    const mode = shown.find((each) => each.id === at.mode)

    if (!state || !mode) {
      return []
    }

    const first = shown[0]!.id === mode.id
    const own = view.own[key]
    const saved = view.saved[key]

    return [
      {
        key,
        state,
        mode,
        first,
        own,
        saved,
        values: previewValues(state, mode, own, first),
        baseline: previewValues(state, mode, saved, first),
        unsaved: unsavedKeys(own, saved)
      }
    ]
  })

  return {
    previews,
    /** Sets a value on each preview, worked out for it: `undefined` leaves it to the preview's mode. */
    setEach: (key: ValueKey, value: (preview: Selected) => number | string | undefined) => {
      for (const each of previews) {
        setValue(board.id, each.key, key, value(each))
      }
    },
    /** Puts each preview's values back as last saved: those given, or every one. */
    resetEach: (keys?: ValueKey[]) => {
      for (const each of previews) {
        reset(board.id, each.key, keys)
      }
    }
  }
}

/** What every one of `list` shares, or `undefined` where they differ. */
function shared<T>(list: T[]): T | undefined {
  return list.every((each) => each === list[0]) ? list[0] : undefined
}

/**
 * The selected previews' zoom, as the inspector's percent fields take one: dragging its glyph scrubs it, and its
 * chevron offers the sizes a preview is drawn at, and Fit beside the first, which fits a preview there. It shows Mixed
 * where they differ, and the change mark while any differs from what was last saved.
 */
export function ZoomField({ board, previews: keys }: { board: BoardData; previews: string[] }) {
  const { previews, setEach } = useSelected(board, keys)
  const percentOf = (each: Selected) => Math.round(each.values.scale * 100)

  // What Fit comes to: the scale that fits a preview beside the first.
  const fitOf = (each: Selected) =>
    Math.round(previewValues(each.state, each.mode, withValue(each.own, "scale", undefined), each.first).scale * 100)

  const percent = shared(previews.map(percentOf))
  const fitted = previews.every((each) => each.values.fitted)
  const fixed = previews.every((each) => !each.values.fitted)
  const mixed = !fitted && !(fixed && percent !== undefined)
  // Only a preview beside the first fits; the first mode's draw at full size.
  const besides = previews.some((each) => !each.first)
  const fit = shared(previews.filter((each) => !each.first).map(fitOf))

  // Each to `next`, or to Fit with `undefined`. A first mode's preview is at full size unset, so 100 unsets it.
  const setPercent = (next: number | undefined) =>
    setEach("scale", (each) => (next === undefined || (each.first && next === 100) ? undefined : next / 100))

  return (
    <Changed when={previews.some((each) => each.unsaved.includes("scale"))}>
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
          name: "Zoom",
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
 * The selected previews' settings, opened from the header of the last one picked: their width with the px field, and
 * an option for each of their modes' variables other than the viewport, as many as the project's adapters register,
 * each a select so a long list fits. Its reset puts every value of each back as last saved, their zoom too.
 */
export function PreviewSettings({ board, previews: keys }: { board: BoardData; previews: string[] }) {
  const { previews, setEach, resetEach } = useSelected(board, keys)
  const one = previews.length === 1 ? previews[0] : undefined
  const width = shared(previews.map((each) => each.values.width))
  const variables = previews.at(-1)!.values.options.filter(({ variable }) => variable.kind !== "viewport")
  const saved = previews.some((each) => ownKeys(each.saved).length > 0)
  // What the reset goes back to: as saved, or to the mode of one preview or of each.
  const modesWord = one ? `Reset to ${one.mode.name}` : "Reset to their modes"
  const resetHint = saved ? "Reset to saved values" : modesWord

  // What a changed value's reset goes back to, which its arrow names: as saved, where the previews changed share it.
  const resetTo = (key: ValueKey) => {
    const changed = previews.filter((each) => each.unsaved.includes(key))

    return changed.length === 0
      ? undefined
      : (shared(changed.map((each) => describe(key, each.baseline))) ?? "saved values")
  }

  const optionOf = (each: Selected, variable: string) =>
    each.values.options.find((option) => option.variable.id === variable)?.option.id

  return (
    <>
      <PanelSectionTitle
        title="Preview settings"
        // As tall as its reset, so the reset showing doesn't move the fields.
        spacing="mb-3 min-h-7"
        action={
          previews.some((each) => each.unsaved.length > 0) && (
            <Hint label={resetHint}>
              <Button variant="ghost" size="icon-sm" aria-label="Reset preview settings" onClick={() => resetEach()}>
                <RotateCcw />
              </Button>
            </Hint>
          )
        }
      />
      <FieldGrid>
        <Field label="Width" overrides={resetTo("width")} onReset={() => resetEach(["width"])}>
          <PixelField
            label="Width"
            inner="W"
            min={board.kind === "story" ? 80 : 320}
            mixed={width === undefined}
            value={width}
            onChange={(next) =>
              setEach("width", (each) =>
                next === undefined || next === baseWidth(each.state, each.mode) ? undefined : next
              )
            }
          />
        </Field>
        {variables.map(({ variable }) => {
          const key: ValueKey = `option:${variable.id}`
          const chosen = shared(previews.map((each) => optionOf(each, variable.id)))

          return (
            <Field key={variable.id} label={variable.name} overrides={resetTo(key)} onReset={() => resetEach([key])}>
              <AppSelect
                variant="panel"
                className="w-full"
                aria-label={variable.name}
                items={variable.options.map((each) => ({ value: each.id, label: each.name }))}
                value={chosen ?? null}
                placeholder="Mixed"
                onValueChange={(next) =>
                  next !== null &&
                  setEach(key, (each) =>
                    next === each.mode.options.find((option) => option.variable.id === variable.id)?.option.id
                      ? undefined
                      : next
                  )
                }
              />
            </Field>
          )
        })}
      </FieldGrid>
    </>
  )
}

/** How a value reads where its reset names it: "1280px", "Fit", "Light". */
function describe(key: ValueKey, values: PreviewValues): string {
  if (key === "width") {
    return `${values.width}px`
  }

  if (key === "scale") {
    return values.fitted ? "Fit" : `${Math.round(values.scale * 100)}%`
  }

  const variable = key.slice("option:".length)

  return values.options.find((each) => each.variable.id === variable)?.option.name ?? ""
}
