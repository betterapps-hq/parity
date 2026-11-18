import { Badge } from "@buildkitgg/shadcn"
import { Component, Diamond } from "lucide-react"
import { type ReactNode, useEffect, useState } from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { shortcutFor } from "../../chrome/keymap.ts"
import { PanelSection, panelEnd } from "../../chrome/PanelSection.tsx"
import type { PropValue } from "../../chrome/prop-values.ts"
import { FieldGrid, FirstStateName, SectionButton } from "../../inspector/controls/field-row.tsx"
import { InstanceSection, type PropRow, PropRows, shownName } from "../../inspector/controls/instance-section.tsx"
import { isPlanCardProp, PlanCard, type PlanCardProps, planCardProps, variantOptions } from "./plan-card.tsx"
import { ChangesBar, type PickerState, StatePicker } from "./state-picker.tsx"
import {
  allStates,
  baseId,
  freshName,
  inserted,
  isDefault,
  nameProblem,
  neighborOf,
  newId,
  overBase,
  type PropState,
  planCardManyStates,
  planCardStates,
  sameProps,
  savedProps,
  type States,
  stateOf,
  withoutState,
  withState
} from "./states-model.ts"

/**
 * States in the props they're made of (PAR-1069). Wherever a component's props are edited, on the component itself or
 * on an instance of it, its states lead them: press one to put its props in, set props and save them as a new state, or
 * save a change back to the state they came from. Two windows onto the one component: its board, and a screen using it.
 */

/** The component's board: a state picked, and changes made to any state's props that it hasn't saved yet. */
export interface ComponentModel extends States {
  picked: string
  /** A state's props as changed and not saved, kept while another is picked, as an editor keeps a tab's. */
  drafts: Record<string, PlanCardProps>
}

/** An instance of Plan card placed in a screen, with the props it sets and the state it was last set from. */
export interface PlacedCard {
  id: string
  props: Partial<PlanCardProps>
  from?: string
}

/** A screen using Plan card three times, with one instance selected. */
export interface ScreenModel extends States {
  cards: PlacedCard[]
  selected: string
}

export const componentStates: ComponentModel = { ...planCardStates, picked: "team", drafts: {} }

/** Before any state is saved: Base alone. */
export const componentBaseOnly: ComponentModel = {
  ...planCardStates,
  states: [],
  defaultState: undefined,
  picked: baseId,
  drafts: {}
}

/** Ten states, to see how the list holds them and searching narrows them. */
export const componentManyStates: ComponentModel = { ...planCardManyStates, picked: "education", drafts: {} }

export const pricingScreen: ScreenModel = {
  ...planCardStates,
  cards: [
    { id: "starter", props: {}, from: baseId },
    { id: "team", props: { ...planCardStates.states[0]!.props }, from: "team" },
    { id: "enterprise", props: { ...planCardStates.states[1]!.props }, from: "enterprise" }
  ],
  selected: "team"
}

/** Every change so far and every one undone, so Undo and Redo step through them as the app's own do. */
function useHistory<M>(initial: M) {
  const [timeline, setTimeline] = useState<{ past: M[]; now: M; future: M[] }>({ past: [], now: initial, future: [] })

  useEffect(() => {
    const keys = (event: globalThis.KeyboardEvent) => {
      // A field undoes its own typing.
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable]")) {
        return
      }

      const command = shortcutFor(event, ["undo", "redo"])

      if (!command) {
        return
      }

      event.preventDefault()
      setTimeline((was) => {
        const [from, to] = command === "undo" ? [was.past, was.future] : [was.future, was.past]
        const next = from.at(-1)

        if (next === undefined) {
          return was
        }

        const moved = [...to, was.now]

        return command === "undo"
          ? { past: from.slice(0, -1), now: next, future: moved }
          : { past: moved, now: next, future: from.slice(0, -1) }
      })
    }

    window.addEventListener("keydown", keys)

    return () => window.removeEventListener("keydown", keys)
  }, [])

  return {
    model: timeline.now,
    /** A change Undo takes back. */
    change: (to: (now: M) => M) => setTimeline(({ past, now }) => ({ past: [...past, now], now: to(now), future: [] })),
    /** What Undo skips, as it skips a selection. */
    look: (to: (now: M) => M) => setTimeline((was) => ({ ...was, now: to(was.now) }))
  }
}

/** Renaming a state, and saying why a name typed can't be had. */
function useRenaming<M extends States>(model: M, change: (to: (now: M) => M) => void) {
  const [renaming, setRenaming] = useState<string>()
  const [nameError, setNameError] = useState<string>()

  return {
    renaming,
    nameError,
    onRenaming: (id: string | undefined) => {
      setRenaming(id)
      setNameError(undefined)
    },
    onRename: (id: string, typed: string) => {
      const name = typed.trim()
      const state = stateOf(model, id)

      if (state && name && name !== state.name) {
        const problem = nameProblem(model, id, name)

        if (problem) {
          setNameError(problem)

          return false
        }

        change((now) => withState(now, id, (each) => ({ ...each, name })))
      }

      setRenaming(undefined)
      setNameError(undefined)

      return true
    }
  }
}

/** A state copied after itself, as "Team copy". */
function duplicated<M extends States>(model: M, id: string, copy: string): M {
  const from = stateOf(model, id)

  return from ? inserted(model, { id: copy, name: `${from.name} copy`, props: { ...from.props } }, id) : model
}

/**
 * The rows for props being edited, drawn as the app draws an instance's: `own` holds the values set, each with the
 * change mark and a reset to Base's where `marked`; a prop not in it shows Base's value faintly.
 */
function propRows(
  base: PlanCardProps,
  own: Partial<PlanCardProps>,
  full: PlanCardProps,
  marked: boolean,
  onReset: (key: keyof PlanCardProps) => void
): PropRow[] {
  return planCardProps.map(({ name, type }) => {
    const changed = marked && own[name] !== undefined
    const shared = { name, changed, onReset: changed ? () => onReset(name) : undefined }

    if (type === "boolean") {
      return { ...shared, type, value: Boolean(full[name]) }
    }

    const value = own[name] === undefined ? undefined : String(own[name])

    return type === "variant"
      ? { ...shared, type, value, default: base.variant, options: variantOptions }
      : { ...shared, type, value, default: String(base[name]) }
  })
}

/**
 * What a state sets, in a line under its name in the list: its text, the switches it turns on (or off, where Base has
 * them on), and its options, less any that's just its name. Base's are the props' own.
 */
function summaryOf(model: States, id: string): string {
  const state = stateOf(model, id)
  const props: Partial<PlanCardProps> = id === baseId ? model.base : (state?.props ?? {})
  // A value that's the state's own name, as Team's plan is, says nothing its name doesn't.
  const named = (value: PlanCardProps[keyof PlanCardProps]) => String(value).toLowerCase() === state?.name.toLowerCase()

  return planCardProps
    .flatMap(({ name, type }) => {
      const value = props[name]

      if (value === undefined || value === "" || named(value)) {
        return []
      }

      if (type === "boolean") {
        if (value) {
          return [shownName(name)]
        }

        return model.base[name] ? [`${shownName(name)} off`] : []
      }

      return [type === "variant" ? `${shownName(name)} ${String(value)}` : String(value)]
    })
    .join(", ")
}

/** The window's middle and right, for the component itself: its board, and the Design panel with its props. */
export function ComponentWorkspace({ initial }: { initial: ComponentModel }) {
  const { model, change, look } = useHistory(initial)
  const naming = useRenaming(model, change)
  const { picked } = model
  const base = picked === baseId
  const props = model.drafts[picked] ?? savedProps(model, picked)
  const changedStates = new Set(Object.keys(model.drafts))

  /** `props` as the picked state's draft, or no draft where they're what it saved. */
  const draft = (now: ComponentModel, next: PlanCardProps): ComponentModel => {
    const { [now.picked]: _dropped, ...rest } = now.drafts

    return { ...now, drafts: sameProps(next, savedProps(now, now.picked)) ? rest : { ...rest, [now.picked]: next } }
  }

  const setProp = (key: keyof PlanCardProps, value: PropValue | undefined) =>
    change((now) => {
      const current = now.drafts[now.picked] ?? savedProps(now, now.picked)
      // An emptied field in a state comes to Base's value; in Base, it's empty.
      const next = value ?? (now.picked === baseId ? "" : now.base[key])

      return draft(now, { ...current, [key]: next })
    })

  /** Drafts that come to what their states saved, after a save changed Base under them. */
  const pruned = (now: ComponentModel): ComponentModel => ({
    ...now,
    drafts: Object.fromEntries(
      Object.entries(now.drafts).filter(([id, props]) => !sameProps(props, savedProps(now, id)))
    )
  })

  const save = () =>
    change((now) => {
      const current = now.drafts[now.picked]

      if (!current) {
        return now
      }

      const saved =
        now.picked === baseId
          ? { ...now, base: current }
          : withState(now, now.picked, (state) => ({ ...state, props: overBase(now, current) }))

      return pruned(saved)
    })

  const discard = () => change((now) => draft(now, savedProps(now, now.picked)))

  const saveAsNew = (name?: string) => {
    const id = newId()
    change((now) => {
      const current = now.drafts[now.picked] ?? savedProps(now, now.picked)
      const { [now.picked]: _moved, ...drafts } = now.drafts
      // The changes go to the new state, and the one they were made in is left as it was saved.
      const made: PropState = { id, name: name ?? freshName(now), props: overBase(now, current) }

      return { ...inserted(now, made, now.picked === baseId ? undefined : now.picked), drafts, picked: id }
    })

    // Named as it was searched for, it's done; otherwise its name is open to type over.
    if (name === undefined) {
      naming.onRenaming(id)
    }
  }

  const remove = (id: string) =>
    change((now) => {
      const { [id]: _dropped, ...drafts } = now.drafts

      return { ...withoutState(now, id), drafts, picked: now.picked === id ? neighborOf(now, id) : now.picked }
    })

  const listed: PickerState[] = allStates(model).map((state) => ({
    id: state.id,
    name: state.name,
    summary: summaryOf(model, state.id),
    changed: changedStates.has(state.id),
    isDefault: isDefault(model, state.id)
  }))

  return (
    <FirstStateName value="Base">
      <div className="flex h-screen bg-background text-foreground">
        <ComponentBoard model={model} onPick={(id) => look((now) => ({ ...now, picked: id }))} />
        <Inspector header={<LayerHeader name="Plan card" kind="Component" />}>
          <PanelSection
            title="Props"
            count={planCardProps.length}
            // Where adding a prop goes, as the component's Props section has it: drawn here to sit beside State.
            action={<SectionButton what="prop" />}
          >
            <StatePicker
              states={listed}
              current={picked}
              changedLabel="unsaved changes"
              {...naming}
              onPick={(id) => look((now) => ({ ...now, picked: id }))}
              onSaveAsNew={saveAsNew}
              onDuplicate={(id) => {
                const copy = newId()
                change((now) => ({ ...duplicated(now, id, copy), picked: copy }))
              }}
              onDefault={(id) => change((now) => ({ ...now, defaultState: id === baseId ? undefined : id }))}
              onDelete={remove}
            />
            <FieldGrid>
              <PropRows
                // In Base every value is its own; in another state, only those it sets over Base are.
                rows={propRows(model.base, base ? props : overBase(model, props), props, !base, (key) =>
                  setProp(key, undefined)
                )}
                onChange={(name, value) => isPlanCardProp(name) && setProp(name, value)}
              />
            </FieldGrid>
            {changedStates.has(picked) && (
              <ChangesBar
                key={picked}
                status="Unsaved changes"
                revert="Discard"
                save="Save"
                revertHint={`Discard changes to ${stateOf(model, picked)?.name ?? "Base"}`}
                saveHint={`Save to ${stateOf(model, picked)?.name ?? "Base"}`}
                onRevert={discard}
                onSave={save}
              />
            )}
          </PanelSection>
        </Inspector>
      </div>
    </FirstStateName>
  )
}

/** The canvas: the component's board, with a frame for each state under its name, drawn with any changes not saved. */
function ComponentBoard({ model, onPick }: { model: ComponentModel; onPick: (id: string) => void }) {
  return (
    <Canvas>
      <div className="inline-flex flex-col gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: kindColors.component }}>
          <Component className="size-3.5" aria-hidden />
          Plan card
        </div>
        <div className="flex flex-wrap items-start gap-8">
          {allStates(model).map((state) => {
            const picked = state.id === model.picked

            return (
              <div key={state.id} className="flex flex-col gap-2">
                <div className="flex h-5 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={picked ? "text-foreground" : undefined}>{state.name}</span>
                  {model.drafts[state.id] && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
                  {isDefault(model, state.id) && (
                    <Badge variant="secondary" className="h-4 px-1.5 text-2xs">
                      Default
                    </Badge>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`${state.name} state`}
                  aria-pressed={picked}
                  onClick={() => onPick(state.id)}
                  className="rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={picked ? { boxShadow: `0 0 0 2px ${kindColors.component}` } : undefined}
                >
                  <span className="pointer-events-none block">
                    <PlanCard {...(model.drafts[state.id] ?? savedProps(model, state.id))} />
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </Canvas>
  )
}

/** The window's middle and right, for a screen using the component: the screen, and the selected instance's props. */
export function InstanceWorkspace({ initial }: { initial: ScreenModel }) {
  const { model, change, look } = useHistory(initial)
  const naming = useRenaming(model, change)
  const card = model.cards.find((each) => each.id === model.selected) ?? model.cards[0]!
  const full = { ...model.base, ...card.props }
  const from = stateOf(model, card.from)
  const changed = from !== undefined && !sameProps(full, savedProps(model, from.id))

  const withCard = (now: ScreenModel, to: (card: PlacedCard) => PlacedCard): ScreenModel => ({
    ...now,
    cards: now.cards.map((each) => (each.id === now.selected ? to(each) : each))
  })

  const setProp = (key: keyof PlanCardProps, value: PropValue | undefined) =>
    change((now) =>
      withCard(now, (each) => {
        const { [key]: _dropped, ...rest } = each.props

        return { ...each, props: value === undefined ? rest : { ...rest, [key]: value } }
      })
    )

  const pick = (id: string) =>
    change((now) => withCard(now, (each) => ({ ...each, props: { ...stateOf(now, id)?.props }, from: id })))

  const save = () =>
    change((now) => {
      const selected = now.cards.find((each) => each.id === now.selected)

      if (!selected?.from) {
        return now
      }

      const props = { ...now.base, ...selected.props }

      // Saved to Base, the props are the component's own, so the instance no longer sets them.
      return selected.from === baseId
        ? withCard({ ...now, base: props }, (each) => ({ ...each, props: {} }))
        : withCard(
            withState(now, selected.from, (state) => ({ ...state, props: overBase(now, props) })),
            (each) => ({ ...each, props: overBase(now, props) })
          )
    })

  const saveAsNew = (name?: string) => {
    const id = newId()
    change((now) => {
      const selected = now.cards.find((each) => each.id === now.selected)
      const props = overBase(now, { ...now.base, ...selected?.props })
      const made = { id, name: name ?? freshName(now), props }

      return withCard(inserted(now, made), (each) => ({ ...each, props, from: id }))
    })

    if (name === undefined) {
      naming.onRenaming(id)
    }
  }

  const listed: PickerState[] = allStates(model).map((state) => ({
    id: state.id,
    name: state.name,
    summary: summaryOf(model, state.id),
    changed: changed && state.id === from?.id,
    isDefault: isDefault(model, state.id)
  }))

  return (
    <FirstStateName value="Base">
      <div className="flex h-screen bg-background text-foreground">
        <Screen model={model} onSelect={(id) => look((now) => ({ ...now, selected: id }))} />
        <Inspector header={<LayerHeader name="Plan card" kind="Component instance" />}>
          <InstanceSection
            component="Plan card"
            onGoTo={() => undefined}
            props={propRows(model.base, card.props, full, true, (key) => setProp(key, undefined))}
            onChange={(name, value) => isPlanCardProp(name) && setProp(name, value)}
            note={
              <StatePicker
                states={listed}
                current={from?.id}
                changedLabel="changed"
                {...naming}
                onPick={pick}
                onSaveAsNew={saveAsNew}
                onDuplicate={(id) => change((now) => duplicated(now, id, newId()))}
                onDefault={(id) => change((now) => ({ ...now, defaultState: id === baseId ? undefined : id }))}
                onDelete={(id) =>
                  change((now) => ({
                    ...withoutState(now, id),
                    cards: now.cards.map((each) => (each.from === id ? { ...each, from: undefined } : each))
                  }))
                }
              />
            }
          >
            {changed && from && (
              <ChangesBar
                key={from.id}
                status="Changed"
                revert="Reset"
                save="Update"
                revertHint={`Reset to ${from.name}`}
                saveHint={`Update ${from.name}`}
                onRevert={() => pick(from.id)}
                onSave={save}
              />
            )}
          </InstanceSection>
        </Inspector>
      </div>
    </FirstStateName>
  )
}

/** The canvas: a pricing screen with Plan card placed three times, each as its own props draw it. */
function Screen({ model, onSelect }: { model: ScreenModel; onSelect: (id: string) => void }) {
  return (
    <Canvas>
      <div className="inline-flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Pricing</span>
        <div className="flex flex-col gap-8 rounded-lg border bg-background p-10">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Pick a plan</h1>
            <p className="text-sm text-muted-foreground">Start free, and move up as your team grows.</p>
          </div>
          <div className="flex flex-wrap items-start gap-6">
            {model.cards.map((card) => {
              const selected = card.id === model.selected
              const props = { ...model.base, ...card.props }

              return (
                <button
                  key={card.id}
                  type="button"
                  aria-label={`Plan card, ${props.plan}`}
                  aria-pressed={selected}
                  onClick={() => onSelect(card.id)}
                  className="rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={selected ? { boxShadow: `0 0 0 2px ${kindColors.component}` } : undefined}
                >
                  <span className="pointer-events-none block">
                    <PlanCard {...props} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </Canvas>
  )
}

function Canvas({ children }: { children: ReactNode }) {
  return (
    <main aria-label="Canvas" className="min-w-0 flex-1 overflow-auto bg-muted/40 p-10">
      {children}
    </main>
  )
}

function Inspector({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <aside aria-label="Inspector" className="flex w-72 shrink-0 flex-col overflow-y-auto border-l bg-background">
      {header}
      {children}
    </aside>
  )
}

/** The panel's header for the layer selected: its icon, name and kind. */
function LayerHeader({ name, kind }: { name: string; kind: string }) {
  const Icon = kind === "Component" ? Component : Diamond

  return (
    <div className={`flex items-center gap-2 border-b py-3 pl-4 ${panelEnd}`}>
      <span
        className="grid size-8 place-items-center rounded-md"
        style={{
          color: kindColors.component,
          background: "color-mix(in oklch, var(--canvas-component) 12%, transparent)"
        }}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{name}</span>
        <span className="text-xs" style={{ color: kindColors.component }}>
          {kind}
        </span>
      </span>
    </div>
  )
}
