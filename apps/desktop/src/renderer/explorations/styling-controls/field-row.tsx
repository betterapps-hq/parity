import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, Switch } from "@buildkitgg/shadcn-baseui-kit"
import { Ellipsis, Lock, LockOpen, RotateCcw } from "lucide-react"
import {
  createContext,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { FirstStateName } from "../../chrome/fields.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { overrideColor } from "./field-parts.tsx"

/*
 * A property's row as the simpler fields lay it out (PAR-186): its name above the control in words, as Figma's with
 * property labels on and Plasmic's are, rather than in a column to its left. Two rows marked `half` sit side by side in
 * a section's grid (`FieldGrid`). Dragging the name scrubs the row's one draggable field, and a reset arrow at the end of
 * the name's row puts back a value a state changed. It takes the app's Field's props, so a control moves onto it by its
 * import; the app's own panel keeps its Field until this is approved. A row a typography preset sets (call 6) is locked
 * to it, with Unlock at the end of the name's row, and a row that overrides it has its name and value in the override
 * color with a reset arrow; a dot after the name says the value changes with the viewport.
 */

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
  /** Says more about the property, on hover. */
  hint?: string
  /** The value differs from the base design in the state being edited. */
  changed?: boolean
  /** The selected layers have different values for it. */
  mixed?: boolean
  onReset?: () => void
  /** Half the section's width, beside another half row, as Opacity sits beside Radius. */
  half?: boolean
  /** Words or a button at the end of the name's row, as Each corner's toggle. */
  action?: ReactNode
  /**
   * The preset or token the row's value overrides, here: the name and value in the override color, and the reset arrow
   * (`onReset`) puts the preset's value back.
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

/**
 * One property: its name above the control, with the reset arrow, or the row's action, at the end of the name's row.
 * A name in the agent color says a state changed the value, and one in the override color, with the value, that it
 * overrides a preset. Rows span a `FieldGrid`'s two columns unless `half`.
 */
export function Field({
  label,
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
  let nameHint = label
  let tone: string | undefined
  let resetTo: string | undefined

  if (overrides !== undefined) {
    nameHint = `${label}: overrides ${overrides}`
    tone = overrideColor
    resetTo = overrides
  } else if (changed) {
    nameHint = `${label}: changed in this state`
    tone = kindColors.agent
    resetTo = firstState
  }

  if (locked) {
    nameHint = `${label}: locked to ${lock.preset}`
  }

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${half ? "" : "col-span-2"}`}>
      <div className={nameRow}>
        <span className="flex min-w-0 items-center gap-1">
          <Hint
            label={nameHint}
            detail={[mixed && "Different across the selected layers", hint, dragsBy && "Drag to change it"]
              .filter(Boolean)
              .join("\n")}
            wait
          >
            <span
              className={`truncate text-xs text-muted-foreground ${dragsBy ? "cursor-ew-resize touch-none select-none" : ""}`}
              style={tone ? { color: tone } : undefined}
              onPointerDown={dragsBy}
            >
              {label}
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
                className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                style={overrides === undefined ? undefined : { color: tone }}
                aria-label={`Reset ${label} to ${resetTo}`}
              >
                <RotateCcw className="size-3" />
              </button>
            </Hint>
          )}
          {lock && overrides === undefined && (
            <Hint label={lock.open ? `Lock to ${lock.preset}` : "Unlock to override it"}>
              <button
                type="button"
                data-lock
                onClick={() => lock.onOpenChange(!lock.open)}
                className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={
                  lock.open ? `Lock ${label} to ${lock.preset}` : `Unlock ${label} to override ${lock.preset}`
                }
              >
                {lock.open ? <LockOpen className="size-3" /> : <Lock className="size-3" />}
              </button>
            </Hint>
          )}
          {action}
        </span>
      </div>
      <RowScrub value={register}>
        {/* An override's value is drawn in the override color too: the field's text and a token's pill inherit it. */}
        <div className="min-w-0" style={tone && overrides !== undefined ? { color: tone } : undefined}>
          {children}
        </div>
      </RowScrub>
    </div>
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
}

/**
 * Two or three options as segments across the row, drawn as the keyword toggles are: the one chosen raised, each named
 * in its hint with what it writes. One click changes it, where a menu would take two.
 */
export function Segments<V extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: V
  options: readonly Segment<V>[]
  onChange: (value: V) => void
}) {
  return (
    <fieldset aria-label={label} className="m-0 flex h-7 min-w-0 items-center gap-px rounded-md border p-0.5">
      {options.map((option) => {
        const pressed = option.value === value

        return (
          <Hint key={option.value} label={option.label} detail={option.detail}>
            <button
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(option.value)}
              className={`h-full min-w-0 flex-1 truncate rounded-sm px-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring ${pressed ? "bg-accent text-foreground shadow-xs" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
            >
              {option.label}
            </button>
          </Hint>
        )
      })}
    </fieldset>
  )
}

/**
 * A setting that's on or off: its name as a row's name is drawn, and its switch at the end of the row, where a field's
 * reset arrow goes. Clicking the name flips it too.
 */
export function SwitchRow({
  label,
  detail,
  checked,
  onCheckedChange
}: {
  label: string
  /** What it does, in the switch's hint. */
  detail?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label className="col-span-2 flex h-5 min-w-0 cursor-pointer items-center justify-between gap-2">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <Hint label={label} detail={detail}>
        <Switch size="sm" aria-label={label} checked={checked} onCheckedChange={onCheckedChange} />
      </Hint>
    </label>
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
    <Hint label={label}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted aria-pressed:text-foreground dark:hover:bg-input/40 dark:aria-pressed:bg-input/60"
      >
        <svg aria-hidden viewBox="0 0 12 12" className="size-3">
          <path d={partsIcons[parts]} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
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
