import { Eye, MessageSquarePlus } from "lucide-react"
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import type { ThreadData } from "./collab-data.ts"
import { commentBlue, Thread } from "./comments.tsx"
import { CommentPin, LayerOutline, PinPreview, type PinState } from "./pins.tsx"
import { Board, type Marker } from "./stage.tsx"

/** A thread pinned on a board. */
export interface Pinned {
  id: string
  thread: ThreadData
  /** Where the pin's point is, in the board's coordinates. */
  x: number
  y: number
  /** The layer it's pinned to, outlined while its pin is hovered or open. */
  layer?: { id: string; name: string }
  /** The area it's about, dashed while its pin is hovered or open. */
  area?: { x: number; y: number; width: number; height: number }
  deleted?: boolean
}

/** Keeps a value rendered for `ms` after it goes away, so it can animate out; `state` says which way it's going. */
function useExit<T>(value: T | undefined, ms: number): { shown: T | undefined; state: "open" | "closed" } {
  const [last, setLast] = useState(value)
  if (value !== undefined && value !== last) setLast(value)
  useEffect(() => {
    if (value !== undefined) return undefined
    const timer = window.setTimeout(() => setLast(undefined), ms)
    return () => window.clearTimeout(timer)
  }, [value, ms])
  return { shown: value ?? last, state: value !== undefined ? "open" : "closed" }
}

const animated =
  "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out [animation-fill-mode:forwards]"
const pinMotion = `${animated} origin-bottom-left duration-200 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-50 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-50`
const previewMotion = `${animated} origin-top-left duration-150 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-left-1 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95`
const threadMotion = `${animated} origin-top-left duration-200 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-90 data-[state=open]:slide-in-from-left-2 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-90 data-[state=closed]:slide-out-to-left-2`

/** How a thread's pin looks, from its thread and whether it's open. */
function pinState(thread: ThreadData, open: boolean, draft: boolean): PinState {
  if (draft) return "draft"
  if (open) return "selected"
  if (thread.resolved) return "resolved"
  if (thread.working) return "working"
  return thread.unread ? "unread" : "default"
}

/**
 * One pin with what hangs off it: the preview while it's hovered and the thread while it's open, both beside the pin
 * and growing out of it. The pin pops in and out as it's shown, resolved away or deleted.
 */
function LivePin({
  pin,
  visible,
  open,
  hovered,
  draft = false,
  onToggle,
  onHover,
  onLeave,
  children
}: {
  pin: Pinned
  visible: boolean
  open: boolean
  hovered: boolean
  draft?: boolean
  onToggle: () => void
  onHover: () => void
  onLeave: () => void
  /** The thread, while it's open. */
  children: ReactNode
}) {
  const shownPin = useExit(visible ? pin.id : undefined, 240)
  const shownThread = useExit(open ? pin.id : undefined, 200)
  const shownPreview = useExit(hovered && !open && !draft ? pin.id : undefined, 150)
  if (!shownPin.shown && !shownThread.shown) return null
  const people = [...new Set(pin.thread.comments.map((comment) => comment.author))]
  const first = people[0]
  let layer = "z-10"
  if (open) layer = "z-30"
  else if (hovered) layer = "z-20"
  return (
    <div className={`absolute ${layer}`} style={{ left: pin.x, top: pin.y }}>
      <span className="absolute top-[-28px] left-0 block">
        {shownPin.shown && (
          <button
            type="button"
            data-state={shownPin.state}
            aria-expanded={open}
            aria-label={draft ? "New comment" : `Comment from ${first?.name ?? "you"}`}
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
            onMouseEnter={onHover}
            onMouseLeave={onLeave}
            onFocus={onHover}
            onBlur={onLeave}
            className={`block rounded-[18px] rounded-bl-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${pinMotion}`}
          >
            <span
              className={`block origin-bottom-left transition-transform duration-150 ease-out ${open ? "" : "hover:scale-110"}`}
            >
              <CommentPin
                people={people}
                replies={pin.thread.comments.length > 1 ? pin.thread.comments.length - 1 : undefined}
                state={pinState(pin.thread, open, draft)}
              />
            </span>
          </button>
        )}
        {shownPreview.shown && (
          <div data-state={shownPreview.state} className={`absolute top-0 left-full ml-2 ${previewMotion}`}>
            <PinPreview thread={pin.thread} />
          </div>
        )}
        {shownThread.shown && (
          <div
            data-state={shownThread.state}
            className={`absolute top-0 left-full ml-2 ${threadMotion}`}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {children}
          </div>
        )}
      </span>
    </div>
  )
}

/** Comment mode's cursor: a pin-shaped bubble with a plus, its sharp corner where the comment goes. */
const commentCursor = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><path d="M2 24V13a11 11 0 1 1 11 11Z" fill="white" stroke="#111" stroke-width="1.5"/><path d="M13 8.5v9M8.5 13h9" stroke="#111" stroke-width="1.8" stroke-linecap="round"/></svg>'
)}") 2 24, crosshair`

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined)
}

/**
 * A board you can comment on, as the canvas would behave. Hovering a pin lifts it and shows a preview; clicking opens
 * its thread, growing out of the pin; closing (the X, Esc, a click on the design, or the pin again) folds it back.
 * Resolving hides the pin unless Resolved is on, Mark as unread rings it, Delete pops it away with an undo, and Copy
 * link copies a link to the thread. With Comment on (or C), clicking the design starts a new thread there.
 */
export function LiveBoard({
  name,
  frame,
  initial,
  design
}: {
  name: string
  frame?: string
  initial: Pinned[]
  /** The design, given a marker that outlines the layer of the pin that's hovered or open. */
  design: (mark: Marker) => ReactNode
}) {
  const [pins, setPins] = useState(initial)
  const [open, setOpen] = useState<string>()
  const [hovered, setHovered] = useState<string>()
  const [showResolved, setShowResolved] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const [draft, setDraft] = useState<Pinned>()
  const [toast, setToast] = useState<{ text: string; undo?(): void }>()
  const hoverTimer = useRef(0)
  const toastTimer = useRef(0)

  const say = (text: string, undo?: () => void) => {
    setToast({ text, undo })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(undefined), 3000)
  }
  const patch = (id: string, change: (pin: Pinned) => Pinned) =>
    setPins((current) => current.map((pin) => (pin.id === id ? change(pin) : pin)))
  const close = () => {
    setOpen(undefined)
    setDraft(undefined)
  }
  const toggle = (id: string) => {
    setDraft(undefined)
    if (open === id) return setOpen(undefined)
    setOpen(id)
    patch(id, (pin) => ({ ...pin, thread: { ...pin.thread, unread: false } }))
  }
  const change = (id: string, next: ThreadData) => {
    const before = pins.find((pin) => pin.id === id)?.thread
    patch(id, (pin) => ({ ...pin, thread: next }))
    // Resolving shows who resolved it for a moment, then folds the thread away and its pin with it.
    if (!before?.resolved && next.resolved)
      window.setTimeout(() => setOpen((current) => (current === id ? undefined : current)), 900)
  }
  const hover = (id: string) => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHovered(id), 150)
  }
  const leave = () => {
    window.clearTimeout(hoverTimer.current)
    setHovered(undefined)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.defaultPrevented || target?.closest?.("[data-radix-popper-content-wrapper]")) return
      const typing = target?.closest?.("input, textarea, [contenteditable='true']")
      if (event.key === "Escape") {
        if (open || draft) {
          setOpen(undefined)
          setDraft(undefined)
        } else setCommenting(false)
      } else if (event.key.toLowerCase() === "c" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        setCommenting((current) => !current)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, draft])

  const onDesign = (event: PointerEvent<HTMLDivElement>) => {
    if (open || draft) return close()
    if (!commenting) return
    const box = event.currentTarget.getBoundingClientRect()
    const scale = box.width / event.currentTarget.offsetWidth || 1
    const id = `new-${Date.now()}`
    setDraft({
      id,
      x: (event.clientX - box.left) / scale,
      y: (event.clientY - box.top) / scale,
      thread: { id, design: name, frame, comments: [] }
    })
  }

  const active = (pin: Pinned) => !pin.deleted && (pin.id === open || pin.id === hovered)
  const mark: Marker = (id, element) => {
    const pin = pins.find((candidate) => candidate.layer?.id === id && active(candidate))
    return pin ? <LayerOutline name={pin.layer!.name}>{element}</LayerOutline> : element
  }
  const resolved = pins.filter((pin) => !pin.deleted && pin.thread.resolved).length

  return (
    <div className="flex w-fit flex-col gap-6">
      <div className="flex w-fit items-center gap-1 rounded-xl border bg-popover p-1 text-sm text-popover-foreground shadow-xl">
        <Button
          size="sm"
          variant={commenting ? "secondary" : "ghost"}
          aria-pressed={commenting}
          onClick={() => setCommenting(!commenting)}
          className="gap-1.5"
        >
          <MessageSquarePlus style={{ color: commentBlue }} /> Comment <Kbd className="ml-0.5">C</Kbd>
        </Button>
        <Button
          size="sm"
          variant={showResolved ? "secondary" : "ghost"}
          aria-pressed={showResolved}
          onClick={() => setShowResolved(!showResolved)}
          className="gap-1.5"
        >
          <Eye /> Resolved <span className="text-muted-foreground tabular-nums">{resolved}</span>
        </Button>
        {commenting && <span className="px-2 text-xs text-muted-foreground">Click the design to comment</span>}
      </div>
      <Board name={name} frame={frame}>
        <div onPointerDown={onDesign} style={commenting ? { cursor: commentCursor } : undefined}>
          {design(mark)}
        </div>
        {pins
          .filter((pin) => pin.area && active(pin))
          .map((pin) => (
            <div
              key={`area:${pin.id}`}
              data-state="open"
              className={`pointer-events-none absolute rounded-md border-[1.5px] border-dashed ${animated} duration-150 data-[state=open]:fade-in-0`}
              style={{
                left: pin.area!.x,
                top: pin.area!.y,
                width: pin.area!.width,
                height: pin.area!.height,
                borderColor: commentBlue,
                background: `color-mix(in oklch, ${commentBlue} 8%, transparent)`
              }}
            />
          ))}
        {pins.map((pin) => (
          <LivePin
            key={pin.id}
            pin={pin}
            visible={!pin.deleted && (!pin.thread.resolved || showResolved || pin.id === open)}
            open={pin.id === open}
            hovered={pin.id === hovered}
            onToggle={() => toggle(pin.id)}
            onHover={() => hover(pin.id)}
            onLeave={leave}
          >
            <Thread
              thread={pin.thread}
              onChange={(next) => change(pin.id, next)}
              onClose={() => setOpen(undefined)}
              onMarkUnread={() => {
                patch(pin.id, (current) => ({ ...current, thread: { ...current.thread, unread: true } }))
                setOpen(undefined)
              }}
              onCopyLink={() => {
                copy(`parity://buildkit/website/pricing?thread=${pin.id}`)
                say("Link to this thread copied")
              }}
              onDelete={() => {
                patch(pin.id, (current) => ({ ...current, deleted: true }))
                setOpen(undefined)
                say("Thread deleted", () => patch(pin.id, (current) => ({ ...current, deleted: false })))
              }}
            />
          </LivePin>
        ))}
        {draft && (
          <LivePin
            key={draft.id}
            pin={draft}
            visible
            open
            draft
            hovered={false}
            onToggle={() => setDraft(undefined)}
            onHover={() => undefined}
            onLeave={() => undefined}
          >
            <Thread
              thread={draft.thread}
              onChange={(next) => {
                if (!next.comments.length) return
                setPins((current) => [...current, { ...draft, thread: next }])
                setDraft(undefined)
                setOpen(draft.id)
              }}
              onClose={() => setDraft(undefined)}
            />
          </LivePin>
        )}
        {toast && (
          <div
            data-state="open"
            className={`absolute -bottom-14 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-popover py-1.5 pr-1.5 pl-3 text-sm whitespace-nowrap text-popover-foreground shadow-xl ${animated} duration-150 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2`}
          >
            {toast.text}
            {toast.undo && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  toast.undo?.()
                  setToast(undefined)
                }}
              >
                Undo
              </Button>
            )}
          </div>
        )}
      </Board>
    </div>
  )
}
