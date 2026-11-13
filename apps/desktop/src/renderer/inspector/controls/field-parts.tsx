import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { scrubSteps } from "@parity-app/core"
import { formatNumber } from "@parity-app/style-schema"
import type { PreviewKind } from "@parity-app/tokens"
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  SunMoon,
  TriangleAlert,
  Unlink,
  X
} from "lucide-react"
import {
  createContext,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState
} from "react"
import { kindColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { textValue } from "../../chrome/prop-values.ts"
import { moving, onPaper, paper, TokenArt } from "../../chrome/token-previews.tsx"
import { clamp, stepSpacing } from "./css-values.ts"
import { type FieldSessionEvent, relativeUpdate } from "./edit-session.ts"
import { useRowScrub } from "./field-row.tsx"
import type { ImageSource } from "./image-fill.tsx"
import { inScaleOrder, tokenNamed } from "./token-scale.ts"
import { type FieldToken, type LengthToken, lengthToken, type TokenSetName, type TokenSets } from "./tokens.ts"

/*
 * The one field every styling control builds on, as PAR-652's design-options-fields.md sets its anatomy: an inner
 * label or icon that scrubs, the value or a token's chip, the unit, what it comes to faintly, one status slot, and the
 * token button, with the line under the row where it says things. Around it are the parts the field is made of, which
 * a control that isn't a plain field (a list entry, a menu, a box) uses on its own: typing that's checked before it's
 * stored, scrubbing and dragging, the chip, the token list, the status marks, and the project's tokens.
 */

/* Messages and typing */

// The parsers are data in and data out, so they live with the other typing that data code reads; fields import them
// from here too.
export { readNumber, readUnitNumber } from "./typing.ts"

/** A button after a message's text: the other reading ("Did you mean 24px?"), or the nearest token. */
export interface MessageAction {
  label: ReactNode
  run: () => void
}

/** What a field says under its row: why it can't read what's typed, what it did, or a question with an answer. */
export interface Message {
  tone: "error" | "note"
  text: string
  action?: MessageAction
}

/** What a field makes of what's typed: the value to store, with anything it says about it, or why it can't. */
export type Reading<T> = { value: T; message?: Message } | { reason: string; action?: MessageAction }

/** The line under a row of fields, which they share for their messages, as each would have its own. */
export interface SharedLine {
  message: Message | undefined
  onMessage: (message: Message | undefined) => void
}

/** The way each arrow key moves across and down. */
export const arrowMoves = new Map<string, [number, number]>([
  ["ArrowLeft", [-1, 0]],
  ["ArrowRight", [1, 0]],
  ["ArrowUp", [0, -1]],
  ["ArrowDown", [0, 1]]
])

/**
 * How a field's changes reach what it edits while they're under way, where that can show a change before making it, as
 * the Design tab's edit session can (`edit-session.ts`). Without it, each change is made as it comes, as the stories'
 * drafts take them.
 */
export interface LiveEdits {
  /** Says what happened in the field, running `change` to find what it edits: a preview, a step, the made value. */
  send: (event: FieldSessionEvent, change?: () => void) => void
}

/** The live edits the fields inside make their changes through, as the Design tab's sections provide them. */
export const LiveEditsContext = createContext<LiveEdits | undefined>(undefined)

/** The live edits a control's changes go through, where the Design tab's sections give them; none in the stories. */
export const useLiveEdits = () => useContext(LiveEditsContext)

/**
 * The parts of the approved controls whose values the document the panel edits can't store yet, each added by one of
 * PAR-924 to PAR-935. The stories store everything, so they show every control working.
 */
export type Unstorable =
  | "aspect"
  | "reverse"
  | "lines"
  | "dense"
  | "baseline"
  | "trackSizes"
  | "fixedPlacement"
  | "pinCenter"
  | "pinScale"
  | "cornerShape"
  | "eachCorner"
  | "blend"
  | "alpha"
  | "eachSide"
  | "strokePosition"
  | "preset"
  | "smallCaps"
  | "tag"
  | "scrollAlways"

/** Whether the document stores a part's value; unset, as in the stories, it stores every part. */
export const StoresContext = createContext<(part: Unstorable) => boolean>(() => true)

/**
 * A part of a control the document can't store yet, shown as the approved design has it but disabled and dimmed, so
 * the section matches its story while the property waits for its issue. Without a part, it's always stored.
 */
export function Unstored({ part, children }: { part: Unstorable | undefined; children: ReactNode }) {
  const stores = useContext(StoresContext)

  if (part === undefined || stores(part)) {
    return children
  }

  return (
    <fieldset disabled className="contents *:opacity-50">
      {children}
    </fieldset>
  )
}

/**
 * Text typed into a field, checked before it's stored: `read` gives what to store, or the reason it can't. Text it
 * can't read stays, outlined, with the reason under the row in the error's red, whether Enter is pressed or the field is
 * left, until it's typed in again or Escape puts the value back. Up and Down step the value, ending any typing. Fields that say things on one line under their row
 * together, as a color's channels do, pass that line as `line`; each still outlines itself.
 */
export function useTyped<T>({
  shown,
  read,
  onCommit,
  onStep,
  line,
  quiet = false
}: {
  label: string
  /** The value as the field shows it at rest, which Escape puts back. */
  shown: string
  read: (text: string) => Reading<T>
  onCommit: (value: T) => void
  onStep?: (up: boolean, shift: boolean, alt: boolean) => void
  /** A line under the row that several fields share, in place of the field's own. */
  line?: SharedLine
  /** Leaving with text it can't read puts the value back saying nothing, as a search does: a field locked to tokens. */
  quiet?: boolean
}) {
  const [typed, setTypedState] = useState<string>()
  // What's typed as of now, not as of the last render: Enter commits and leaves the field at once, and leaving reads
  // what's typed again, so it finds it already taken rather than committing it twice.
  const typedNow = useRef<string>(undefined)
  const live = useContext(LiveEditsContext)
  const liveNow = useRef(live)
  useEffect(() => {
    liveNow.current = live
  })
  // What's typed doesn't outlive its field on the canvas, as when the row it's in goes while it's typed in.
  useEffect(
    () => () => {
      if (typedNow.current !== undefined) {
        liveNow.current?.send({ type: "hide" })
      }
    },
    []
  )

  const cancelPreview = () => live?.send({ type: "hide" })

  // Each keystroke that reads shows on the canvas at once, as the app's fields always have (CAN-48).
  const previewTyped = (text: string) => {
    if (!live) {
      return
    }

    const outcome = read(text)

    if ("value" in outcome) {
      live.send({ type: "show" }, () => onCommit(outcome.value))
    } else {
      cancelPreview()
    }
  }

  // Made, the edit takes the preview's place: one undo step.
  const make = (value: T) => (live ? live.send({ type: "make" }, () => onCommit(value)) : onCommit(value))

  const [focused, setFocused] = useState(false)
  const [ownMessage, setOwnMessage] = useState<Message>()
  const [failed, setFailed] = useState(false)
  const message = line ? line.message : ownMessage

  const setTyped = (next: string | undefined) => {
    typedNow.current = next
    setTypedState(next)
  }

  const setMessage = (next: Message | undefined) => {
    setFailed(next?.tone === "error")
    // Once its answer is taken ("Use 24px", the nearest token), the message has been answered, so it goes.
    const action = next?.action
    const said = next && action ? { ...next, action: { ...action, run: () => answer(action) } } : next

    if (line) {
      line.onMessage(said)
    } else {
      setOwnMessage(said)
    }
  }

  const answer = (action: MessageAction) => {
    action.run()
    setTyped(undefined)
    setMessage(undefined)
  }

  const error = failed

  const commit = (leaving: boolean): boolean => {
    const text = typedNow.current

    if (text === undefined) {
      return true
    }

    const outcome = read(text)

    if ("value" in outcome) {
      make(outcome.value)
      setMessage(outcome.message)
    } else if (leaving && quiet) {
      setMessage(undefined)
    } else {
      // What it can't read stays as typed, leaving or not, with the reason in the error's red, until it's typed in
      // again or Escape puts the value back.
      cancelPreview()
      setMessage({ tone: "error", text: outcome.reason, action: outcome.action })

      return false
    }

    if (!("value" in outcome)) {
      cancelPreview()
    }

    setTyped(undefined)

    return true
  }

  return {
    text: typed ?? shown,
    typed,
    focused,
    error,
    message,
    setMessage,
    setTyped,
    input: {
      value: typed ?? shown,
      "aria-invalid": error || undefined,
      onChange: (event: { target: { value: string } }) => {
        setTyped(event.target.value)
        previewTyped(event.target.value)
      },
      onFocus: () => {
        setFocused(true)

        if (message?.tone === "note" && message.action === undefined) {
          setMessage(undefined)
        }
      },
      onBlur: () => {
        setFocused(false)
        commit(true)
        live?.send({ type: "end" })
      },
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" && commit(false)) {
          event.currentTarget.blur()
        }

        if (event.key === "Escape" && typed !== undefined) {
          event.stopPropagation()
          cancelPreview()
          setTyped(undefined)
          // Escape is asked for, so putting the value back says nothing; it clears what was said.
          setMessage(undefined)
        } else if (event.key === "Escape" && !event.defaultPrevented) {
          // With nothing typed, Escape takes back a run of Up and Down presses and leaves the field, so the canvas's
          // keys, Undo among them, reach the app again.
          live?.send({ type: "cancel" })
          event.currentTarget.blur()
        }

        if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault()
          setTyped(undefined)
          setMessage(undefined)
          const up = event.key === "ArrowUp"
          const { shiftKey, altKey } = event

          if (live) {
            live.send({ type: "step" }, () => onStep(up, shiftKey, altKey))
          } else {
            onStep(up, shiftKey, altKey)
          }
        }
      }
    }
  }
}

/**
 * Focuses what it's on once, as it's drawn, as a form a menu row opens is typed into at once. Once, not on every
 * render, so pointing at or focusing another row of the menu, which draws it again, doesn't take the focus back.
 */
function useFocusOnMount<E extends HTMLElement>() {
  const ref = useRef<E>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])

  return ref
}

/**
 * Why a value is allowed here, typed as Allow here asks: a sentence, so it wraps and grows, with a handle to drag it
 * taller. Enter submits its form; Shift+Enter starts a line.
 */
function ReasonBox({ reason, onReason }: { reason: string; onReason: (reason: string) => void }) {
  const box = useFocusOnMount<HTMLTextAreaElement>()

  return (
    <textarea
      ref={box}
      aria-label="Why it's allowed here"
      placeholder="Photo backdrop"
      rows={1}
      value={reason}
      onChange={(event) => onReason(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.shiftKey) {
          return
        }

        event.preventDefault()
        event.currentTarget.form?.requestSubmit()
      }}
      className={`${wrappingText} min-h-7 resize-y rounded-md border border-input bg-transparent px-2 py-1 text-xs leading-snug outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30`}
    />
  )
}

/**
 * What a field says under its row, with its answer button when it asks something. It spans a grid's row, and the
 * button runs on after the words as part of the sentence, so a short message is one line across the whole row. It's
 * there with nothing in it while there's nothing to say, out of the layout, so a screen reader hears what it says once
 * it says it; `id` lets the field it's for point at it (`aria-describedby`) while it does.
 */
export function MessageLine({ message, id }: { message: Message | undefined; id?: string }) {
  const error = message?.tone === "error"
  let look = "sr-only"

  if (message) {
    look = `col-span-full mt-1 type-message ${error ? "text-destructive" : "text-muted-foreground"}`
  }

  return (
    <output id={id} aria-live={error ? "assertive" : "polite"} className={`block ${look}`}>
      {message?.text}
      {message?.action && " "}
      {message?.action && (
        <button
          type="button"
          // Pressing it leaves the typing where it is, so the field doesn't put its value back and move the answer away.
          onMouseDown={(event) => event.preventDefault()}
          onClick={message.action.run}
          className="inline-flex items-center gap-1 rounded align-middle font-medium text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {message.action.label}
        </button>
      )}
    </output>
  )
}

/**
 * What Tokens only says under a value of its own, which is kept: "Not a token.", whether a token matches it or is only
 * near, and Use with that token, a color's swatch before its name, or what another kind comes to after it (Use
 * radius-xl 14px), since their marks are too small to read at a message's size.
 */
export function notAToken(nearest: FieldToken, onUse: () => void, same = false) {
  const color = nearest.kind === "color"

  return {
    reason: same ? "Not a token. One matches." : "Not a token. One is near.",
    action: {
      label: (
        <>
          {color && <TokenMark kind="color" value={nearest.value} width={14} height={10} />}
          Use {nearest.name}
          {!color && <span className="font-normal text-muted-foreground">{nearest.detail}</span>}
        </>
      ),
      run: onUse
    }
  }
}

/**
 * What Tokens only says under a value off a field's steps, where the steps are on the system, as a side's whole pixels
 * are: "Not a step." and Use with the nearest step (`14px`). A field's `refusal` takes it.
 */
export function notAStep(nearest: string, onUse: () => void) {
  return { reason: "Not a step.", action: { label: `Use ${nearest}`, run: onUse } }
}

/* Scrubbing and dragging */

/** The keys held while a value is stepped or scrubbed: Shift for bigger steps, Alt for the opposite side or a fine step. */
export interface ScrubKeys {
  shift: boolean
  alt: boolean
}

/**
 * How a drag of a field's label changes its value: by `step` per screen pixel (`shiftStep` with Shift, `altStep` with
 * Alt), a whole spacing step per 2 screen pixels (`spacing`, with core's `scrubSteps`), or a step function of its own
 * (`move`), which tokens in scale order or an angle's units need.
 */
export type ScrubBy = (
  | { step: number; shiftStep: number; altStep?: number }
  | { spacing: true }
  | { move: (start: number, dx: number, keys: ScrubKeys) => number }
) & { min?: number; max?: number }

/** What a field's label scrubs: the value it starts from, and what to do with each value the drag comes to. */
export interface Scrub {
  from: () => number
  apply: (value: number, keys: ScrubKeys) => void
  by: ScrubBy
}

function scrubbed(start: number, dx: number, keys: ScrubKeys, by: ScrubBy): number {
  if ("move" in by) {
    return by.move(start, dx, keys)
  }

  if ("spacing" in by) {
    return stepSpacing(start, scrubSteps(dx, keys.shift))
  }

  let per = by.step

  if (keys.shift) {
    per = by.shiftStep
  } else if (keys.alt && by.altStep !== undefined) {
    per = by.altStep
  }

  return start + Math.trunc(dx) * per
}

/**
 * Dragging a label left or right to change a value, as design-options-fields.md's Keys and scrubbing sets: one step per
 * screen pixel, or a spacing step per two, ten with Shift. `apply` gets the keys held, so Four sides can change the
 * opposite side with Alt.
 */
export function scrub(
  from: () => number,
  apply: (value: number, keys: ScrubKeys) => void,
  by: ScrubBy,
  live?: LiveEdits,
  each?: (update: (own: number) => number, keys: ScrubKeys) => void
): (event: ReactPointerEvent<Element>) => void {
  // A value held to the field's limits, to a ten-thousandth.
  const settle = (value: number) => Math.round(clamp(value, by.min ?? -Infinity, by.max ?? Infinity) * 10_000) / 10_000

  return (event) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    const start = from()
    // With live edits, the drag previews as it goes and makes its last value once, on release: one undo step. Escape,
    // or the pointer being cancelled, puts the value back.
    let last: (() => void) | undefined
    live?.send({ type: "end" })
    drag(event, {
      escapes: live !== undefined,
      move: ({ dx, shift, alt }) => {
        const keys = { shift, alt }
        const value = settle(scrubbed(start, dx, keys, by))
        // Where the layers differ, each moves from its own value.
        const change = each ? () => each((own) => settle(scrubbed(own, dx, keys, by)), keys) : () => apply(value, keys)

        if (live) {
          last = change
          live.send({ type: "show" }, change)
        } else {
          change()
        }
      },
      end: (_point, cancelled) => {
        if (!live || !last) {
          return
        }

        if (cancelled) {
          live.send({ type: "cancel" })
        } else {
          live.send({ type: "make" }, last)
        }
      }
    })
  }
}

/** A value moved by one press of Up or Down, as a drag of its label moves it: one step, ten with Shift. */
export function pressed(own: number, up: boolean, keys: ScrubKeys, by: ScrubBy): number {
  // A spacing step is two pixels of drag; anything else, one.
  const next = scrubbed(own, (up ? 1 : -1) * ("spacing" in by ? 2 : 1), keys, by)

  return Math.round(clamp(next, by.min ?? -Infinity, by.max ?? Infinity) * 10_000) / 10_000
}

/** Where a dragging pointer is. */
export interface DragPoint {
  clientX: number
  clientY: number
  /** How far it's moved since the press, in screen pixels. */
  dx: number
  dy: number
  /** Where it is across the box (`within`, or the element pressed), from 0 at its left or top to 1, held to the box. */
  x: number
  y: number
  shift: boolean
  alt: boolean
}

/**
 * Follows a pointer from a press on an element until it's let go or the browser cancels it, capturing it so the drag
 * keeps going outside the element. Every drag in the controls goes through this, so none is left listening after a
 * cancelled one. With `press`, the press itself counts as the first move, so a click sets a position. With `escapes`,
 * Escape cancels it too, and goes no further. With `runs`, the live edits a control's drag goes through, each move's
 * edit is made at once, so the control follows the pointer, and the drag is one undo step that Escape or the pointer
 * being cancelled takes back, as a run of Up and Down presses is.
 */
export function drag(
  event: ReactPointerEvent<Element>,
  {
    move,
    end,
    within,
    press = false,
    escapes = false,
    runs
  }: {
    move: (point: DragPoint) => void
    end?: (point: DragPoint, cancelled: boolean) => void
    within?: Element | null
    press?: boolean
    escapes?: boolean
    runs?: LiveEdits
  }
): void {
  if (event.button !== 0) {
    return
  }

  const target = event.currentTarget
  const box = (within ?? target).getBoundingClientRect()
  const start = { x: event.clientX, y: event.clientY }

  const at = (pointer: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean }): DragPoint => ({
    clientX: pointer.clientX,
    clientY: pointer.clientY,
    dx: pointer.clientX - start.x,
    dy: pointer.clientY - start.y,
    x: clamp((pointer.clientX - box.left) / (box.width || 1), 0, 1),
    y: clamp((pointer.clientY - box.top) / (box.height || 1), 0, 1),
    shift: pointer.shiftKey,
    alt: pointer.altKey
  })

  let last = at(event)
  target.setPointerCapture(event.pointerId)
  const moveTo = (point: DragPoint) => (runs ? runs.send({ type: "step" }, () => move(point)) : move(point))

  // A field focused before the press ends its own edit as it loses focus, before the drag's run begins, so it can't end
  // the run halfway, as it would once the press moves the focus.
  if (runs && target instanceof HTMLElement && target.tabIndex >= 0) {
    target.focus()
  } else if (runs && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }

  runs?.send({ type: "end" })

  if (press) {
    moveTo(last)
  }

  const onMove = (moveEvent: Event) => {
    if (!(moveEvent instanceof MouseEvent)) {
      return
    }

    last = at(moveEvent)
    moveTo(last)
  }

  const stop = (cancelled: boolean) => {
    target.removeEventListener("pointermove", onMove)
    target.removeEventListener("pointerup", onUp)
    target.removeEventListener("pointercancel", onCancel)
    window.removeEventListener("keydown", onKey, true)

    // What the drag does as it ends, as a stop dragged off its bar is removed, is part of its step.
    if (runs && !cancelled) {
      runs.send({ type: "step" }, () => end?.(last, cancelled))
      runs.send({ type: "end" })
    } else {
      runs?.send({ type: "cancel" })
      end?.(last, cancelled)
    }
  }

  const onUp = () => stop(false)
  const onCancel = () => stop(true)

  const onKey = (keyEvent: globalThis.KeyboardEvent) => {
    if (keyEvent.key === "Escape") {
      keyEvent.preventDefault()
      keyEvent.stopPropagation()
      stop(true)
    }
  }

  target.addEventListener("pointermove", onMove)
  target.addEventListener("pointerup", onUp)
  target.addEventListener("pointercancel", onCancel)

  if (escapes || runs) {
    window.addEventListener("keydown", onKey, true)
  }
}

/**
 * The color of a value a layer sets over a token or preset it follows (design-options-fields.md's Overrides part of a
 * token): a typography preset's overridden row, a shadow token's color, and the dot on the token's pill. It's the
 * component color, as an instance's overrides are drawn, which PAR-707's typography presets settled on.
 */
export const overrideColor = kindColors.component

/**
 * Whether the controls inside hold a value changed from what it comes from: changed in the state being edited, or set
 * over a token or preset (PAR-1020). Each control draws `ChangeMark` on its corner, so a row marks its control, or the
 * one part of it that changed, without passing it down.
 */
const ChangedContext = createContext(false)

export function Changed({ when = true, children }: { when?: boolean; children: ReactNode }) {
  return <ChangedContext value={when}>{children}</ChangedContext>
}

/** Whether the control holds a changed value, as `Changed` around it says. */
export const useChanged = () => useContext(ChangedContext)

/**
 * A changed value's mark: a dot over the corner of the control that holds it, in `overrideColor`, as a token's pill
 * marks a part changed. It's drawn above what the control draws, as a switch's thumb, and its control's row says it
 * in words, so the dot is for the eye alone.
 */
export function ChangeMark() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -top-0.5 -right-0.5 z-10 size-1.5 rounded-full ring-1 ring-background"
      style={{ background: overrideColor }}
    />
  )
}

/* The field's box */

/**
 * The field's box, as the simpler fields draw it (PAR-186): filled, with no border; hovering outlines it faintly,
 * focus outlines it in the ring's color, and an error in red, which hovering leaves. Nothing in it moves on hover.
 */
export function fieldBox(error: boolean, extra = ""): string {
  const ring = error
    ? "ring-1 ring-destructive"
    : "hover:not-focus-within:ring-1 hover:not-focus-within:ring-border focus-within:ring-1 focus-within:ring-ring"

  return `group/field relative flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-muted/50 px-2 text-xs ring-inset dark:bg-input/40 ${ring} ${extra}`
}

/**
 * Detach over the end of a field that holds a token but offers no list of them, faded in while the field's hovered or
 * focused, when the field makes room for it (`pr-7`) and a mark at the end moves aside. Hidden, it takes no clicks.
 */
export const fieldEndButton =
  "pointer-events-none absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 outline-none group-focus-within/field:pointer-events-auto group-focus-within/field:opacity-100 group-hover/field:pointer-events-auto group-hover/field:opacity-100 hover:bg-background/70 hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring data-popup-open:pointer-events-auto data-popup-open:opacity-100"

/**
 * A field's chevron, which opens its tokens or picker: always shown at the box's end, so it's never found by hovering,
 * the room it needs is never seen empty, and nothing moves as the pointer comes to a unit's menu.
 */
const fieldEndButtonShown = fieldEndButton.replace("pointer-events-none ", "").replace(" opacity-0", "")

/**
 * Text longer than a field's line holds, as a CSS row's value or an expression: it wraps and grows with its text, a
 * line at a time, so none of it is cut off. A box for free text (Classes, a reason) adds `resize-y`, a handle to drag
 * it taller.
 */
export const wrappingText = "field-sizing-content resize-none [overflow-wrap:anywhere]"

/** A bare field's box (ValueField's `bare`): no border until hovered or focused, or while it's in error. */
function bareBox(error: boolean, extra: string): string {
  const edge = error
    ? "border-destructive focus-within:ring-destructive/40"
    : "border-transparent hover:border-input focus-within:border-input focus-within:ring-ring"

  return `group/field flex h-6 min-w-0 items-center justify-center gap-1 rounded-md border bg-transparent px-1 text-xs focus-within:ring-2 ${edge} ${extra}`
}

const inputBase = "w-0 flex-1 bg-transparent tabular-nums outline-none placeholder:text-muted-foreground"

/** The input inside a field's box. */
export const fieldInput = `${inputBase} min-w-0`

/**
 * A unit that opens the field's unit and mode menu (slot 3), as Webflow's unit does: at the box's end at rest, and
 * beside its end button while that shows, so it's drawn as the end button is rather than against the box's edge.
 */
export const unitButtonClass =
  "-mx-1 grid h-5 shrink-0 place-items-center rounded px-1 text-muted-foreground outline-none hover:bg-background/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-background/70 data-popup-open:text-foreground"

/**
 * A field's unit as a button that opens its unit menu (slot 3), for ValueField's `unit`: the units the field takes,
 * each with what it is, as Line height's ×, px and % are, then a keyword after them where the field takes one (Auto).
 * Choosing a unit shows the value in it.
 */
export function UnitMenu<U extends string>({
  label,
  unit,
  units,
  extra,
  onUnit
}: {
  /** The field's name, for the button's accessible name. */
  label: string
  unit: U
  units: readonly { unit: U; label: string }[]
  extra?: { label: string; run: () => void }
  onUnit: (unit: U) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`${label} unit: ${unit}`} className={unitButtonClass}>
        {unit}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup
          value={unit}
          onValueChange={(next) => {
            const chosen = units.find((each) => each.unit === next)

            if (chosen) {
              onUnit(chosen.unit)
            }
          }}
        >
          {units.map((each) => (
            // Choosing a unit is done, so the menu closes, as a menu item's does.
            <DropdownMenuRadioItem key={each.unit} value={each.unit} closeOnClick className="text-xs">
              <span className="w-7 font-mono">{each.unit}</span>
              {each.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {extra && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs" onClick={extra.run}>
              {extra.label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* Status marks */

/** The status slot's mark for input the field can't read. */
export function InvalidMark() {
  return <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />
}

/**
 * The status slot's mark for a token the project no longer has, which the chip strikes through, or for something else
 * it lacks, as a font the frame can't load, which `description` says. With `actions`, it opens a menu of them, as a
 * missing font's Replace and Add font.
 */
export function MissingMark({
  name,
  description = "The project has no token by this name now. Choose another.",
  actions
}: {
  name: string
  /** What's missing and what's drawn instead; a missing token's words unless said. */
  description?: string
  actions?: readonly { label: string; run: () => void }[]
}) {
  const [open, setOpen] = useState(false)

  if (!actions || actions.length === 0) {
    return (
      <Hint label={`${name} is missing`} detail={description}>
        <span className="grid size-5 shrink-0 place-items-center text-amber-600 dark:text-amber-400">
          <CircleDashed aria-label={`${name} is missing`} className="size-3.5" />
        </span>
      </Hint>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Hint label={`${name} is missing`} detail={description}>
        <PopoverTrigger
          aria-label={`${name} is missing`}
          className="grid size-5 shrink-0 place-items-center rounded-md text-amber-600 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-popup-open:bg-accent dark:text-amber-400"
        >
          <CircleDashed className="size-3.5" />
        </PopoverTrigger>
      </Hint>
      <PopoverContent aria-label={`${name} is missing`} className="w-60 gap-1 p-1" align="end">
        <p className="px-2 pt-1 pb-1.5 type-description text-muted-foreground">{description}</p>
        {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the arrow keys of the buttons inside, handled once for them all */}
        <div className="flex flex-col" onKeyDown={moveThroughRows}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={menuRow}
              onClick={() => {
                action.run()
                setOpen(false)
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The status slot's mark for a value set for one theme, with the theme's value in its hint. */
export function ThemeMark({ label, theme }: { label: string; theme: { name: string; value: string } }) {
  return (
    <Hint label={`Set for ${theme.name}`} detail={`${theme.name}: ${theme.value}`}>
      <button
        type="button"
        aria-label={`${label} is set for ${theme.name}: ${theme.value}`}
        className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SunMoon className="size-3.5" />
      </button>
    </Hint>
  )
}

/** A row whose value does nothing here: dimmed whole, with why in its hint (principle 10). */
export function DoesNothing({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <Hint label="Does nothing here" detail={reason}>
      <div className="opacity-50">
        <span className="sr-only">Does nothing here. {reason}</span>
        {children}
      </div>
    </Hint>
  )
}

/**
 * The † itself, in the one color every not-Baseline mark has, for a mark that sits where its control's own hint says
 * why (a segmented option's corner). Elsewhere, use NotBaseline, which says why in the mark's hint.
 */
export function NotBaselineMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`text-amber-600 dark:text-amber-400 ${className}`}>
      †
    </span>
  )
}

/** † after a property or value that isn't Baseline, with which browsers draw it in its hint (principle 7). */
export function NotBaseline({ what, browsers = "Chromium" }: { what: string; browsers?: string }) {
  return (
    <Hint label={`${what} isn't Baseline`} detail={`Only ${browsers} draws it; other browsers ignore it`}>
      <span className="cursor-default">
        <span aria-hidden>
          <NotBaselineMark />
        </span>
        <span className="sr-only">{`${what} isn't Baseline`}</span>
      </span>
    </Hint>
  )
}

/* Tokens */

/**
 * A token's preview at chip size, drawn by the Tokens panel's own previews, so a font, a line height or a cursor looks
 * the same here as in the panel. Kinds drawn on the design's sheet get the sheet behind them.
 */
export function TokenMark({
  kind,
  value,
  name = "",
  width = 24,
  height = 16,
  playing = false
}: {
  kind: PreviewKind
  value: string
  name?: string
  width?: number
  height?: number
  playing?: boolean
}) {
  const sheet = onPaper.has(kind)

  return (
    <span
      aria-hidden
      className="relative block shrink-0 overflow-hidden rounded-[3px]"
      style={{
        width,
        height,
        background: sheet ? paper.sheet : undefined,
        boxShadow: sheet ? `inset 0 0 0 1px ${paper.edge}` : undefined
      }}
    >
      <TokenArt
        token={{ name, kind, values: { default: value } }}
        width={width}
        height={height}
        playing={playing && moving.has(kind)}
      />
    </span>
  )
}

/**
 * Which row of a token list is live, hovered or focused, so its mark plays, as the Tokens panel's do: a duration's dot
 * crosses, an easing runs. Spread `rowProps(name)` on each row's button and pass `live(name)` to its TokenMark.
 */
export function useLiveRow() {
  const [current, setCurrent] = useState<string>()

  return {
    live: (name: string | undefined) => name !== undefined && current === name,
    rowProps: (name: string | undefined) => ({
      onPointerEnter: () => setCurrent(name),
      onPointerLeave: () => setCurrent(undefined),
      onFocus: () => setCurrent(name),
      onBlur: () => setCurrent(undefined)
    })
  }
}

/** A name without the namespace a field implies: `lg` for `radius-lg` in Radius. */
const withoutNamespace = (name: string, namespace: string | undefined) =>
  namespace && name.startsWith(namespace) ? name.slice(namespace.length) : name

export interface TokenChipProps {
  /** The token's whole name, or the name a missing token had. */
  name: string
  /** The token, which draws the preview and says whether it's deprecated. */
  token?: FieldToken
  /** The namespace the field implies, which the chip leaves off: `radius-lg` shows as `lg` in Radius. */
  namespace?: string
  /** A preview in place of the token's own, as a color's at its alpha. */
  preview?: ReactNode
  /** What it comes to, faintly in the chip, for a chip outside a field; a field shows it after the chip instead. */
  detail?: string
  /** What its hint says where there's no token to say it: what a word the field holds does. */
  about?: string
  /** The name stays whole and what comes after it cuts short instead: a word the field holds, as Auto is. */
  keepsName?: boolean
  /** A token the project no longer has: struck through in the warning color. */
  struck?: boolean
  /** A composite token with a part changed here: a dot on the chip in the override color. */
  overridden?: boolean
  /**
   * Shrinks to fit a field too narrow to leave room to type beside it, so the name has the room at rest. The × shows on
   * the field's or the chip's hover or focus either way.
   */
  fill?: boolean
  /** The field's name, for the chip's accessible names (`Radius: radius-lg`). */
  label?: string
  /**
   * In a field, opens the field's list or picker: a click once the field's focused, Enter, Space or Alt+Down on the
   * pill. Set, the pill is a button; the popup opens from the field's own trigger, which stays while the pill comes
   * and goes.
   */
  onOpen?: () => void
  /** Shows the token's whole name and what it comes to on hover; a narrow field's own hint says it instead. */
  hint?: boolean
  /** A key typed on the focused chip, which replaces the token with what's typed. */
  onType?: (key: string) => void
  onStep?: (up: boolean, keys: ScrubKeys) => void
  /** Takes the token off: Backspace or Delete on the focused chip, or a list entry's ×. */
  onRemove?: () => void
  /**
   * In a field, what a click on the pill does before the field has focus: it focuses the field, as a click on its
   * text does, and only a click once it's focused opens the list.
   */
  focusField?: { focused: () => boolean; focus: () => void }
}

/**
 * A token in a field or a list entry, as a pill, as the simpler fields draw it (PAR-186) after Figma UI3's variable pill:
 * the name without the field's namespace, with its whole name and what it comes to in its hint. In a field, the pill is
 * the name alone; outside one, a list entry's, it carries the kind's preview and a × that takes it off. A token the
 * project has replaced is amber, one it no longer has red, and a composite token with a part changed has a dot.
 * Focused, typing replaces it, and Backspace or Delete takes it off (`onRemove`). In a field, a click focuses the field
 * before it opens the list (`focusField`).
 */
export function TokenChip({
  name,
  token,
  namespace,
  preview,
  detail,
  about,
  keepsName = false,
  struck = false,
  overridden = false,
  fill = false,
  label,
  hint = true,
  onType,
  onStep,
  onRemove,
  onOpen,
  focusField
}: TokenChipProps) {
  const shownName = withoutNamespace(name, namespace)
  // Whether the field had focus as the pointer went down, before the press moves it.
  const wasFocused = useRef(true)
  // In a field, the pill is the name alone, but for a preview the field passes (a color's swatch); outside a field, a
  // list entry's carries the kind's preview.
  let drawn = fill ? undefined : preview

  if (drawn === undefined && token && !fill && !onOpen) {
    drawn = <TokenMark kind={token.kind} value={token.value} name={token.name} width={20} height={14} />
  }

  const replacement = token?.deprecated
  let tone = "bg-foreground/10 hover:bg-foreground/15"
  let hintLabel = name
  let hintDetail = token?.detail ?? about
  let named = `${label ? `${label}: ` : ""}${shownName}${detail ? ` ${detail}` : ""}`

  if (struck) {
    tone = "bg-destructive/15 text-destructive hover:bg-destructive/25"
    hintLabel = `${name} is missing`
    hintDetail = "The project no longer has it. Pick another, or detach."
    named += ", missing"
  } else if (replacement) {
    tone = "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 dark:text-amber-300"
    hintLabel = `${name} is replaced by ${replacement}`
    named += `, replaced by ${replacement}`
  }

  // A chip shrinks to leave room to type beside it; a word's, short, keeps its width unless the field is narrow.
  let sizing = fill ? "min-w-0 shrink" : "max-w-full min-w-0 shrink"

  if (keepsName && !fill) {
    sizing = "shrink-0"
  }

  const content = (
    <>
      {drawn}
      <span className={keepsName ? "shrink-0" : "truncate"}>{shownName}</span>
      {/* A space between, so the text reads as the name says it ("Hug 435"); a flex row draws none. */}
      {detail && " "}
      {detail && <span className={`text-foreground/65 ${keepsName ? "min-w-0 truncate" : "shrink-0"}`}>{detail}</span>}
    </>
  )

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (onType && event.key.length === 1 && event.key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      onType(event.key)
    } else if (onRemove && (event.key === "Backspace" || event.key === "Delete")) {
      event.preventDefault()
      onRemove()
    } else if (onOpen && event.altKey && event.key === "ArrowDown") {
      event.preventDefault()
      onOpen()
    } else if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown") && !event.altKey) {
      event.preventDefault()
      onStep(event.key === "ArrowUp", { shift: event.shiftKey, alt: false })
    }
  }

  const main = onOpen ? (
    <button
      type="button"
      aria-label={named}
      onKeyDown={onKeyDown}
      onPointerDown={() => {
        wasFocused.current = focusField?.focused() ?? true
      }}
      onClick={() => {
        const first = !wasFocused.current
        wasFocused.current = true

        if (first && focusField) {
          focusField.focus()
        } else {
          onOpen()
        }
      }}
      className="flex h-full min-w-0 items-center gap-1 rounded px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </button>
  ) : (
    <span className="flex min-w-0 items-center gap-1 px-1.5">{content}</span>
  )

  return (
    <span className={`group/chip relative flex h-5 ${sizing} items-center rounded text-xs ${tone}`}>
      {hint ? (
        <Hint label={hintLabel} detail={hintDetail} wait>
          {main}
        </Hint>
      ) : (
        main
      )}
      {onRemove && !onOpen && (
        <button
          type="button"
          aria-label={`Remove ${name}${label ? ` from ${label}` : ""}`}
          onClick={onRemove}
          className="mr-0.5 hidden size-4 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none group-hover/chip:grid hover:bg-background/60 hover:text-foreground focus-visible:grid focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3" />
        </button>
      )}
      {overridden && (
        <>
          <ChangeMark />
          <span className="sr-only">A part is changed here</span>
        </>
      )}
    </span>
  )
}

export interface TokenListProps {
  /** The field's name, for the list's accessible name. */
  label: string
  tokens: readonly FieldToken[]
  /** The token the field holds, highlighted. */
  current?: string
  /** A first row that unsets the field, where it can be unset, with what unset is called (None, Auto). */
  none?: string
  /**
   * What unset comes to, where it's a value the tokens' preview can draw (`0px` for no blur or radius): the first row
   * draws it, so the scale starts from it.
   */
  noneValue?: string
  /** The field holds a value of its own, so neither the first row nor any token is the one it holds. */
  own?: boolean
  /**
   * Text styles on one line each, for a tight place: the small mark, the name in its family and weight at the row's
   * size, and what it comes to after it. Comfortable, the default, draws each larger, its name over what it comes to.
   */
  compact?: boolean
  /**
   * Up and Down move through its rows; off where it's part of a menu whose rows they move through together, as a
   * token menu's are.
   */
  arrows?: boolean
  /** For a button that shows or hides it to name (`aria-controls`). */
  id?: string
  onPick: (name: string | undefined) => void
}

/** A token row's preview, or the first row's: what unset comes to where it can be drawn, and room for one where not. */
function RowMark({
  token,
  kind,
  noneValue,
  playing,
  compact = false
}: {
  token?: FieldToken
  kind?: FieldToken["kind"]
  noneValue?: string
  compact?: boolean
  playing: boolean
}) {
  // A text style's mark holds the largest a list draws, so every style's Ag sits at its own size in one box.
  if (token?.kind === "type-style") {
    return (
      <TokenMark
        kind={token.kind}
        value={token.value}
        name={token.name}
        {...(compact ? compactStyleMark : styleMark)}
      />
    )
  }

  if (token) {
    return <TokenMark kind={token.kind} value={token.value} name={token.name} playing={playing} />
  }

  // No text style: a box the size of the others, dashed, with a faint Ag in the type it inherits.
  if (kind === "type-style") {
    const size = compact ? compactStyleMark : styleMark

    return (
      <span
        aria-hidden
        className="grid shrink-0 place-items-center rounded-[3px] border border-dashed border-muted-foreground/60 text-muted-foreground"
        style={{ ...size, fontSize: compact ? 11 : 15 }}
      >
        Ag
      </span>
    )
  }

  if (kind !== undefined && noneValue !== undefined) {
    return <TokenMark kind={kind} value={noneValue} />
  }

  return <span aria-hidden className="block h-4 w-6 shrink-0" />
}

/**
 * A field's tokens, for its popover: each drawn with its kind's preview as the Tokens panel draws it, with what it comes
 * to, a deprecated one marked, and the one the field holds highlighted. Up and Down move through it. A token that
 * moves (a duration, an easing) plays while its row is hovered or focused, as in the Tokens panel.
 */
export function TokenList({
  label,
  tokens,
  current,
  none,
  noneValue,
  own = false,
  compact = false,
  arrows = true,
  id,
  onPick
}: TokenListProps) {
  const { live, rowProps } = useLiveRow()

  const rows: { name: string | undefined; token?: FieldToken }[] = [
    ...(none === undefined ? [] : [{ name: undefined }]),
    ...tokens.map((token) => ({ name: token.name, token }))
  ]

  return (
    // Text styles' rows are taller, their names in their own type over what they come to.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the arrow keys of the buttons inside, handled once for them all
    <fieldset
      id={id}
      aria-label={`${label} tokens`}
      onKeyDown={arrows ? moveThroughRows : undefined}
      className={`flex ${tokens[0]?.kind === "type-style" && !compact ? "max-h-112" : "max-h-64"} min-w-0 flex-col overflow-y-auto`}
    >
      {rows.map(({ name, token }) => {
        const selected = name === current && !(name === undefined && own)

        return (
          <button
            key={name ?? "none"}
            type="button"
            aria-current={selected || undefined}
            onClick={() => onPick(name)}
            {...rowProps(name)}
            className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent ${selected ? "bg-accent" : ""}`}
          >
            <RowMark
              token={token}
              kind={tokens[0]?.kind}
              noneValue={noneValue}
              playing={live(name)}
              compact={compact}
            />
            {token ? (
              <TokenName token={token} compact={compact} />
            ) : (
              <span className={`${rowName} text-muted-foreground`}>{none}</span>
            )}
            {token?.deprecated && <TriangleAlert aria-label="Deprecated" className="size-3 shrink-0 text-amber-500" />}
            {token && (compact || token.kind !== "type-style") && <span className={rowDetail}>{token.detail}</span>}
            {selected && <Check aria-hidden className="ml-auto size-3.5 shrink-0" />}
          </button>
        )
      })}
    </fieldset>
  )
}

/**
 * Up and Down move the focus through a menu's rows, and Home and End to its first and last, for a list of buttons
 * that picks one (a token menu, Weight's faces): on the rows' container, as one keyboard model for every such list.
 */
export function moveThroughRows(event: KeyboardEvent<HTMLElement>) {
  const moves = ["ArrowDown", "ArrowUp", "Home", "End"]

  if (!moves.includes(event.key) || !(event.target instanceof HTMLButtonElement) || event.defaultPrevented) {
    return
  }

  const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
  const at = rows.indexOf(event.target)
  let next = clamp(at + (event.key === "ArrowDown" ? 1 : -1), 0, rows.length - 1)

  if (event.key === "Home") {
    next = 0
  } else if (event.key === "End") {
    next = rows.length - 1
  }

  event.preventDefault()
  rows[next]?.focus()
}

/** A row of a token menu that isn't a token: Create token, Allow here. */
const menuRow =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs outline-none hover:bg-accent focus-visible:bg-accent"

// A row's name takes the room it needs and what it comes to has the rest, so a long value (a shadow's
// `0px 25px 50px −12px`) cuts short before the name it belongs to does; only a name too long for the row cuts short.
const rowName = "min-w-0 truncate"

/** A text style's mark in a list, comfortable: one box that holds the largest Ag (28px), each style's at its own size. */
export const styleMark = { width: 48, height: 36 }

/** A text style's mark in a compact list: small, its Ag at its own size up to 14px. */
const compactStyleMark = { width: 28, height: 20 }

/** The largest a text style's name is drawn in a list, so a display size still fits a row. */
const largestStyleName = 28

/**
 * A token's name in a list: a text style's in its own type (CSS `font`), up to a size a row holds, as its mark draws
 * it, with what it comes to under it, as a large name leaves no room beside it; any other's plainly.
 */
export function TokenName({ token, compact = false }: { token: FieldToken; compact?: boolean }) {
  if (token.kind !== "type-style") {
    return <span className={rowName}>{token.name}</span>
  }

  // Compact, the row's size: the family and weight say which, the size is in what it comes to.
  if (compact) {
    return (
      <span
        key={token.value}
        className={rowName}
        style={{ font: token.value, fontSize: "inherit", lineHeight: "inherit" }}
      >
        {token.name}
      </span>
    )
  }

  const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(token.value)?.[1] ?? "")

  return (
    <span className="flex min-w-0 flex-col">
      <span
        key={token.value}
        className={rowName}
        style={{
          font: token.value,
          lineHeight: 1.25,
          fontSize: Number.isFinite(size) ? Math.min(size, largestStyleName) : undefined
        }}
      >
        {token.name}
      </span>
      <span className="truncate text-2xs text-muted-foreground tabular-nums">{token.detail}</span>
    </span>
  )
}

const rowDetail = "min-w-12 flex-1 basis-0 truncate text-right text-muted-foreground tabular-nums"

/**
 * What's wrong with a new token's name, or nothing: it's written into `var(--…)` and a Tailwind class, so it starts
 * with a lowercase letter and goes on in lowercase letters, digits and hyphens; and no token has its whole name
 * (`full`, with the namespace) already.
 */
export function tokenNameProblem(name: string, full: string, isTaken: (full: string) => boolean): string | undefined {
  if (name === "") {
    return undefined
  }

  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return "Start with a lowercase letter, then use lowercase letters, digits and hyphens."
  }

  return isTaken(full) ? `There's a token called ${full} already.` : undefined
}

/**
 * Naming a new token, as Create token asks: the namespace the field implies before the name typed, spaces typed as
 * hyphens and capitals as lowercase, what's wrong with the name under it, tied to it and said aloud, and the button
 * that makes it, named with the whole name. It's typed into as it opens.
 */
export function NewTokenForm({
  namespace = "",
  placeholder = namespace === "" ? "brand" : "card",
  isTaken,
  onCreate
}: {
  /** What the field's tokens' names start with, put before the name typed: `radius-`. */
  namespace?: string
  placeholder?: string
  /** Whether a token has this whole name already. */
  isTaken: (full: string) => boolean
  /** Makes the token, by its whole name. */
  onCreate: (full: string) => void
}) {
  const [name, setName] = useState("")
  const input = useFocusOnMount<HTMLInputElement>()
  const errorId = useId()
  const full = `${namespace}${name}`
  const problem = tokenNameProblem(name, full, isTaken)

  return (
    <form
      className="flex flex-col gap-1 p-1"
      onSubmit={(event) => {
        event.preventDefault()

        if (name !== "" && problem === undefined) {
          onCreate(full)
        }
      }}
    >
      <div className="flex items-center gap-1">
        {namespace !== "" && <span className="text-xs text-muted-foreground">{namespace}</span>}
        <Input
          ref={input}
          aria-label="New token's name"
          placeholder={placeholder}
          value={name}
          onChange={(event) => setName(event.target.value.replace(/\s+/g, "-").toLowerCase())}
          aria-invalid={problem !== undefined || undefined}
          aria-describedby={problem === undefined ? undefined : errorId}
          className="h-7 text-xs"
        />
      </div>
      <MessageLine id={errorId} message={problem === undefined ? undefined : { tone: "error", text: problem }} />
      <Button type="submit" size="sm" className="h-7 text-xs" disabled={name === "" || problem !== undefined}>
        Create {name === "" ? "token" : full}
      </Button>
    </form>
  )
}

/** Detach, in what a field's chevron opens while it holds a token: keeps what the token comes to, without it. */
function DetachRow({ token, onDetach }: { token: FieldToken; onDetach: () => void }) {
  return (
    <button type="button" className={menuRow} onClick={onDetach}>
      <Unlink aria-hidden className="size-3.5 text-muted-foreground" />
      <span className={rowName}>Detach</span>
      <span className={rowDetail}>{token.detail}</span>
    </button>
  )
}

export interface TokenMenuProps<T extends FieldToken> {
  label: string
  tokens: readonly T[]
  /** The token the field holds. */
  current?: string
  none?: string
  /** What unset comes to, drawn in the first row, as TokenList's. */
  noneValue?: string
  /** The value of its own the field holds, in words (`12px`, `#2563EB`), which the nearest token and Create token are for. */
  own?: string
  nearest?: T
  /** The nearest token comes to the same value as the field's own, so it's offered as the same, not the nearest. */
  same?: boolean
  /** The field holds a value of its own though `own` doesn't say it, so None isn't the one it holds. */
  holdsOwn?: boolean
  /** The order the tokens are listed in, where it isn't the project's: a scale's, smallest first. */
  order?: (a: T, b: T) => number
  /** The token the field holds, replaced, and what replaced it. */
  replaced?: { name: string; by: T }
  namespace?: string
  tokensOnly?: boolean
  /** Why the value of its own is allowed here, in a project set to Tokens only. */
  allowed?: string
  onAllow?: (reason: string | undefined) => void
  /** Makes a token of the value of its own, by the whole name given; without it, the menu has no Create token. */
  onCreate?: (name: string) => void
  onPick: (name: string | undefined) => void
  /** Words the field takes besides its tokens, as rows above them under a heading: Gap's Auto, one for each spread. */
  keywords?: MenuKeywords
  /** How the tokens show under the words: all listed, folded under one row that opens them, or with a search. */
  shown?: TokensShown
}

/** How a token menu that also holds words shows its tokens, which the Sizing menu's options compare. */
export type TokensShown = "listed" | "folded" | "searched"

/** Words a field takes besides its tokens, as its token menu lists them: Gap's Auto, a row for each way it spreads. */
export interface MenuKeywords {
  heading: string
  rows: { key: string; name: string; detail: string; current: boolean; onPick: () => void }[]
  /** Commands under the words, as W's Add min and Add max. */
  actions?: { key: string; name: string; disabled?: boolean; onPick: () => void }[]
}

/**
 * A field's token menu: the swap for a replaced token; for a value of its own, the nearest token, first, under what it's
 * nearest to (or the same as); the tokens, in `order`, without the ones the project has replaced, which aren't for
 * picking; then Create token, and, in a project set to Tokens only, Allow here, which asks why.
 */
export function TokenMenu<T extends FieldToken>({
  label,
  tokens,
  current,
  none,
  noneValue,
  own,
  nearest,
  same = false,
  holdsOwn = false,
  order,
  replaced,
  namespace = "",
  tokensOnly = false,
  allowed,
  onAllow,
  onCreate,
  onPick,
  keywords,
  shown = "listed"
}: TokenMenuProps<T>) {
  const [unfolded, setUnfolded] = useState(false)
  const [query, setQuery] = useState("")
  const [naming, setNaming] = useState(false)
  const [reason, setReason] = useState<string>()
  const { live, rowProps } = useLiveRow()
  const listId = useId()
  const allowing = tokensOnly && onAllow !== undefined
  const pickable = tokens.filter((each) => each.deprecated === undefined)
  const listed = order ? pickable.toSorted(order) : inScaleOrder(pickable)
  const words = query.trim().toLowerCase()

  const found =
    shown === "searched" && words !== ""
      ? listed.filter((each) => each.name.toLowerCase().includes(words) || each.detail.toLowerCase().includes(words))
      : listed

  const foldable = shown === "folded" && listed.length > 0
  const folded = foldable && !unfolded

  return (
    // Up and Down move through all of its rows, the words, the nearest token, the tokens and what's under them.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- the arrow keys of the buttons inside, handled once for them all
    <div className="flex min-w-0 flex-col" onKeyDown={moveThroughRows}>
      {keywords && (
        <div className={`flex flex-col ${listed.length > 0 || none !== undefined ? "mb-1 border-b pb-1" : ""}`}>
          <p className="px-2 pt-1 pb-0.5 type-description text-muted-foreground">{keywords.heading}</p>
          {keywords.rows.map((row) => (
            <button
              key={row.key}
              type="button"
              aria-current={row.current || undefined}
              onClick={row.onPick}
              className={`${menuRow} ${row.current ? "bg-accent" : ""}`}
            >
              <span className="flex min-w-0 flex-col">
                <span className={rowName}>{row.name}</span>
                <span className="truncate text-2xs text-muted-foreground">{row.detail}</span>
              </span>
              {row.current && <Check aria-hidden className="ml-auto size-3.5 shrink-0" />}
            </button>
          ))}
          {keywords.actions && (
            <div className="mt-1 flex flex-col border-t pt-1">
              {keywords.actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  disabled={action.disabled}
                  onClick={action.onPick}
                  className={`${menuRow} disabled:pointer-events-none disabled:opacity-50`}
                >
                  <span className={rowName}>{action.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {replaced && (
        <button
          type="button"
          onClick={() => onPick(replaced.by.name)}
          className="mb-1 rounded-sm bg-amber-500/10 px-2 py-1.5 text-left text-xs outline-none hover:bg-amber-500/20 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {replaced.name} is replaced. Use {replaced.by.name}
        </button>
      )}
      {own !== undefined && nearest && (
        <div className="mb-1 flex flex-col border-b pb-1">
          <p className="px-2 pt-1 pb-0.5 type-description text-muted-foreground">
            {same ? "Same as" : "Nearest to"} {own}
          </p>
          <button type="button" className={menuRow} onClick={() => onPick(nearest.name)} {...rowProps(nearest.name)}>
            <TokenMark kind={nearest.kind} value={nearest.value} name={nearest.name} playing={live(nearest.name)} />
            <span className={rowName}>{nearest.name}</span>
            <span className={rowDetail}>{nearest.detail}</span>
          </button>
        </div>
      )}
      {listed.length === 0 && !keywords && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">No tokens for {label} yet</p>
      )}
      {shown === "searched" && listed.length > 0 && (
        <Input
          aria-label={`Search ${label}'s tokens`}
          placeholder="Search tokens"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mb-1 h-7 text-xs"
        />
      )}
      {shown === "searched" && words !== "" && found.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">No tokens match “{query.trim()}”</p>
      )}
      {foldable && (
        // A disclosure that stays where it is, so the focus stays on it as the tokens open under it.
        <button
          type="button"
          aria-expanded={unfolded}
          aria-controls={unfolded ? listId : undefined}
          className={menuRow}
          onClick={() => setUnfolded(!unfolded)}
        >
          <span className={rowName}>Tokens</span>
          <ChevronRight
            aria-hidden
            className={`ml-auto size-3.5 shrink-0 text-muted-foreground ${unfolded ? "rotate-90" : ""}`}
          />
        </button>
      )}
      {!folded && (found.length > 0 || none !== undefined) && (
        <TokenList
          id={listId}
          label={label}
          tokens={found}
          current={current}
          none={none}
          noneValue={noneValue}
          own={own !== undefined || holdsOwn}
          arrows={false}
          onPick={onPick}
        />
      )}
      {own !== undefined && (onCreate !== undefined || allowing) && (
        <div className="mt-1 flex flex-col border-t pt-1">
          {onCreate && !naming && (
            <button type="button" className={menuRow} onClick={() => setNaming(true)}>
              Create token from {own}…
            </button>
          )}
          {onCreate && naming && (
            <NewTokenForm
              namespace={namespace}
              isTaken={(full) => tokens.some((each) => each.name === full)}
              onCreate={onCreate}
            />
          )}
          {/* A reason kept with the value shows wherever it is, so it isn't lost on a project that's not Tokens only. */}
          {onAllow !== undefined && allowed !== undefined && (
            <>
              <p className="px-2 pt-1 pb-0.5 type-description text-muted-foreground">Allowed here: {allowed}</p>
              <button type="button" className={menuRow} onClick={() => onAllow(undefined)}>
                Don&apos;t allow here
              </button>
            </>
          )}
          {allowing && allowed === undefined && reason === undefined && (
            <button type="button" className={menuRow} onClick={() => setReason("")}>
              Allow {own} here…
            </button>
          )}
          {allowing && allowed === undefined && reason !== undefined && (
            // The reason is kept with the value, so it moves with the layer.
            <form
              className="flex flex-col gap-1 p-1"
              onSubmit={(event) => {
                event.preventDefault()

                if (reason.trim() !== "") {
                  onAllow(reason.trim())
                }
              }}
            >
              <ReasonBox reason={reason} onReason={setReason} />
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={reason.trim() === ""}>
                Allow here
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

/** One of a search list's options: how it's drawn, and the heading of the group it starts, where it starts one. */
export interface SearchOption {
  /** Unique among the options. */
  key: string
  content: ReactNode
  /** The group it's in, whose name heads it where it starts. */
  group?: string
}

/**
 * What makes a text box a combobox over a SearchList, one set for every one of them (a field's search, a CSS row's
 * name and value, an expression's editor, a one-line input or a box that wraps): it says whether the list is open,
 * names it while it is, and names the highlighted option, which stays where typing is.
 */
export function comboboxProps({ listId, open, highlight }: { listId: string; open: boolean; highlight?: number }) {
  return {
    role: "combobox",
    "aria-expanded": open,
    "aria-controls": open ? listId : undefined,
    "aria-autocomplete": "list",
    "aria-activedescendant": open && highlight !== undefined ? `${listId}-${highlight}` : undefined
  } as const
}

/**
 * The list under a combobox that what's typed searches, as Font's list, an expression's completions and a CSS row's
 * are: each option on a line, headed by its group where one starts, the highlighted one lit. The input keeps focus and
 * moves the highlight with Up and Down (it names the list with `aria-controls` and the option with
 * `aria-activedescendant`, `${id}-${index}`); the pointer highlights on hover and picks on press.
 */
export function SearchList({
  id,
  label,
  options,
  highlight,
  empty,
  className = "",
  tall = false,
  onHighlight,
  onPick
}: {
  id: string
  label: string
  options: readonly SearchOption[]
  /** Taller, for rows that are, as text styles' are. */
  tall?: boolean
  highlight: number
  /** What it says when nothing's found; without it, an empty list isn't drawn. */
  empty?: string
  /** Where it sits: absolute under its field, or in the flow of a popover. */
  className?: string
  onHighlight: (index: number) => void
  onPick: (index: number) => void
}) {
  if (options.length === 0 && empty === undefined) {
    return null
  }

  const runs = groupRuns(options)

  if (options.length === 0) {
    return (
      <div
        id={id}
        className={`rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${className}`}
        aria-live="polite"
      >
        <p className="px-2 py-1.5 text-xs text-muted-foreground">{empty}</p>
      </div>
    )
  }

  return (
    <div
      id={id}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a combobox's listbox, its options drawn as each needs, which a select or datalist can't draw
      role="listbox"
      aria-label={label}
      className={`flex ${tall ? "max-h-112" : "max-h-64"} flex-col overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${className}`}
    >
      {runs.map((run) => {
        const drawn = run.options.map(({ option, index }) => (
          <div
            key={option.key}
            id={`${id}-${index}`}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an option of the listbox above
            role="option"
            tabIndex={-1}
            aria-selected={index === highlight}
            onPointerEnter={() => onHighlight(index)}
            onPointerDown={(event) => {
              // The input keeps focus, so the pick is read as a choice, not as leaving the field.
              event.preventDefault()
              onPick(index)
            }}
            className={`flex cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs ${index === highlight ? "bg-accent" : ""}`}
          >
            {option.content}
          </div>
        ))

        const first = run.options[0]!.index

        if (run.group === undefined) {
          return (
            <div key={first} className="contents">
              {drawn}
            </div>
          )
        }

        // A listbox holds only options and groups of them, so a group's heading names its group rather than sitting
        // among the options, and a screen reader says which group an option is in.
        return (
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a group of the listbox's options, which a fieldset can't be inside a listbox
          <div key={first} role="group" aria-labelledby={`${id}-group-${first}`} className="contents">
            <p
              id={`${id}-group-${first}`}
              aria-hidden
              className="px-2 pt-1.5 pb-1 text-xs font-medium text-muted-foreground"
            >
              {run.group}
            </p>
            {drawn}
          </div>
        )
      })}
    </div>
  )
}

/** A list's options in runs that share a group, each with its place in the whole list. */
function groupRuns(options: readonly SearchOption[]) {
  const runs: { group: string | undefined; options: { option: SearchOption; index: number }[] }[] = []

  for (const [index, option] of options.entries()) {
    const last = runs.at(-1)

    if (last && last.group === option.group) {
      last.options.push({ option, index })
    } else {
      runs.push({ group: option.group, options: [{ option, index }] })
    }
  }

  return runs
}

/** The nearest of a field's tokens to a number, leaving out deprecated ones, which are on their way out. */
export function nearestToken<T extends FieldToken>(tokens: readonly T[], measure: (token: T) => number, to: number) {
  const current = tokens.filter((token) => token.deprecated === undefined)

  if (current.length === 0) {
    return undefined
  }

  return current.reduce((best, token) => (Math.abs(measure(token) - to) < Math.abs(measure(best) - to) ? token : best))
}

/**
 * What the Design tab's fields take from the project, which whatever draws them must give (`ProjectData`): every set
 * of its tokens, converted once where they enter (`projectTokenSets` in the app, the stand-ins in a story), the colors
 * the design uses, and where image fills take their images from.
 */
export interface ProjectDataValue {
  tokens: TokenSets
  /** The colors the design uses, which a color picker offers under In this design. */
  usedColors: readonly string[]
  images: ImageSource
  /** Adds a token made with Create token; unset where the tokens are the project's own, which it doesn't make here. */
  create?: <K extends TokenSetName>(set: K, token: TokenSets[K][number]) => void
}

const ProjectDataContext = createContext<ProjectDataValue | undefined>(undefined)

/** Gives the fields inside the project's tokens, colors and images. */
export const ProjectData = ProjectDataContext

/** What the fields take from the project; a field drawn outside `ProjectData` is a mistake, and says so. */
export function useProjectData(): ProjectDataValue {
  const given = useContext(ProjectDataContext)

  if (!given) {
    throw new Error("A Design panel field was drawn outside ProjectData, which gives it the project's tokens")
  }

  return given
}

/** One set of the project's tokens, and how to add to it (Create token) where the project can. */
export interface ProjectTokenSet<K extends TokenSetName> {
  tokens: TokenSets[K]
  create?: (token: TokenSets[K][number]) => void
}

/** One set of the project's tokens, and how to add to it (Create token) where the project can. */
export function useTokens<K extends TokenSetName>(set: K): ProjectTokenSet<K> {
  const { tokens, create } = useProjectData()

  return { tokens: tokens[set], create: create && ((token) => create(set, token)) }
}

/** Every set of the project's tokens, for a preview that draws what the fields hold. */
export function useTokenSets(): TokenSets {
  return useProjectData().tokens
}

/** The colors the design uses, for a color picker's In this design. */
export function useUsedColors(): readonly string[] {
  return useProjectData().usedColors
}

/* The field */

/**
 * The status slot's marks (slot 5), of which the field shows the first that applies. Since the simpler fields
 * (PAR-186), a token's problems show on its pill (red for missing, amber for replaced) and a value of its own has no
 * mark, its nearest token and Create token being in its list (`own`), so a field shows only `missing` for something
 * that isn't a token (a font the frame can't load) and `theme`.
 */
export interface StatusMarks {
  missing?: ReactNode
  theme?: ReactNode
}

/** The token a field holds, drawn as its pill in the value's place. */
export interface FieldChip {
  name: string
  /** The token, or nothing for one the project no longer has, which shows in red. */
  token?: FieldToken
  namespace?: string
  /** A preview in place of the token's own, as a color's at its alpha. */
  preview?: ReactNode
  overridden?: boolean
  /** Takes the token off, leaving the field unset: Backspace or Delete with nothing typed, or on the pill. */
  onRemove: () => void
  /**
   * Detaches the token, keeping what it came to as the field's own value, as Figma's Detach does: a row in what the
   * field's chevron opens.
   * Without it, Detach takes the token off (`onRemove`).
   */
  onDetach?: () => void
  /** Swaps a replaced token's replacement in, from the top of the token list. */
  onReplace?: (replacement: string) => void
  /**
   * A word the field holds as a whole rather than a token, as Gap's Auto is: drawn plainly, with `detail` faintly after
   * it and `about` in its hint, and taken off whole, as a token is.
   */
  keyword?: { detail?: string; about?: string }
}

/**
 * A value of the field's own, which its token list is for: the nearest token, first, then Create token, and, in a
 * project set to Tokens only, Allow here, which asks why.
 */
export interface OwnValue {
  /** The value in words, as the list says it: `12px`, `#2563EB`. */
  text: string
  nearest?: FieldToken
  /** The nearest token comes to the same value, so the list offers it as the same, not the nearest. */
  same?: boolean
  /** What the field's tokens' names start with, which Create token puts before the name typed. */
  namespace?: string
  /** Makes a token of the value by the whole name given, and sets the field to it. */
  onCreate?: (name: string) => void
  tokensOnly?: boolean
  /** Why it's allowed here, in a project set to Tokens only. */
  allowed?: string
  onAllow?: (reason: string | undefined) => void
}

/** A token's name as a field stores it, `{ token }`, or nothing for none. */
export const asToken = (name: string | undefined) => (name === undefined ? undefined : { token: name })

/**
 * The chip for a token a field holds, `token` where the project still has it: Backspace takes it off (`pick` with
 * nothing), Detach keeps what it comes to (`detach`), and a replaced one swaps for what replaced it (`pick`).
 */
export function tokenChip<T extends FieldToken>(
  name: string | undefined,
  token: T | undefined,
  {
    pick,
    detach,
    namespace
  }: { pick: (name: string | undefined) => void; detach: (token: T) => void; namespace?: string }
): FieldChip | undefined {
  if (name === undefined) {
    return undefined
  }

  return {
    name,
    token,
    namespace,
    onRemove: () => pick(undefined),
    onDetach: token ? () => detach(token) : undefined,
    onReplace: (replacement) => pick(replacement)
  }
}

/** What a hint says first of a token a field holds, or a value of its own: it's deprecated, missing or allowed here. */
export function tokenStatus(
  name: string | undefined,
  token: FieldToken | undefined,
  allow: string | undefined
): string | undefined {
  if (token?.deprecated) {
    return `Deprecated: use ${token.deprecated} instead`
  }

  if (name !== undefined && !token) {
    return "Missing: the project has no token by this name now"
  }

  return allow === undefined ? undefined : `Allowed here: ${allow}`
}

/**
 * A length of a field's own, as its token list offers it: the nearest token first, or the same one, then Create token,
 * which makes a token of it and takes that (`onToken`), and Allow here under Tokens only.
 */
export function ownLength({
  px,
  unit,
  tokens,
  kind,
  namespace,
  create,
  tokensOnly,
  allow,
  onToken,
  onAllow
}: {
  px: number
  unit: string
  tokens: readonly LengthToken[]
  kind: PreviewKind
  namespace?: string
  create?: (token: LengthToken) => void
  tokensOnly: boolean
  allow: string | undefined
  onToken: (name: string) => void
  onAllow: (reason: string | undefined) => void
}): OwnValue {
  return ownValue({
    value: px,
    text: `${formatNumber(px)}${unit}`,
    tokens,
    measure: (each) => each.px,
    make: (name) => lengthToken(kind, name, px),
    namespace,
    create,
    tokensOnly,
    allow,
    onToken,
    onAllow
  })
}

/**
 * A value of a field's own that comes to a number, as its token list offers it, for any kind of token: the token
 * nearest `value` by `measure` first, or the same one, then Create token, which makes a token of it (`make`), adds it
 * (`create`) and takes it (`onToken`), and Allow here under Tokens only.
 */
export function ownValue<T extends FieldToken>({
  value,
  text,
  tokens,
  measure,
  make,
  namespace,
  create,
  tokensOnly = false,
  allow,
  onToken,
  onAllow
}: {
  /** The value as a number, in what `measure` gives: pixels, a multiple, em, a percentage. */
  value: number
  /** The value in words, as the list says it: `12px`, `1.5×`. */
  text: string
  tokens: readonly T[]
  measure: (token: T) => number
  /** The token Create token makes of the value, by the whole name given. */
  make: (name: string) => T
  namespace?: string
  create?: (token: T) => void
  tokensOnly?: boolean
  allow: string | undefined
  onToken: (name: string) => void
  /** Keeps why it's allowed here with the value; without it, the list has no Allow here. */
  onAllow?: (reason: string | undefined) => void
}): OwnValue {
  const nearest = nearestToken(tokens, measure, value)

  return {
    text,
    nearest,
    same: nearest !== undefined && measure(nearest) === value,
    namespace,
    onCreate:
      create &&
      ((name) => {
        create(make(name))
        onToken(name)
      }),
    tokensOnly,
    allowed: allow,
    onAllow
  }
}

/**
 * The px or % a length field shows, and its unit's menu of the two, which keeps the number (12px becomes 12%), as
 * Webflow's does. Unset, a number typed bare is in the unit last chosen there.
 */
export function usePercentUnit(
  px: number | undefined,
  percent: number | undefined,
  to: { px: (number: number) => void; percent: (number: number) => void }
) {
  const [chosen, setChosen] = useState<"px" | "%">("px")
  let unit = chosen

  if (percent !== undefined) {
    unit = "%"
  } else if (px !== undefined) {
    unit = "px"
  }

  const toUnit = (next: "px" | "%") => {
    setChosen(next)

    if (next === "%" && px !== undefined) {
      to.percent(px)
    } else if (next === "px" && percent !== undefined) {
      to.px(percent)
    }
  }

  /** The menu, for the field called `label`, with what a percentage is `of`. */
  const menu = (label: string, of: string) => (
    <UnitMenu
      label={label}
      unit={unit}
      units={[
        { unit: "px", label: "Pixels" },
        { unit: "%", label: `Of ${of}` }
      ]}
      onUnit={toUnit}
    />
  )

  return { unit, menu }
}

export interface ValueFieldProps<T> {
  /** The field's accessible name, and what its messages call it. */
  label: string
  /** Slot 1: a short label (`X`, `W`, `Min`) or an icon inside the field, which scrubs where `scrub` is given. */
  inner?: ReactNode
  scrub?: Scrub
  /** Slot 2: the value as text at rest; unset shows the placeholder faintly. */
  shown: string | undefined
  /** What unset comes to, shown faintly: `0`, `None`, `Hug`, `Auto`. */
  placeholder?: string
  /** The selected layers differ here: unset shows Mixed, and typing replaces every one, unless `each` is given. */
  mixed?: boolean
  /**
   * Where the layers differ (`mixed`), what works from the value there is worked out for each layer from its own, as
   * `Mixed+8` adds 8 to each: maths that uses the value (`+8`, `*2`), Up and Down, and a scrub. `update` takes a
   * layer's own number, in the field's units, and gives its next; `keys` are those held for a step or a scrub.
   */
  each?: (update: (own: number) => number, keys?: ScrubKeys) => void
  /**
   * How Up or Down moves a layer's own number where `each` works it out for each layer, where a press moves it
   * differently from a drag of its label, as a side's does. Without it, a press moves it as a drag of a step does.
   */
  stepEach?: (own: number, up: boolean, keys: ScrubKeys) => number
  /** The value shows faintly, as one set by another control does. */
  muted?: boolean
  /** Slot 2: the token the field holds, as a chip in the value's place. */
  chip?: FieldChip
  /** Slot 3: the unit, as text, or a button that opens the field's unit and mode menu (`unitButtonClass`). */
  unit?: ReactNode
  /** The unit as text where `unit` is a menu, for a narrow field's hint to name the value whole: `25%`. */
  unitName?: string
  /**
   * Slot 4: what it comes to, or "set by …", faint after the value; in a narrow field, or after a token's pill, in the
   * hint.
   */
  comesTo?: string
  /** Slot 5: the marks that apply to the value; the field shows one. */
  status?: StatusMarks
  /** A value of the field's own, which its token list offers the nearest token and Create token for. */
  own?: OwnValue
  /** Slot 6: the tokens the field offers, drawn as its TokenList, which the token button, the chip and Alt+Down open. */
  tokens?: {
    list: readonly FieldToken[]
    /** The token the field holds, highlighted. */
    current?: string
    /** A first row that unsets the field, with what unset is called (None, Auto). */
    none?: string
    /** What unset comes to, drawn in the first row where the tokens' preview can (`0px`). */
    noneValue?: string
    onPick: (name: string | undefined) => void
    /** Words the field takes besides its tokens, listed above them. */
    keywords?: MenuKeywords
    /** What its button calls the list where it holds words rather than tokens, as W's Sizing does. */
    name?: string
    /** How the tokens show under the words. */
    shown?: TokensShown
  }
  /**
   * A picker of the field's own in place of the token list, as Color's Tokens and Custom tabs are. Its `swatch` opens
   * it from the start of the field wherever no chip shows, including while a chip's name is typed over.
   */
  picker?: {
    content: ReactNode
    open: boolean
    onOpenChange: (open: boolean) => void
    className?: string
    swatch?: ReactNode
  }
  read: (text: string) => Reading<T>
  onCommit: (value: T) => void
  onStep?: (up: boolean, keys: ScrubKeys) => void
  /**
   * A value Tokens only refuses, typed or already there, which is kept: outlined in the error color, with "Not a token."
   * and Use with the nearest token under the row, until it's allowed here.
   */
  refused?: { nearest: FieldToken; onUse: () => void }
  /** A button after the field, as Angle's dial is. */
  trailing?: ReactNode
  /**
   * Under about 96px, as sides and corners are: what the value comes to is in the hint
   * and under the row while focused.
   */
  narrow?: boolean
  /** The field's hint: what it says, and more on the lines below. A narrow field's names its value. */
  hint?: FieldHint
  disabled?: boolean
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"]
  /** Classes for the input, as a color's monospaced hex. */
  inputClassName?: string
  /** The whole text to edit once focused, where the value shows short at rest (an OKLCH color). */
  editText?: string
  /** The whole value for screen readers, where the field shows it short at rest (an expression's `calc`). */
  description?: string
  /** Selects the value on focus, so typing replaces it. */
  selectOnFocus?: boolean
  /** Classes for the row, as a grid places it beside another field whose messages share the line under both. */
  rowClassName?: string
  /**
   * What Tokens only says of a value it refuses in words of the field's own, where `refused`'s "tokens only" doesn't
   * fit, as a side's `notAStep`: outlined in the error color, with it under the row, until it's allowed here.
   */
  refusal?: { reason: string; action?: MessageAction }
  /**
   * Alt+Up and Alt+Down step the value with Alt held, as a side's reach the opposite side too (`onStep`'s `alt`),
   * rather than Alt+Down opening the tokens, which the token button and the chip still open.
   */
  altSteps?: boolean
  /**
   * A line its messages go to instead of its own under the row, as the box-model widget's sides say things under the
   * widget: `useTyped`'s `line`. The field then shows nothing under its row; what it comes to is in its hint.
   */
  line?: SharedLine
  /**
   * Borderless until hovered or focused, the value centered and no token button, as the box-model widget's sides sit
   * in its rings; typing a token's name, the chip and Alt+Down still reach the tokens.
   */
  bare?: boolean
  /** Styles for the input, as Font draws a family's name in its own face. */
  inputStyle?: CSSProperties
  /**
   * A list under the field that what's typed searches, as Font's list of fonts: focused, it lists everything; typing
   * narrows it; Up and Down move through it, previewing each, and Enter or a click takes the highlighted one. Where
   * nothing's found, Enter reads what's typed as `read` does, so Font keeps a typed stack.
   */
  search?: FieldSearch<T>
  /**
   * Locked to tokens, as a project can ask (`tokensOnly`); unlocked, a field takes a value of its own as readily as a
   * token. Locked, typing searches `tokens` rather than taking a value, a value typed (`13px`, `ABDABD`) lists the token
   * nearest it first, and leaving without picking one keeps what was there, saying nothing. `takes` lets through
   * anything else it takes as typed, as a side takes a step on the scale. A value already there that isn't a token
   * stays, refused (`refused`).
   */
  locked?: {
    tokens: readonly FieldToken[]
    /** The token nearest what's typed, where it reads as a value of the field's own. */
    nearestTo: (text: string) => FieldToken | undefined
    takes?: (text: string) => boolean
  }
  /**
   * `=` opens an expression, as design-options-values.md's Expression has it in any field: typing `=` hands what's
   * typed after it to `onEquals`, which opens the expression's editor. Where the field holds one, `onOpen` opens it as
   * the field's focused or clicked, as clicking `calc 648` does, or Enter's pressed in it before anything's typed.
   * Focus coming back from the editor, which carries `data-expression-editor`, doesn't open it again.
   */
  expression?: { onEquals: (text: string) => void; onOpen?: () => void }
}

/** A field's hint: what it says, and more on the lines below. */
export interface FieldHint {
  label?: string
  detail?: string
}

/** What a field's search list offers: each option's drawing and what it stores, and where it's previewed. */
export interface FieldSearch<T> {
  /** The list's accessible name. */
  label: string
  /** The options for what's typed so far, in order; everything when nothing's typed. */
  options: (text: string) => readonly (SearchOption & { value: T })[]
  /**
   * What the list says when nothing's found for what's typed (No fonts match); nothing closes it, as for a typed stack.
   * Either way, Enter reads what's typed as `read` does.
   */
  empty?: (text: string) => string | undefined
  /** The option highlighted with Up and Down or the pointer, to preview it; nothing once the list closes. */
  onHighlight?: (value: T | undefined) => void
  /** Its rows are taller, as text styles' are, so it is too. */
  tall?: boolean
}

/** A token as a search list draws it: its mark and name, and what it comes to at the end. */
function TokenOption({ token }: { token: FieldToken }) {
  return (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <TokenMark kind={token.kind} value={token.value} name={token.name} width={20} height={14} />
        <span className="truncate">{token.name}</span>
      </span>
      <span className="shrink-0 text-muted-foreground">{token.detail}</span>
    </>
  )
}

/**
 * How a field locked to tokens reads what's typed and what typing searches (ValueField's `locked`): a token's name,
 * None or what `takes` lets through is read as the field reads it, and anything else is refused with the nearest token
 * as its answer; the search lists the tokens whose name or value has what's typed, after the token nearest it where it
 * reads as a value. Each option stores what the field reads the token's name as.
 */
function lockedTyping<T>(
  locked: ValueFieldProps<T>["locked"],
  {
    label,
    read,
    onCommit,
    namespace = "",
    none
  }: {
    label: string
    read: (text: string) => Reading<T>
    onCommit: (value: T) => void
    namespace?: string
    none?: string
  }
): { read: (text: string) => Reading<T>; search: FieldSearch<T> } | undefined {
  if (!locked) {
    return undefined
  }

  const lower = (text: string) => text.trim().toLowerCase()

  const takenAsIs = (text: string) =>
    lower(text) === "" ||
    lower(text) === none?.toLowerCase() ||
    tokenNamed(locked.tokens, text, namespace) !== undefined ||
    locked.takes?.(text.trim()) === true

  const valueOf = (token: FieldToken) => {
    const reading = read(token.name)

    return "value" in reading ? reading : undefined
  }

  return {
    read: (text) => {
      if (takenAsIs(text)) {
        return read(text)
      }

      const near = locked.nearestTo(text.trim())
      const taken = near && valueOf(near)

      const same = near?.detail.toLowerCase() === text.trim().toLowerCase()

      return near && taken ? notAToken(near, () => onCommit(taken.value), same) : { reason: "Not a token" }
    },
    search: {
      label: `${label} tokens`,
      options: (text) => {
        const words = lower(text)

        // What it takes as typed (a side's step) isn't searched for, so Enter takes it rather than a token.
        if (words !== "" && locked.takes?.(text.trim()) === true) {
          return []
        }

        const near = words === "" ? undefined : locked.nearestTo(text.trim())
        const rows: (SearchOption & { value: T })[] = []

        const add = (token: FieldToken, group: string | undefined) => {
          const taken = valueOf(token)

          if (taken) {
            rows.push({
              key: `${group ?? ""}/${token.name}`,
              group,
              content: <TokenOption token={token} />,
              value: taken.value
            })
          }
        }

        if (near) {
          add(near, `Nearest to ${text.trim()}`)
        }

        for (const token of locked.tokens) {
          const matches = words === "" || lower(token.name).includes(words) || lower(token.detail).includes(words)

          if (token.deprecated === undefined && matches && token.name !== near?.name) {
            add(token, near ? "Tokens" : undefined)
          }
        }

        return rows
      },
      empty: (text) => (locked.takes?.(text.trim()) === true ? undefined : `No tokens match “${text.trim()}”`)
    }
  }
}

/**
 * The field every styling control builds on, drawn as the simpler fields are (PAR-186): a filled box with the inner
 * label or icon, which scrubs; the value, or a token's pill, named alone, with what it comes to in its hint; the unit;
 * and, where it offers tokens or a picker, a chevron at the box's end that always shows, whatever the field holds,
 * and opens them, with Detach in what it opens while a token's set. Nothing in the field shows only on hover. A
 * value of its own has no mark: its token list offers the nearest token first, then Create token (`own`). What's typed
 * is read when Enter is pressed or the field is left: text it can't read stays, outlined, with the reason under the
 * row, whether Enter is pressed or the field is left, and Escape puts the value back. Up and Down step it. Typing on a focused pill replaces
 * the token; Backspace in the empty field, or on the pill, takes it off, and Detach keeps what it came to. A click on
 * the pill focuses the field as a click on its text does, and once it's focused opens the tokens, as Alt+Down does.
 * Messages span a grid's row, so a row of fields says things under the whole row.
 */
export function ValueField<T>({
  label,
  inner,
  scrub: scrubbing,
  shown,
  placeholder = "",
  mixed = false,
  each,
  stepEach,
  muted = false,
  chip,
  unit,
  unitName,
  comesTo,
  status,
  own,
  tokens,
  picker,
  read,
  onCommit,
  onStep,
  refused,
  trailing,
  narrow = false,
  hint,
  disabled = false,
  inputMode = "decimal",
  inputClassName = "",
  editText,
  description,
  selectOnFocus = false,
  rowClassName = "",
  refusal,
  altSteps = false,
  line,
  bare = false,
  inputStyle,
  search: ownSearch,
  locked,
  expression
}: ValueFieldProps<T>) {
  const live = useContext(LiveEditsContext)
  const [listOpen, setListOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const searchId = useId()
  const input = useRef<HTMLInputElement>(null)
  // Set when a pick closes the list, so the focus goes to the value's text rather than a pill that may have gone.
  const picked = useRef(false)
  // Set as the chevron's list hands focus back, so the search doesn't open over what was just picked.
  const fromList = useRef(false)
  const unitWord = textValue.safeParse(unit).data
  const unitText = unitName ?? unitWord ?? ""
  let backTo = shown === undefined ? placeholder || "unset" : `${shown}${unitText}`

  // Mixed layers still differ once typing's put back, so that's what it's back to, not what unset comes to.
  if (mixed && shown === undefined) {
    backTo = "Mixed"
  }

  if (chip) {
    backTo = chip.name
  }

  const locking = lockedTyping(locked, {
    label,
    read,
    onCommit,
    namespace: own?.namespace ?? chip?.namespace,
    none: tokens?.none
  })

  const search = ownSearch ?? locking?.search
  // A field's own search (Font's) opens as it's focused; the one Tokens only brings opens only on typing, so until
  // something's typed, Up and Down step the value as they do unlocked.
  const searchOnFocus = ownSearch !== undefined

  // Where the layers differ, a change that works from the value there is worked out for each layer.
  const perLayer = mixed && locked === undefined ? each : undefined
  const readOne = locking?.read ?? read

  const typed = useTyped<{ value: T } | { each: (own: number) => number }>({
    label,
    shown: shown ?? "",
    read: (text) => {
      const update = perLayer && relativeUpdate(text, label)

      if (update) {
        return { value: { each: update } }
      }

      const reading = readOne(text)

      return "value" in reading ? { ...reading, value: { value: reading.value } } : reading
    },
    onCommit: (typedValue) => ("each" in typedValue ? perLayer?.(typedValue.each) : onCommit(typedValue.value)),
    onStep:
      perLayer && scrubbing && onStep
        ? (up, shift, alt) =>
            perLayer(
              (own) => (stepEach ?? ((at, to, keys) => pressed(at, to, keys, scrubbing.by)))(own, up, { shift, alt }),
              { shift, alt }
            )
        : onStep && ((up, shift, alt) => onStep(up, { shift, alt })),
    line,
    quiet: locked !== undefined
  })

  const typing = typed.typed !== undefined
  const showChip = chip !== undefined && !typing
  const offers = tokens !== undefined || picker !== undefined
  // What the chevron opens, as it's named and hinted: the list's own name, Tokens, or Options where it holds only words.
  let listName = tokens?.name ?? "Tokens"

  if (tokens?.name === undefined && tokens?.list.length === 0 && tokens.keywords !== undefined) {
    listName = "Options"
  }

  const open = picker ? picker.open : listOpen
  const setOpen = picker ? picker.onOpenChange : setListOpen
  const said = refused ? notAToken(refused.nearest, refused.onUse, own?.same) : refusal
  const error = typed.error || said !== undefined
  // The line under the row, which the input points at while it says something, so it's read again on coming back.
  const messageId = `${searchId}-message`
  const saysSomething = !line && (typed.message !== undefined || (said !== undefined && typed.typed === undefined))

  const clearTyping = () => {
    typed.setTyped(undefined)
    typed.setMessage(undefined)
  }

  // The search list, while the field's focused: what's typed finds, the highlighted one previewed.
  const found = search && searching && typed.focused ? search.options(typed.typed ?? "") : []
  const nothingFound = found.length === 0 ? search?.empty?.(typed.typed ?? "") : undefined

  const showList =
    search !== undefined && searching && typed.focused && (found.length > 0 || nothingFound !== undefined)

  const lit = Math.min(highlight, found.length - 1)

  const closeSearch = () => {
    setSearching(false)
    search?.onHighlight?.(undefined)
  }

  const highlightAt = (index: number) => {
    setHighlight(index)
    search?.onHighlight?.(found[index]?.value)
  }

  const take = (value: T) => {
    onCommit(value)
    clearTyping()
    closeSearch()
    // Left once the typing's cleared, so leaving doesn't read what was typed to search.
    requestAnimationFrame(() => input.current?.blur())
  }

  // The row's name drags the value too, as Figma's labels do, where the field drags at all.
  useRowScrub(
    scrubbing && !disabled
      ? (event) => {
          clearTyping()
          scrub(scrubbing.from, scrubbing.apply, scrubbing.by, live, perLayer)(event)
        }
      : undefined
  )

  let labelSlot: ReactNode

  if (inner !== undefined && scrubbing) {
    const handler = scrub(scrubbing.from, scrubbing.apply, scrubbing.by, live, perLayer)
    labelSlot = (
      <span
        onPointerDown={(event) => {
          if (event.button !== 0 || disabled) {
            return
          }

          clearTyping()
          handler(event)
        }}
        className="flex shrink-0 cursor-ew-resize touch-none items-center text-muted-foreground select-none"
      >
        {inner}
      </span>
    )
  } else if (textValue.safeParse(inner).success) {
    labelSlot = <span className="shrink-0 text-muted-foreground select-none">{inner}</span>
  } else {
    labelSlot = inner
  }

  let fieldPlaceholder = mixed && shown === undefined ? "Mixed" : placeholder

  if (showChip) {
    fieldPlaceholder = ""
  }

  // A token's problems show on its pill, and a value of its own has no mark; what's left is something missing that
  // isn't a token (a font), and a value set for a theme.
  let mark: ReactNode

  if (!typing) {
    mark = showChip ? status?.theme : (status?.missing ?? status?.theme)
  }

  // The unit always shows, set, unset or focused, so what's typed is read in it. It goes only where there's no number
  // for it to measure: a token's pill, a word shown (Auto, Hug, Mixed) and text typed with a unit of its own (`2rem`,
  // `auto`). A narrow field has room for one thing after the value: its status mark takes the unit's place, which its
  // hint names.
  const typedOwnUnit = typing && /[a-z%°×]\s*$/i.test(typed.typed ?? "")
  const showsWord = !typing && /[a-z]/i.test(shown ?? fieldPlaceholder ?? "")
  const showUnit = unit !== undefined && !typedOwnUnit && !showChip && !showsWord && !(narrow && mark)
  let unitPart: ReactNode

  if (showUnit && unitWord !== undefined) {
    unitPart = <span className="shrink-0 text-muted-foreground">{unitWord}</span>
  } else if (showUnit) {
    unitPart = unit
  }

  const hintLabel = hint?.label ?? (narrow ? `${label}: ${backTo}` : undefined)
  // What a token comes to is in its pill's hint, and a narrow field's in the field's.
  const hintDetail = narrow ? [comesTo, hint?.detail].filter(Boolean).join(". ") || undefined : hint?.detail

  const detach = () => {
    if (!chip) {
      return
    }

    const detaching = chip.onDetach ?? chip.onRemove
    detaching()
    // The pill and Detach go, so the value's text takes the focus.
    input.current?.focus()
  }

  // Backspace takes the token off, as it would a typed value, and the field keeps the focus, empty and typed into, so
  // the pill goes even where the value can't be unset (a shadow's color): what's typed next replaces it, and leaving
  // the field empty, or Escape, puts back what it had.
  const clear = () => {
    if (!chip) {
      return
    }

    chip.onRemove()
    typed.setTyped("")
    input.current?.focus()
  }

  // A field that offers tokens or a picker always shows its chevron at the end, empty, set or holding a token, so it's
  // never found by hovering and never swapped for something else; Detach is in what it opens. A token's pill in a field
  // that offers neither keeps Detach over the box's end, shown on hover or focus.
  const shownEnd = offers && !bare
  const hoverDetach = !bare && !offers && chip !== undefined
  let room = ""

  if (shownEnd) {
    room = "pr-7"
  } else if (hoverDetach) {
    room = "transition-[padding] duration-100 hover:pr-7 focus-within:pr-7"
  }

  const endButtons = (
    <>
      {showChip && hoverDetach && (
        <Hint
          label="Detach"
          detail={chip.token ? `Keeps ${chip.token.detail}, not the token` : "Clears the missing token"}
        >
          <button
            type="button"
            aria-label={`Detach ${label} from ${chip.name}`}
            disabled={disabled}
            onClick={detach}
            className={fieldEndButton}
          >
            <Unlink className="size-3.5" />
          </button>
        </Hint>
      )}
      {picker?.swatch !== undefined && !bare && (
        <Hint label="Picker" detail={altSteps ? undefined : "Alt+Down"}>
          <button
            type="button"
            aria-label={`${label} picker`}
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => setOpen(!open)}
            className={fieldEndButtonShown}
          >
            <ChevronDown className="size-3.5" />
          </button>
        </Hint>
      )}
      {offers && picker?.swatch === undefined && !bare && (
        // The list's one trigger, there whatever the field holds, so what the list's anchored to never leaves while
        // it's open, as a pick sets a token or takes one off.
        <Hint label={picker ? "Picker" : listName} detail={altSteps ? undefined : "Alt+Down"}>
          <PopoverTrigger
            aria-label={`${label} ${picker ? "picker" : listName.toLowerCase()}`}
            disabled={disabled}
            className={fieldEndButtonShown}
          >
            <ChevronDown className="size-3.5" />
          </PopoverTrigger>
        </Hint>
      )}
    </>
  )

  const boxExtra = `flex-1 ${room} ${disabled ? "opacity-50" : ""}`
  const changed = useChanged()

  const box = (
    <Hint label={hintLabel} detail={hintDetail} hidden={open} wait>
      <div className={bare ? bareBox(error, boxExtra) : fieldBox(error, boxExtra)}>
        {changed && <ChangeMark />}
        {labelSlot}
        {picker?.swatch !== undefined && (
          // The picker's one trigger, so it stays before a token's pill: what the picker's anchored to never leaves
          // while it's open, as a pick turns a color into a token or back. Named as the end button is, since both
          // open the picker; the field's text already says what's set.
          <Hint label="Picker">
            <PopoverTrigger
              aria-label={`${label} picker`}
              disabled={disabled}
              className="-ml-0.5 grid size-5 shrink-0 place-items-center rounded-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              {picker.swatch}
            </PopoverTrigger>
          </Hint>
        )}
        {showChip && (
          <TokenChip
            name={chip.name}
            token={chip.token}
            namespace={chip.namespace}
            // The swatch before the pill draws the color, so the pill is the name alone.
            preview={picker?.swatch === undefined ? chip.preview : null}
            struck={chip.token === undefined && chip.keyword === undefined}
            detail={chip.keyword?.detail}
            about={chip.keyword?.about}
            keepsName={chip.keyword !== undefined}
            overridden={chip.overridden}
            fill={narrow}
            label={label}
            onOpen={offers ? () => setOpen(!open) : undefined}
            hint={!narrow}
            onType={(key) => {
              if (expression && key === "=") {
                expression.onEquals("")
              } else {
                typed.setTyped(key)
              }

              input.current?.focus()
            }}
            onStep={onStep}
            onRemove={clear}
            focusField={{
              focused: () => input.current?.parentElement?.contains(document.activeElement) ?? false,
              focus: () => input.current?.focus()
            }}
          />
        )}
        <input
          ref={input}
          aria-label={label}
          aria-invalid={error || undefined}
          aria-describedby={
            [description !== undefined && `${searchId}-description`, saysSomething && messageId]
              .filter(Boolean)
              .join(" ") || undefined
          }
          disabled={disabled}
          inputMode={inputMode}
          spellCheck={false}
          placeholder={fieldPlaceholder}
          value={typed.typed ?? (showChip ? "" : (shown ?? ""))}
          {...(search && comboboxProps({ listId: searchId, open: showList, highlight: found[lit] ? lit : undefined }))}
          style={inputStyle}
          onChange={(event) => {
            if (expression && event.target.value.startsWith("=")) {
              clearTyping()
              expression.onEquals(event.target.value.slice(1))

              return
            }

            typed.input.onChange(event)

            if (search) {
              setSearching(true)
              setHighlight(0)
            }
          }}
          // Clicked while focused, as after the chevron's list hands focus back, the search opens as on focus.
          onClick={() => {
            expression?.onOpen?.()

            if (search && searchOnFocus && !searching) {
              setSearching(true)
              setHighlight(0)
            }
          }}
          onFocus={(event) => {
            typed.input.onFocus()

            if (editText !== undefined && !typing) {
              typed.setTyped(editText)
            }

            if (selectOnFocus) {
              event.currentTarget.select()
            }

            const from = event.relatedTarget

            // Focus coming back from the chevron's list, on a pick or Escape, leaves the search closed.
            if (search && searchOnFocus && !fromList.current) {
              setSearching(true)
              setHighlight(0)
            }

            fromList.current = false

            // Focus coming back from the expression's own editor, on Enter, Escape or Shift+Tab, leaves it closed.

            if (!(from instanceof Element && from.closest("[data-expression-editor]"))) {
              expression?.onOpen?.()
            }
          }}
          onBlur={() => {
            typed.input.onBlur()

            if (search) {
              closeSearch()
            }
          }}
          onKeyDown={(event) => {
            if (showChip && event.currentTarget.value === "" && (event.key === "Backspace" || event.key === "Delete")) {
              event.preventDefault()
              clear()

              return
            }

            if (expression && event.key === "=") {
              event.preventDefault()
              clearTyping()
              expression.onEquals("")

              return
            }

            if (expression?.onOpen && event.key === "Enter" && !typing) {
              event.preventDefault()
              expression.onOpen()

              return
            }

            // Alt+Down is the chevron's, and a locked field's Up and Down step its value until something's typed.
            const arrowsSearch = search && !event.altKey && (searchOnFocus || searching)

            if (arrowsSearch && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              // Up and Down open the list, then move through it, rather than stepping the value.
              event.preventDefault()

              if (!searching) {
                setSearching(true)
                setHighlight(0)
              } else if (found.length > 0) {
                highlightAt((lit + (event.key === "ArrowDown" ? 1 : -1) + found.length) % found.length)
              }

              return
            }

            if (search && event.key === "Enter" && showList && found[lit]) {
              event.preventDefault()
              take(found[lit].value)

              return
            }

            if (search && event.key === "Escape" && searching) {
              closeSearch()

              // Escape closes the list first; the next one leaves the field.
              if (!typing) {
                return
              }
            }

            if (offers && !altSteps && event.key === "ArrowDown" && event.altKey) {
              event.preventDefault()
              setOpen(true)

              return
            }

            typed.input.onKeyDown(event)
          }}
          className={`${inputBase} ${showChip ? "min-w-1" : "min-w-6"} ${muted && !typing ? "text-muted-foreground" : ""} ${said && !typing ? "text-destructive" : ""} ${typed.focused ? "" : "truncate"} ${bare ? "text-center" : ""} ${inputClassName}`}
        />
        {comesTo && !narrow && !showChip && !typed.focused && !typed.error && (
          <span className="min-w-0 shrink truncate text-muted-foreground tabular-nums">{comesTo}</span>
        )}
        {unitPart}
        {mark}
        {endButtons}
        {description !== undefined && (
          <span id={`${searchId}-description`} className="sr-only">
            {description}
          </span>
        )}
      </div>
    </Hint>
  )

  let message = typed.message

  if (!message && said && !typing) {
    message = { tone: "error", text: said.reason, action: said.action }
  }

  let popup: ReactNode

  if (picker) {
    popup = (
      <PopoverContent
        aria-label={`${label} picker`}
        className={picker.className ?? "w-64 gap-0 p-0"}
        align="start"
        // As the token list does: the focus comes back to the value's text, and the search doesn't open over it.
        finalFocus={() => {
          picked.current = false
          fromList.current = true

          return input.current
        }}
      >
        {picker.content}
        {/* Last, as in the token list. */}
        {showChip && chip.token && (
          <div className="border-t p-1">
            <DetachRow
              token={chip.token}
              onDetach={() => {
                picker.onOpenChange(false)
                detach()
              }}
            />
          </div>
        )}
      </PopoverContent>
    )
  } else if (tokens) {
    const close = () => {
      picked.current = true
      clearTyping()
      setListOpen(false)
    }

    const replacement = chip?.token?.deprecated
    const replacedBy = replacement === undefined ? undefined : tokens.list.find((each) => each.name === replacement)
    const onAllow = own?.onAllow
    const onCreate = own?.onCreate
    popup = (
      <PopoverContent
        aria-label={`${label} ${listName.toLowerCase()}`}
        // Text styles' names are drawn in their own type, so their list is wider.
        className={`${tokens.list[0]?.kind === "type-style" ? "w-80" : "w-60"} gap-0 p-1`}
        align="end"
        finalFocus={() => {
          picked.current = false
          fromList.current = true

          return input.current
        }}
      >
        <TokenMenu
          label={label}
          tokens={tokens.list}
          current={tokens.current}
          none={tokens.none}
          noneValue={tokens.noneValue}
          own={own?.text}
          holdsOwn={(chip === undefined || chip.keyword !== undefined) && shown !== undefined && shown !== ""}
          nearest={own?.nearest}
          same={own?.same}
          replaced={chip && replacedBy ? { name: chip.name, by: replacedBy } : undefined}
          namespace={own?.namespace ?? chip?.namespace}
          tokensOnly={own?.tokensOnly}
          allowed={own?.allowed}
          onAllow={
            onAllow &&
            ((reason) => {
              onAllow(reason)
              close()
            })
          }
          onCreate={
            onCreate &&
            ((name) => {
              onCreate(name)
              close()
            })
          }
          onPick={(name) => {
            tokens.onPick(name)
            close()
          }}
          shown={tokens.shown}
          keywords={
            tokens.keywords && {
              ...tokens.keywords,
              rows: tokens.keywords.rows.map((row) => ({
                ...row,
                onPick: () => {
                  row.onPick()
                  close()
                }
              })),
              actions: tokens.keywords.actions?.map((action) => ({
                ...action,
                onPick: () => {
                  action.onPick()
                  close()
                }
              }))
            }
          }
        />
        {showChip && chip.token && (
          <div className="mt-1 border-t pt-1">
            <DetachRow
              token={chip.token}
              onDetach={() => {
                close()
                detach()
              }}
            />
          </div>
        )}
      </PopoverContent>
    )
  }

  return (
    <>
      <div className={`flex min-w-0 items-center gap-1 ${search ? "relative" : ""} ${rowClassName}`}>
        {popup ? (
          <Popover open={open} onOpenChange={setOpen}>
            {box}
            {popup}
          </Popover>
        ) : (
          box
        )}
        {trailing}
        {showList && (
          <SearchList
            id={searchId}
            label={search.label}
            options={found}
            highlight={lit}
            empty={nothingFound}
            // As wide as what it lists, so a narrow field's names read whole, and never narrower than the field.
            className="absolute top-full left-0 z-30 mt-1 w-max max-w-72 min-w-full"
            tall={search.tall}
            onHighlight={highlightAt}
            onPick={(index) => take(found[index]!.value)}
          />
        )}
      </div>
      {!line && <MessageLine id={messageId} message={message} />}
      {!line && !message && narrow && typed.focused && comesTo && (
        <p className="col-span-full mt-1 type-description text-muted-foreground">{comesTo}</p>
      )}
    </>
  )
}

/** The step Up and Down take in a percentage: 1, 10 with Shift, a quarter with Alt. */
export { stepToken, tokenNamed } from "./token-scale.ts"
