import { LoaderCircle, Sparkles } from "lucide-react"
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { PresenceEvent } from "../../shared/protocol.ts"
import { useProject } from "../canvas/context.ts"
import { findFrames, findNodeElement } from "../frame.ts"
import { type AgentPalette, agentColors, agentPalettes } from "./agent-colors.ts"
import { ActionIcon, AgentBadge, AgentPointer } from "./AgentPointer.tsx"
import { heldBoards } from "./held-boards.ts"
import {
  arcPoint,
  type Box,
  breathe,
  curvePoint,
  easeInOutCubic,
  easeInOutSettle,
  focusOffset,
  glanceOffset,
  paceFor,
  type Point,
  travelMs
} from "./motion.ts"
import { presence, usePresenceVersion } from "./presence.ts"
import { type Scan, scanCoveredShare, Scanner, scanMs } from "./scanner.ts"

/** How long a cursor waits near its last target for the agent's next call before it fades. */
const lingerMs = 20_000

/** Something the agent looks at, found again each time it's asked for, so it follows the canvas as it pans. */
interface Target {
  box(): Box
  element(): HTMLElement | undefined
}

/** A measurement's size label, under what was measured while the agent looks at it. */
interface Label {
  id: number
  target: Target
  leaving: boolean
}

interface Activity {
  agent: string
  label?: string
  kind?: PresenceEvent["kind"]
  done: boolean
  error?: string
}

/**
 * Shows agents at work, like collaborators' cursors: one per agent, each in its own colors. A cursor travels to what
 * its agent reads or changes at a person's pace, lingers there glancing around, and scans it so people can see what's
 * being looked at. Strips in the corner say who each agent is and what its current call is doing.
 */
export function AgentPresence() {
  const session = useProject()
  // Renders again with every presence change, so cursors come and go with their agents.
  usePresenceVersion()
  const rootRef = useRef<HTMLDivElement>(null)
  const scanner = useRef<Scanner>(undefined)
  const agents = presence.agents(session.id)

  useEffect(() => presence.watch(session.id), [session.id])

  // One scanner draws every agent's scans, so scans of the same thing can mix their colors. Its canvas exists only
  // while an agent is at work.
  const scanCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) return undefined
    const created = new Scanner(canvas)
    scanner.current = created
    return () => {
      created.dispose()
      if (scanner.current === created) scanner.current = undefined
    }
  }, [])

  const done = useCallback((agent: string) => presence.retire(session.id, agent), [session.id])
  const scan = useCallback((next: Scan) => scanner.current?.scan(next), [])

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0 z-[400] overflow-hidden">
      {agents.length > 0 && (
        <canvas ref={scanCanvas} className="pointer-events-none invisible absolute inset-0 size-full" />
      )}
      {agents.map((agent, index) => (
        <AgentCursor key={agent} agent={agent} index={index} root={rootRef} onDone={done} onScan={scan} />
      ))}
    </div>
  )
}

/** One agent's cursor, scans and strip, playing its queue until it has been idle a while. */
function AgentCursor({
  agent,
  index,
  root,
  onDone,
  onScan
}: {
  agent: string
  index: number
  root: RefObject<HTMLDivElement | null>
  onDone: (agent: string) => void
  onScan: (scan: Scan) => void
}) {
  const session = useProject()
  const version = usePresenceVersion()
  const cursorRef = useRef<HTMLDivElement>(null)
  const [activity, setActivity] = useState<Activity>()
  const [palette, setPalette] = useState<AgentPalette>()
  const [labels, setLabels] = useState<Label[]>([])
  const playing = useRef(false)
  const mounted = useRef(true)
  const nextId = useRef(1)
  const cursor = useRef<{ at: Point; visible: boolean }>({ at: { x: 0, y: 0 }, visible: false })
  const editor = useRef(session.editor)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      agentColors.release(agent)
    }
  }, [agent])

  useEffect(() => {
    editor.current = session.editor
  }, [session.editor])

  useEffect(() => {
    if (playing.current) return
    const area = root.current?.parentElement
    const pointer = cursorRef.current
    if (!area || !pointer) return
    playing.current = true
    const tab = session.id
    const alive = () => mounted.current
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches

    const show = (at: Point, visible = cursor.current.visible) => {
      cursor.current = { at, visible }
      pointer.style.transform = `translate(${at.x}px, ${at.y}px)`
      pointer.style.opacity = visible ? "1" : "0"
    }
    // Travels along a curve, an arc or now and then an S, landing with a small overshoot.
    const travel = (to: () => Point, ms: number) => {
      const from = cursor.current.at
      const side = Math.random() < 0.5 ? -1 : 1
      const bendA = side * (0.1 + Math.random() * 0.18)
      const bendB = Math.random() < 0.35 ? -bendA * 0.8 : bendA * (0.4 + Math.random() * 0.5)
      return animate(still ? 0 : ms, (t) => show(curvePoint(from, to(), easeInOutSettle(t, 0.45), bendA, bendB)), alive)
    }
    const at = (target: Target, offset: Point) => () => {
      const box = target.box()
      return { x: box.x + offset.x, y: box.y + offset.y }
    }
    // Lingers on a target: it breathes around a resting spot that wanders slowly between nearby points, never quite
    // still, as a hand on a mouse is while its person reads. Idling between calls it breathes slower and wider, with a
    // soft pulse, and stops the moment the agent's next call arrives.
    const look = (target: Target, ms: number, idle = false) => {
      const going = idle ? () => alive() && presence.waiting(tab, agent) === 0 : alive
      if (still) return pause(ms)
      const began = performance.now()
      const first = target.box()
      const radius = Math.max(3, Math.min(Math.min(first.w, first.h) * 0.12, idle ? 16 : 9))
      const seed = Math.random() * 10
      // Offsets from the target's top left, so the spot moves with the canvas.
      let from = { x: cursor.current.at.x - first.x, y: cursor.current.at.y - first.y }
      let next = glanceOffset(first)
      let legStart = began
      let legMs = idle ? 2400 : 1300
      pointer.dataset.idle = String(idle)
      return animate(
        ms,
        () => {
          const now = performance.now()
          if (now - legStart >= legMs) {
            from = next
            next = glanceOffset(target.box())
            legStart = now
            legMs = (idle ? 2200 : 1100) + Math.random() * (idle ? 1800 : 900)
          }
          const leg = easeInOutCubic((now - legStart) / legMs)
          const box = target.box()
          // The breath grows in from nothing, so the cursor doesn't jump when it starts.
          const drift = breathe(
            ((now - began) / 1000) * (idle ? 0.7 : 1),
            radius * Math.min(1, (now - began) / 700),
            seed
          )
          show({
            x: box.x + from.x + (next.x - from.x) * leg + drift.x,
            y: box.y + from.y + (next.y - from.y) * leg + drift.y
          })
        },
        going
      ).finally(() => {
        pointer.dataset.idle = "false"
      })
    }
    // Travels to a target's focus point, appearing beside it if the cursor isn't showing yet.
    const approach = async (target: Target, pace: number) => {
      last = target
      const focus = at(target, focusOffset(target.box()))
      if (!cursor.current.visible) {
        const start = focus()
        show({ x: start.x + 56, y: start.y + 40 }, true)
      }
      await travel(focus, travelMs(cursor.current.at, focus()) * pace)
    }
    const press = (down: boolean) => {
      const arrow = pointer.querySelector("svg")
      if (arrow) arrow.style.transform = down ? "scale(0.82)" : ""
    }
    // Grabs a moved board where it was held and drags it to where the agent put it, board and cursor together.
    const drag = async (event: PresenceEvent) => {
      const { design, from, to } = event
      if (!design || !from || !to) return
      const pace = paceFor(presence.waiting(tab, agent))
      try {
        const target = locate(area, event)
        if (!target) return await pause(300 * pace)
        await approach(target, pace)
        await pause(260 * pace)
        press(true)
        await pause(140 * pace)
        const grab = cursor.current.at
        const zoom = editor.current?.getZoomLevel() ?? 1
        const span = Math.hypot(to.x - from.x, to.y - from.y) * zoom
        const bend = (Math.random() < 0.5 ? -1 : 1) * 0.05
        await animate(
          still ? 0 : Math.max(1000, travelMs({ x: 0, y: 0 }, { x: span, y: 0 }) * 1.6) * pace,
          (t) => {
            const now = arcPoint(from, to, easeInOutCubic(t), bend)
            heldBoards.set(tab, design, now)
            show({ x: grab.x + (now.x - from.x) * zoom, y: grab.y + (now.y - from.y) * zoom })
          },
          alive
        )
        await pause(180 * pace)
        press(false)
        await pause(500 * pace)
      } finally {
        heldBoards.finish(tab, design, to)
      }
    }
    const visit = async (event: PresenceEvent, kind: PresenceEvent["kind"]) => {
      const pace = paceFor(presence.waiting(tab, agent))
      const target = locate(area, event)
      if (!target) return pause(300 * pace)
      await approach(target, pace)
      const ms = scanMs * pace
      onScan({ box: () => target.box(), radius: cornerRadius(target), palette: colors, agent, ms })
      const id = kind === "measure" ? nextId.current++ : undefined
      if (id !== undefined) setLabels((current) => [...current.slice(-3), { id, target, leaving: false }])
      // The cursor stays until the scan has covered its target; the glow fades on as it moves on.
      await look(target, ms * scanCoveredShare)
      if (id === undefined) return
      setLabels((current) => current.map((label) => (label.id === id ? { ...label, leaving: true } : label)))
      setTimeout(() => setLabels((current) => current.filter((label) => label.id !== id)), 600)
    }

    let last: Target | undefined
    let colors = agentPalettes[0]!
    const play = async () => {
      let idleSince: number | undefined
      while (alive()) {
        const event = presence.take(tab, agent)
        if (!event) {
          // Agents think between calls: stay near what it last looked at, so the next call picks up from there.
          idleSince ??= performance.now()
          if (performance.now() - idleSince > lingerMs) {
            show(cursor.current.at, false)
            setActivity(undefined)
            playing.current = false
            // Let the cursor fade before it goes, and its colors with it.
            await pause(400)
            if (alive() && !playing.current) onDone(agent)
            return
          }
          await (last && cursor.current.visible
            ? look(last, lingerMs - (performance.now() - idleSince), true)
            : pause(250))
          continue
        }
        idleSince = undefined
        const name = event.agent ?? "Agent"
        colors = agentColors.claim(agent, name)
        setPalette(colors)
        if (event.kind === "start") {
          setActivity({ agent: name, label: event.label, kind: "start", done: false })
          await pause(60)
        } else if (event.kind === "end") {
          setActivity((current) => ({
            ...current,
            agent: name,
            label: event.label ?? current?.label,
            done: true,
            error: event.error
          }))
          await pause(60)
        } else {
          setActivity((current) => ({
            agent: name,
            label: event.label ?? current?.label,
            kind: event.kind,
            done: false
          }))
          if (event.kind === "move") await drag(event)
          else await visit(event, event.kind)
        }
      }
      playing.current = false
    }
    void play()
  }, [version, session.id, agent, root, onDone, onScan])

  const color = palette?.color ?? "var(--canvas-agent)"
  return (
    <>
      {palette && labels.map((label) => <MeasureLabel key={label.id} label={label} palette={palette} />)}
      <div
        ref={cursorRef}
        data-idle="false"
        className="group/cursor absolute top-0 left-0 opacity-0 transition-opacity duration-300"
      >
        <AgentPointer palette={palette} />
        <AgentBadge
          palette={palette}
          agent={activity?.agent ?? "Agent"}
          kind={activity?.done ? undefined : activity?.kind}
          label={activity?.label}
        />
      </div>
      {activity && (
        <div
          className="absolute left-3 flex max-w-96 items-center gap-2 rounded-lg border bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{ bottom: 12 + index * 44 }}
        >
          {activity.done ? (
            <Sparkles className="size-3.5 shrink-0" style={{ color: activity.error ? "var(--destructive)" : color }} />
          ) : (
            <LoaderCircle className="size-3.5 shrink-0 animate-spin" style={{ color }} />
          )}
          <span className="shrink-0 font-medium">{activity.agent}</span>
          <span className="min-w-0 truncate text-muted-foreground">
            {activity.error ?? activity.label ?? "Working"}
            {activity.done && !activity.error ? ", done" : ""}
          </span>
          {!activity.done && activity.kind !== "start" && (
            <ActionIcon kind={activity.kind} className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </div>
      )}
    </>
  )
}

/** A measurement's size, in CSS pixels as the design lays it out, under what was measured. */
function MeasureLabel({ label, palette }: { label: Label; palette: AgentPalette }) {
  const { target, leaving } = label
  const ref = useRef<HTMLDivElement>(null)
  const element = target.element()
  const size = element && { w: Math.round(element.offsetWidth), h: Math.round(element.offsetHeight) }

  useLayoutEffect(() => {
    let frame = 0
    const follow = () => {
      const box = target.box()
      const style = ref.current?.style
      if (style) {
        style.left = `${box.x + box.w / 2}px`
        style.top = `${box.y + box.h}px`
      }
      frame = requestAnimationFrame(follow)
    }
    follow()
    return () => cancelAnimationFrame(frame)
  }, [target])

  if (!size) return null
  return (
    <div
      ref={ref}
      className={`absolute mt-1.5 -translate-x-1/2 rounded px-1.5 py-px text-[10px] font-medium whitespace-nowrap tabular-nums shadow transition-opacity duration-500 ${leaving ? "opacity-0" : "opacity-100"}`}
      style={{ background: palette.color, color: palette.ink }}
    >
      {size.w} × {size.h}
    </div>
  )
}

/** A target's corner radius on screen, so its scan has the same shape. */
function cornerRadius(target: Target): number {
  const element = target.element()
  if (!element?.offsetWidth) return 0
  const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0
  return radius * (target.box().w / element.offsetWidth)
}

/** Runs `frame` with progress from 0 to 1 over `ms`, one call per animation frame. */
function animate(ms: number, frame: (t: number) => void, alive: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now()
    const tick = (now: number) => {
      if (!alive()) return resolve()
      const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms)
      frame(t)
      if (t < 1) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}

/**
 * The element an event is about, and where it is relative to the canvas area. Undefined when it isn't drawn or is
 * out of view, as the canvas culls boards it has scrolled past.
 */
function locate(area: HTMLElement, event: PresenceEvent): Target | undefined {
  let element = targetElement(area, event)
  if (!element) return undefined
  const relative = (rect: DOMRect): Box => {
    const areaRect = area.getBoundingClientRect()
    return { x: rect.left - areaRect.left, y: rect.top - areaRect.top, w: rect.width, h: rect.height }
  }
  let last = relative(element.getBoundingClientRect())
  const { width, height } = area.getBoundingClientRect()
  const inView = last.x < width && last.y < height && last.x + last.w > 0 && last.y + last.h > 0
  if (last.w === 0 || last.h === 0 || !inView) return undefined
  return {
    box: () => {
      // A write can draw the element again; find the new one, or stay where it was.
      if (!element?.isConnected) element = targetElement(area, event)
      if (element) last = relative(element.getBoundingClientRect())
      return last
    },
    element: () => element
  }
}

function targetElement(area: HTMLElement, event: PresenceEvent): HTMLElement | undefined {
  if (!event.design) return undefined
  const frames = findFrames(area, event.design)
  const frame =
    frames.find((host) => host.dataset.mode === event.mode && host.dataset.state === event.state) ??
    frames.find((host) => host.dataset.mode === event.mode) ??
    frames.find((host) => host.dataset.primary === "true")
  if (event.node && frame) {
    const element = findNodeElement(frame, event.node)
    if (element) return element
  }
  // What the agent looks at is the design itself, the screen or component in its frame, not the board around it. A
  // move is of the board, which the cursor drags.
  if (frame && event.kind !== "move") return frame
  return area.querySelector<HTMLElement>(`.container-view[data-design="${CSS.escape(event.design)}"]`) ?? undefined
}
