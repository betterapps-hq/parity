import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Switch,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import { isSecretName } from "@parity-app/telemetry"
import { Ellipsis, Lock, LockOpen, Minus, Plus, RotateCcw } from "lucide-react"
import {
  type ComponentProps,
  createContext,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState
} from "react"
import { Hint } from "../../chrome/Hint.tsx"
import { Changed, ChangeMark, StoresContext, type Unstorable, useChanged } from "./field-parts.tsx"

/*
 * A property's row as the simpler fields lay it out (PAR-186): its name above the control in words, as Figma's with
 * property labels on and Plasmic's are, rather than in a column to its left. Two rows marked `half` sit side by side in
 * a section's grid (`FieldGrid`). Dragging the name scrubs the row's one draggable field, and a reset arrow at the end of
 * the name's row puts back a value a state changed. A row a typography preset sets (call 6) is
 * locked to it, with a lock toggle at the end of the name's row, and a row that overrides it marks its control with the
 * change dot and has a reset arrow; a dot after the name says the value changes with the viewport. A row's name names
 * the inputs inside that have no name of their own (`useFieldName`).
 */

/** The first state's name, which a field's reset goes back to: Default unless it's been renamed. */
export const FirstStateName = createContext("Default")

/**
 * What the number fields inside edit, as a key that changes when that does: the selection, for the inspector (see
 * `selectionKey`). A field keeps focus while the selection changes under it, so a run of its Up and Down presses ends
 * when this changes rather than carrying on into the next layer's edits.
 */
export const FieldTarget = createContext<string | undefined>(undefined)

const MixedContext = createContext(false)

/** Whether the field an input sits in has different values across the selected layers. */
export function useMixed(): boolean {
  return useContext(MixedContext)
}

/** The id of the name of the row an input sits in, which names the input. */
const FieldLabelContext = createContext<string | undefined>(undefined)

/**
 * How an input is named: by `name` when it's given one, for a row of several inputs or an input outside a row, and
 * otherwise by the name of the row it sits in, so a call site doesn't repeat it.
 */
export function useFieldName(name: string | undefined): { "aria-label"?: string; "aria-labelledby"?: string } {
  const labelId = useContext(FieldLabelContext)

  return name ? { "aria-label": name } : { "aria-labelledby": labelId }
}

/** Starts dragging a field's value from a pointer pressed on its row's name. */
type Scrub = (event: ReactPointerEvent<Element>) => void

/** The row a field is in, which takes its scrub so the row's name drags it. */
const RowScrub = createContext<((scrub: Scrub) => () => void) | undefined>(undefined)

/**
 * Hands a field's scrub to its row, so dragging the row's name scrubs it, as dragging Figma's labels does. A row with
 * more than one draggable field leaves its name alone, as which one it would drag isn't clear.
 */
export function useRowScrub(scrub: Scrub | undefined): void {
  const register = useContext(RowScrub)
  const latest = useRef(scrub)
  useEffect(() => {
    latest.current = scrub
  })
  const has = scrub !== undefined
  useEffect(() => {
    if (!register || !has) {
      return undefined
    }

    return register((event) => latest.current?.(event))
  }, [register, has])
}

interface FieldProps {
  label: string
  /** A small mark before the name, as a prop's type. */
  icon?: ReactNode
  /** Says more about the property, on hover. */
  hint?: string
  /**
   * The value differs from the base design in the state being edited: its control draws the change mark
   * (`ChangeMark`), and the reset arrow puts the base design's value back.
   */
  changed?: boolean
  /** The selected layers have different values for it. */
  mixed?: boolean
  onReset?: () => void
  /** Half the section's width, beside another half row, as Opacity sits beside Radius. */
  half?: boolean
  /** Words or a button at the end of the name's row, as Each corner's toggle. */
  action?: ReactNode
  /**
   * The preset or token the row's value overrides, here: its control draws the change mark, as a changed state's does,
   * and the reset arrow (`onReset`) puts the preset's value back.
   */
  overrides?: string
  /**
   * A preset sets the row: locked to it until it's unlocked to override it. `open` is unlocked, its value editable;
   * `onOpenChange` is the lock button's at the end of the name's row.
   */
  lock?: { preset: string; open: boolean; onOpenChange: (open: boolean) => void }
  /** What the value is in other viewports, for the hint of the dot after the name that says it changes with them. */
  viewports?: string
  children: ReactNode
}

/** The row a property's name sits in: the toggle's height whether it has one or not, so rows side by side line up. */
const nameRow = "flex h-5 min-w-0 items-center justify-between gap-1 whitespace-nowrap"

/** A small button at the end of a field's name: Reset, Add a column, and what the toggles and menus there build on. */
export const nameButton =
  "grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3"

/** A button at the end of a field's name that opens a menu or a popover, shaded while it's open. */
export const nameMenuButton = `${nameButton} data-popup-open:bg-muted data-popup-open:text-foreground`

/**
 * One property: its name above the control, with the reset arrow, or the row's action, at the end of the name's row.
 * A value changed in a state, or set over a preset, marks its control with the change dot (`Changed`, PAR-1020). Rows
 * span a `FieldGrid`'s two columns unless `half`.
 */
export function Field({
  label,
  icon,
  hint,
  changed,
  mixed = false,
  onReset,
  half = false,
  action,
  overrides,
  lock,
  viewports,
  children
}: FieldProps) {
  const firstState = useContext(FirstStateName)
  const labelId = useId()
  const scrubs = useRef(new Set<Scrub>())
  const [scrub, setScrub] = useState<Scrub>()

  const register = useCallback((added: Scrub) => {
    scrubs.current.add(added)
    const only = () => setScrub(() => (scrubs.current.size === 1 ? [...scrubs.current][0] : undefined))
    only()

    return () => {
      scrubs.current.delete(added)
      only()
    }
  }, [])

  // A locked row's value can't be dragged, so its name doesn't scrub.
  const locked = lock !== undefined && !lock.open
  const dragsBy = locked ? undefined : scrub
  const outerChange = useChanged()
  let state: string | undefined
  let resetTo: string | undefined

  if (overrides !== undefined) {
    state = `overrides ${overrides}`
    resetTo = overrides
  } else if (changed) {
    state = "changed in this state"
    resetTo = firstState
  }

  if (locked) {
    state = `locked to ${lock.preset}`
  }

  const nameHint = state === undefined ? label : `${label}: ${state}`
  // What the name's color and hint say, in the row's name for a screen reader, which neither reaches.
  const said = [state, mixed && "different across the selected layers"].filter(Boolean).join(", ")

  // The row is a fieldset its name labels, so a screen reader says Size before W and H, and the row's own buttons.
  return (
    // Replay shows a row named as a secret, such as `apiKey`, as stars (replay.ts, PAR-679).
    <fieldset
      aria-labelledby={labelId}
      className={`flex min-w-0 flex-col gap-1 ${half ? "" : "col-span-2"}`}
      data-sentry-mask={isSecretName(label) ? "" : undefined}
    >
      <div className={nameRow}>
        <span className="flex min-w-0 items-center gap-1">
          {icon}
          <Hint
            label={nameHint}
            detail={[mixed && "Different across the selected layers", hint, dragsBy && "Drag to change it"]
              .filter(Boolean)
              .join("\n")}
            wait
          >
            <span
              id={labelId}
              className={`truncate text-xs text-muted-foreground ${dragsBy ? "cursor-ew-resize touch-none select-none" : ""}`}
              onPointerDown={dragsBy}
            >
              {label}
              {said !== "" && <span className="sr-only">, {said}</span>}
            </span>
          </Hint>
          {viewports !== undefined && (
            <Hint label="Changes with the viewport" detail={viewports}>
              <span className="grid size-3 shrink-0 place-items-center">
                <span aria-hidden className="size-1 rounded-full bg-muted-foreground" />
                <span className="sr-only">Changes with the viewport: {viewports}</span>
              </span>
            </Hint>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-0.5">
          {resetTo !== undefined && onReset && (
            <Hint label={`Reset to ${resetTo}`}>
              <button
                type="button"
                onClick={onReset}
                className={nameButton}
                aria-label={`Reset ${label} to ${resetTo}`}
              >
                <RotateCcw className="size-3" />
              </button>
            </Hint>
          )}
          {lock && overrides === undefined && (
            // A toggle, as NameToggle is: its name stays the same, and pressed says it's locked.
            <Hint label={`Lock to ${lock.preset}`}>
              <button
                type="button"
                data-lock
                onClick={() => lock.onOpenChange(!lock.open)}
                className={nameButton}
                aria-label={`Lock ${label} to ${lock.preset}`}
                aria-pressed={!lock.open}
              >
                {lock.open ? <LockOpen className="size-3" /> : <Lock className="size-3" />}
              </button>
            </Hint>
          )}
          {action}
        </span>
      </div>
      <RowScrub value={register}>
        {/*
          A changed or overridden value marks its control (PAR-1020), and a mark from outside stays where this row has
          none. Always wrapped, so a control isn't remade, losing its focus, as its value comes to be changed.
        */}
        <div className="min-w-0">
          <FieldLabelContext value={labelId}>
            <MixedContext value={mixed}>
              <Changed when={resetTo !== undefined || outerChange}>{children}</Changed>
            </MixedContext>
          </FieldLabelContext>
        </div>
      </RowScrub>
    </fieldset>
  )
}

/**
 * A section's rows on a grid of two columns, as the simpler fields lay them out: a row spans both unless it's `half`,
 * so two half rows sit side by side.
 */
export function FieldGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-x-2 gap-y-2.5 ${className}`}>{children}</div>
}

/** One of a few options a row's segments offer, with what it writes in its hint. */
export interface Segment<V extends string> {
  value: V
  label: string
  detail?: string
  /** Drawn in the label's place, which then names it for screen readers and in its hint. */
  icon?: ReactNode
  /** A mark in its corner, as a value that isn't Baseline has. */
  mark?: ReactNode
  /** What the document must store for it to be chosen; until it does, it's disabled. */
  part?: Unstorable
}

/**
 * A choice of one from a few, as segments in a box, the chosen one raised. Unset, the option it comes to anyway shows
 * faintly (`faint`), as an inherited keyword does. They share the row's width, or `fit` their content, as a set of
 * keywords or a short switch does. They take the keys IconSegments' toggle group does: one Tab stop, the arrow keys
 * moving between the options, Home and End to the first and last, and Enter or Space choosing.
 */
export function Segments<V extends string>({
  label,
  value,
  faint,
  fit = false,
  options,
  onChange
}: {
  label: string
  value: V | undefined
  faint?: V
  fit?: boolean
  options: readonly Segment<V>[]
  onChange: (value: V) => void
}) {
  const stores = useContext(StoresContext)
  const changed = useChanged()
  // The Tab stop: the chosen option, or the one unset comes to, or the first.
  const stop = options.find((option) => option.value === value)?.value ?? faint ?? options[0]?.value

  const move = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]

    if (!keys.includes(event.key) || !(event.target instanceof HTMLButtonElement)) {
      return
    }

    const buttons = [...event.currentTarget.querySelectorAll("button")]
    const at = buttons.indexOf(event.target)
    const by = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1
    let next = (at + by + buttons.length) % buttons.length

    if (event.key === "Home") {
      next = 0
    } else if (event.key === "End") {
      next = buttons.length - 1
    }

    event.preventDefault()
    buttons[next]?.focus()
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the arrow keys of the buttons inside, handled once for them all
    <fieldset
      aria-label={label}
      onKeyDown={move}
      className={`relative m-0 flex h-7 items-center gap-px rounded-md border p-0.5 ${fit ? "" : "min-w-0"}`}
    >
      {changed && <ChangeMark />}
      {options.map((option) => {
        const pressed = option.value === value
        let look = "text-muted-foreground hover:bg-accent/60 hover:text-foreground"

        if (pressed) {
          look = "bg-accent text-foreground shadow-xs"
        } else if (value === undefined && option.value === faint) {
          look = "bg-accent/40 text-muted-foreground"
        }

        return (
          <Hint key={option.value} label={option.label} detail={option.detail}>
            <button
              type="button"
              aria-label={option.label}
              aria-pressed={pressed}
              tabIndex={option.value === stop ? 0 : -1}
              disabled={option.part !== undefined && !stores(option.part)}
              onClick={() => onChange(option.value)}
              className={`h-full rounded-sm px-1 text-xs outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring ${fit ? "relative grid min-w-6 place-items-center" : "min-w-0 flex-1 truncate"} ${look}`}
            >
              {/* A sample drawn for the eye (AG, Ag), so the name says what it does. */}
              {option.icon === undefined ? option.label : <span aria-hidden>{option.icon}</span>}
              {option.mark}
            </button>
          </Hint>
        )
      })}
    </fieldset>
  )
}

/** A choice of one drawn as icons in a row, each named in its hint: Layout's Type, Position's Placement. */
export function IconSegments<V extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  /** Unset presses none, as for selected layers that differ. */
  value: V | undefined
  options: readonly (Segment<V> & { icon: ReactNode })[]
  onChange: (value: V) => void
}) {
  const stores = useContext(StoresContext)
  const changed = useChanged()

  return (
    <span className="relative flex w-fit">
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        aria-label={label}
        value={value === undefined ? [] : [value]}
        onValueChange={([next]) => {
          const chosen = options.find((option) => option.value === next)

          if (chosen) {
            onChange(chosen.value)
          }
        }}
      >
        {options.map((option) => (
          <Hint key={option.value} label={option.label} detail={option.detail}>
            <ToggleGroupItem
              value={option.value}
              aria-label={option.label}
              disabled={option.part !== undefined && !stores(option.part)}
              className="h-7 px-2"
            >
              {option.icon}
            </ToggleGroupItem>
          </Hint>
        ))}
      </ToggleGroup>
      {changed && <ChangeMark />}
    </span>
  )
}

/**
 * A setting that's on or off: its name as a row's name is drawn, and its switch at the end of the row, where a field's
 * reset arrow goes. Clicking the name flips it too.
 */
export function SwitchRow({
  label,
  icon,
  detail,
  changed = false,
  onReset,
  action,
  checked,
  onCheckedChange
}: {
  label: string
  /** A small mark before the name, as a prop's type. */
  icon?: ReactNode
  /** A button after the switch, as a prop's menu. */
  action?: ReactNode
  /** What it does, in the switch's hint. */
  detail?: string
  /** Changed in the state being edited: the change mark on the switch, and the reset arrow after it. */
  changed?: boolean
  onReset?: () => void
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const firstState = useContext(FirstStateName)
  const marked = useChanged() || changed

  return (
    <div className="col-span-2 flex h-5 min-w-0 items-center justify-between gap-2">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2">
        {icon && <span className="-mr-1 shrink-0">{icon}</span>}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {label}
          {changed && <span className="sr-only">, changed in this state</span>}
        </span>
        <span className="relative flex">
          <Hint label={label} detail={detail}>
            <Switch size="sm" aria-label={label} checked={checked} onCheckedChange={onCheckedChange} />
          </Hint>
          {marked && <ChangeMark />}
        </span>
      </label>
      {changed && onReset && (
        <Hint label={`Reset to ${firstState}`}>
          <button type="button" onClick={onReset} className={nameButton} aria-label={`Reset ${label} to ${firstState}`}>
            <RotateCcw className="size-3" />
          </button>
        </Hint>
      )}
      {action}
    </div>
  )
}

/* The glyphs and toggle a row's fields and name use */

/** A corner drawn as a field's glyph: the arc at that corner, from the top left, clockwise. */
export function CornerGlyph({ corner = 0 }: { corner?: 0 | 1 | 2 | 3 }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3" style={{ transform: `rotate(${corner * 90}deg)` }}>
      <path d="M1.5 11 V6 A4.5 4.5 0 0 1 6 1.5 H11" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/** A square's four sides, from the top, clockwise, each drawn apart from the rest as EachToggle draws them. */
const sidePaths = ["M3.5 1.5 H8.5", "M10.5 3.5 V8.5", "M3.5 10.5 H8.5", "M1.5 3.5 V8.5"]

/** Each whole edge of the glyph's box, from the top, clockwise, for the sides a field sets. */
const edgePaths = ["M2 2 H12", "M12 2 V12", "M2 12 H12", "M2 2 V12"]

/**
 * The sides a field sets, drawn thick along a faint box. Drawn rather than lettered or arrowed, so it reads in any
 * language and isn't taken for Line height's or Letter spacing's arrows.
 */
function SidesGlyph({ lit }: { lit: readonly number[] }) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5" fill="none" stroke="currentColor" strokeLinecap="round">
      <rect x="2" y="2" width="10" height="10" rx="1.5" strokeWidth="1" opacity="0.4" />
      {lit.map((index) => (
        <path key={index} d={edgePaths[index]} strokeWidth="2" />
      ))}
    </svg>
  )
}

/** The pair of sides a field sets: top and bottom, or left and right across. */
export function PairGlyph({ across = false }: { across?: boolean }) {
  return <SidesGlyph lit={across ? [1, 3] : [0, 2]} />
}

/** One side as a field's glyph, from the top (0), clockwise. */
export function SideGlyph({ side }: { side: number }) {
  return <SidesGlyph lit={[side]} />
}

/**
 * What a group's parts are, which its toggle draws: a rounded square's four corners, its four sides, or a grid's
 * columns or rows, each drawn apart from the rest.
 */
type Parts = "corners" | "sides" | "columns" | "rows"

const partsIcons: Record<Parts, string> = {
  corners:
    "M1.5 4.5 V3.5 A2 2 0 0 1 3.5 1.5 H4.5 M7.5 1.5 H8.5 A2 2 0 0 1 10.5 3.5 V4.5 M10.5 7.5 V8.5 A2 2 0 0 1 8.5 10.5 H7.5 M4.5 10.5 H3.5 A2 2 0 0 1 1.5 8.5 V7.5",
  sides: sidePaths.join(" "),
  columns: "M2 1.5 V10.5 M6 1.5 V10.5 M10 1.5 V10.5",
  rows: "M1.5 2 H10.5 M1.5 6 H10.5 M1.5 10 H10.5"
}

/**
 * The toggle at the end of a group's name row that opens every part, as Figma's and Penpot's do: an icon drawn as the
 * fields' own glyphs are, named in its hint (Each corner, Each side), and filled while every part is open. It's a
 * toggle, so its name stays the same and it says whether it's pressed.
 */
export function EachToggle({
  label,
  parts,
  pressed,
  onClick,
  ref
}: {
  /** Its name, in its hint and for screen readers: Each corner, Each side. */
  label: string
  parts: Parts
  pressed: boolean
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <NameToggle label={label} pressed={pressed} onClick={onClick} ref={ref}>
      <svg aria-hidden viewBox="0 0 12 12">
        <path d={partsIcons[parts]} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </NameToggle>
  )
}

/** A toggle at the end of a field's name, pressed while what it turns on is: Each side, or Insets' Fill and Scale with. */
export function NameToggle({
  label,
  pressed,
  onClick,
  ref,
  children
}: {
  /** Its name, in its hint and for screen readers. */
  label: string
  pressed: boolean
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
  children: ReactNode
}) {
  return (
    <Hint label={label}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className={`${nameButton} aria-pressed:bg-muted aria-pressed:text-foreground dark:hover:bg-input/40 dark:aria-pressed:bg-input/60`}
      >
        {children}
      </button>
    </Hint>
  )
}

/**
 * A menu at the end of a section's title or a row's name: More, as an ellipsis, or what `icon` draws, as Effects' Add.
 * `hinted` names it on hover too, where the icon alone doesn't say what it opens; `className` resizes its button, as a
 * row's taller one is, and `menuClassName` sizes the menu.
 */
export function TitleMenu({
  label,
  icon = <Ellipsis className="size-3.5" />,
  hinted = false,
  className = "size-6",
  menuClassName = "w-56",
  children
}: {
  label: string
  icon?: ReactNode
  hinted?: boolean
  className?: string
  menuClassName?: string
  children: ReactNode
}) {
  const trigger = (
    <DropdownMenuTrigger
      aria-label={label}
      className={`grid place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent ${className}`}
    >
      {icon}
    </DropdownMenuTrigger>
  )

  return (
    <DropdownMenu>
      {hinted ? <Hint label={label}>{trigger}</Hint> : trigger}
      <DropdownMenuContent align="end" className={menuClassName}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A section title's + or −, for a section that starts empty (Fill, Stroke, Effects): Add or Remove `what`, which its
 * hint says too, or `hint` where there's more to say, as a mixed selection's Replace. It takes a trigger's props, so a
 * menu can open from it.
 */
export function SectionButton({
  adds = true,
  what,
  hint,
  ...props
}: { adds?: boolean; what: string; hint?: string } & Omit<ComponentProps<typeof Button>, "children">) {
  const label = adds ? `Add ${what}` : `Remove ${what}`

  return (
    <Hint label={hint ?? label}>
      <Button variant="ghost" size="icon-sm" className="size-6" aria-label={label} {...props}>
        {adds ? <Plus /> : <Minus />}
      </Button>
    </Hint>
  )
}
