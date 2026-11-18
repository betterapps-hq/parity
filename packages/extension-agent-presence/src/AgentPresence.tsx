import { CanvasLayerContext, type CanvasLayerContextValue, useColor, useFrame } from "@parity-app/canvas-layer"
import type { AgentStep } from "@parity-app/extension/internal"
import { AgentBadge, AgentPointer, type PaletteLook } from "@parity-app/presence-ui"
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import {
  arcPoint,
  breathe,
  curvePoint,
  easeInOutCubic,
  easeInOutSettle,
  focusOffset,
  glanceOffset,
  type Point,
  travelMs
} from "./motion.ts"
import type { AgentQueue, QueuedStep } from "./queue.ts"
import { type Scan, scanCoveredShare, Scanner, scanMs } from "./scanner.ts"
import { locate, type Target } from "./targets.ts"

/** How long a cursor waits near its last target for the agent's next call before it fades. */
const lingerMs = 20_000

/** A measurement's size label, under what was measured while the agent looks at it. */
interface Label {
  id: number
  target: Target
  leaving: boolean
}

interface Activity {
  agent: string
  label?: string
  kind?: AgentStep["kind"]
  done: boolean
}

/** The layer the presence is drawn in: its camera, boxes, colors and frames. */
function useLayer(): CanvasLayerContextValue {
  const layer = useContext(CanvasLayerContext)

  if (!layer) {
    throw new Error("AgentPresence draws in a canvas layer, so it only works inside what parity.canvas.layer draws")
  }

  return layer
}

/** Renders again with every change to the queue, so pointers come and go with their agents. */
function useQueueVersion(queue: AgentQueue): number {
  return useSyncExternalStore(queue.subscribe, queue.getVersion)
}

/**
 * Shows agents at work, like collaborators' pointers: one per agent, each in its own colors. A pointer travels to what
 * its agent reads or changes at a person's pace, lingers there glancing around, and scans it so people can see what's
 * being looked at.
 *
 * It's drawn in a page layer, in a pane kept over the canvas's whole view and scaled back to the screen's pixels, so
 * pointers, badges and scans stay the same size at any zoom.
 */
export function AgentPresence({ queue }: { queue: AgentQueue }) {
  const layer = useLayer()
  useQueueVersion(queue)
  const paneRef = useRef<HTMLDivElement>(null)
  const scanner = useRef<Scanner>(undefined)
  const agents = queue.agents()

  useEffect(() => queue.watch(), [queue])

  // The pane covers what's in view, at the screen's scale, moved with the camera in the same frame as the page.
  useFrame({
    draw: () => {
      const pane = paneRef.current

      if (!pane) {
        return
      }

      const { zoom, view } = layer.view()
      pane.style.width = `${view.width * zoom}px`
      pane.style.height = `${view.height * zoom}px`
      pane.style.transform = `translate(${view.x}px, ${view.y}px) scale(${1 / zoom})`
    }
  })

  // One scanner draws every agent's scans, so scans of the same thing can mix their colors. Its canvas exists only
  // while an agent is at work.
  const scanCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) {
      return undefined
    }

    const created = new Scanner(canvas)
    scanner.current = created

    return () => {
      created.dispose()

      if (scanner.current === created) {
        scanner.current = undefined
      }
    }
  }, [])

  const done = useCallback((agent: string) => queue.retire(agent), [queue])
  const scan = useCallback((next: Scan) => scanner.current?.scan(next), [])

  return (
    <div
      ref={paneRef}
      data-agent-presence=""
      className="pointer-events-none absolute top-0 left-0 origin-top-left overflow-hidden"
    >
      {agents.length > 0 && (
        <canvas ref={scanCanvas} className="pointer-events-none invisible absolute inset-0 size-full" />
      )}
      {agents.map((agent) => (
        <AgentCursor key={agent} queue={queue} agent={agent} onDone={done} onScan={scan} />
      ))}
    </div>
  )
}

/** One agent's pointer and scans, playing its queue until it has been idle a while. */
function AgentCursor({
  queue,
  agent,
  onDone,
  onScan
}: {
  queue: AgentQueue
  agent: string
  onDone: (agent: string) => void
  onScan: (scan: Scan) => void
}) {
  const layer = useLayer()
  const version = useQueueVersion(queue)
  const cursorRef = useRef<HTMLDivElement>(null)
  const [activity, setActivity] = useState<Activity>()
  // Claimed from agents' colors while its pointer is drawn, under the agent's key.
  const palette = useColor(agent, "agents")
  const colors = useRef<PaletteLook>(palette)
  const [labels, setLabels] = useState<Label[]>([])
  const playing = useRef(false)
  const mounted = useRef(true)
  const nextId = useRef(1)
  const cursor = useRef<{ at: Point; visible: boolean }>({ at: { x: 0, y: 0 }, visible: false })

  useEffect(() => {
    colors.current = palette
  }, [palette])

  useEffect(() => {
    mounted.current = true

    return () => {
      mounted.current = false
    }
  }, [agent])

  useEffect(() => {
    if (playing.current) {
      return
    }

    const pointer = cursorRef.current

    if (!pointer) {
      return
    }

    playing.current = true
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
      const going = idle ? () => alive() && queue.waiting(agent) === 0 : alive

      if (still) {
        return pause(ms)
      }

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

      if (arrow) {
        arrow.style.transform = down ? "scale(0.82)" : ""
      }
    }

    // Grabs a moved board where it was held and drags it to where the agent put it, board and cursor together.
    const drag = async (event: QueuedStep) => {
      const { from, to } = event

      if (!from || !to) {
        return
      }

      const pace = queue.pace(agent, event)

      try {
        const target = locate(layer, event)

        if (!target) {
          return await pause(300 * pace)
        }

        await approach(target, pace)
        await pause(260 * pace)
        press(true)
        await pause(140 * pace)
        const grab = cursor.current.at
        const { zoom } = layer.view()
        const span = Math.hypot(to.x - from.x, to.y - from.y) * zoom
        const bend = (Math.random() < 0.5 ? -1 : 1) * 0.05

        // The drag lands before core lets go of the board, however long the queue took to get here.
        const ms = Math.min(
          still ? 0 : Math.max(1000, travelMs({ x: 0, y: 0 }, { x: span, y: 0 }) * 1.6) * pace,
          Math.max(0, queue.heldFor(event) - 100)
        )

        await animate(
          ms,
          (t) => {
            const now = arcPoint(from, to, easeInOutCubic(t), bend)
            queue.drawHeld(event, now)
            show({ x: grab.x + (now.x - from.x) * zoom, y: grab.y + (now.y - from.y) * zoom })
          },
          alive
        )
        await pause(180 * pace)
        press(false)
        await pause(500 * pace)
      } finally {
        queue.letGo(event, to)
      }
    }

    const visit = async (event: QueuedStep, kind: AgentStep["kind"]) => {
      const pace = queue.pace(agent, event)
      const target = locate(layer, event)

      if (!target) {
        return pause(300 * pace)
      }

      await approach(target, pace)
      const ms = scanMs * pace
      onScan({ box: () => target.box(), radius: target.radius(), palette: colors.current, agent, ms })
      const id = kind === "measure" ? nextId.current++ : undefined

      if (id !== undefined) {
        setLabels((current) => [...current.slice(-3), { id, target, leaving: false }])
      }

      // The cursor stays until the scan has covered its target; the glow fades on as it moves on.
      await look(target, ms * scanCoveredShare)

      if (id === undefined) {
        return
      }

      setLabels((current) => current.map((label) => (label.id === id ? { ...label, leaving: true } : label)))
      setTimeout(() => setLabels((current) => current.filter((label) => label.id !== id)), 600)
    }

    let last: Target | undefined

    const play = async () => {
      let idleSince: number | undefined

      while (alive()) {
        const event = queue.take(agent)

        if (!event) {
          // Agents think between calls: stay near what it last looked at, so the next call picks up from there.
          idleSince ??= performance.now()

          if (performance.now() - idleSince > lingerMs) {
            show(cursor.current.at, false)
            setActivity(undefined)
            playing.current = false
            // Let the cursor fade before it goes, and its colors with it.
            await pause(400)

            if (alive() && !playing.current) {
              onDone(agent)
            }

            return
          }

          await (last && cursor.current.visible
            ? look(last, lingerMs - (performance.now() - idleSince), true)
            : pause(250))
          continue
        }

        idleSince = undefined
        const name = event.agent ?? "Agent"

        if (event.kind === "start") {
          setActivity({ agent: name, label: event.label, kind: "start", done: false })
          await pause(60)
        } else if (event.kind === "end") {
          setActivity((current) => ({
            ...current,
            agent: name,
            label: event.label ?? current?.label,
            done: true
          }))
          await pause(60)
        } else {
          setActivity((current) => ({
            agent: name,
            label: event.label ?? current?.label,
            kind: event.kind,
            done: false
          }))

          if (queue.drags(event)) {
            await drag(event)
          } else {
            await visit(event, event.kind)
          }
        }
      }

      playing.current = false
    }

    void play()
  }, [version, queue, layer, agent, onDone, onScan])

  return (
    <>
      {labels.map((label) => (
        <MeasureLabel key={label.id} label={label} palette={palette} />
      ))}
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
    </>
  )
}

/** A measurement's size, in CSS pixels as the design lays it out, under what was measured. */
function MeasureLabel({ label, palette }: { label: Label; palette: PaletteLook }) {
  const { target, leaving } = label
  const ref = useRef<HTMLDivElement>(null)
  const measured = target.size()
  const size = measured && { w: Math.round(measured.width), h: Math.round(measured.height) }

  const place = useCallback(() => {
    const chip = ref.current
    const box = target.box()

    if (chip) {
      chip.style.left = `${box.x + box.w / 2}px`
      chip.style.top = `${box.y + box.h}px`
    }
  }, [target])

  // Placed before it's first painted, then it follows what was measured each frame.
  useLayoutEffect(place, [place])
  useFrame({ draw: place })

  if (!size) {
    return null
  }

  return (
    <div
      ref={ref}
      className={`absolute mt-1.5 -translate-x-1/2 rounded px-1.5 py-px text-2xs font-medium whitespace-nowrap tabular-nums shadow transition-opacity duration-500 ${leaving ? "opacity-0" : "opacity-100"}`}
      style={{ background: palette.color, color: palette.ink }}
    >
      {size.w} × {size.h}
    </div>
  )
}

/** Runs `frame` with progress from 0 to 1 over `ms`, one call per animation frame. */
function animate(ms: number, frame: (t: number) => void, alive: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now()

    const tick = (now: number) => {
      if (!alive()) {
        return resolve()
      }

      const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms)
      frame(t)

      if (t < 1) {
        requestAnimationFrame(tick)
      } else {
        resolve()
      }
    }

    requestAnimationFrame(tick)
  })
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)))
}
