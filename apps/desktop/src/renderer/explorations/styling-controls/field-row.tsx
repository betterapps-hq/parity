import { Lock, LockOpen, RotateCcw } from "lucide-react"
import {
  createContext,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
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
    if (!register || !has) return undefined
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
  if (locked) nameHint = `${label}: locked to ${lock.preset}`
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
              className={`truncate text-[11px] text-muted-foreground ${dragsBy ? "cursor-ew-resize touch-none select-none" : ""}`}
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
