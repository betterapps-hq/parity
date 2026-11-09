import {
  Button,
  Kbd,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { Sparkles } from "lucide-react"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { ProjectContext, useProject } from "../../canvas/context.ts"
import { formatKeys } from "../../chrome/keys.ts"
import { useTool } from "../../selection.ts"
import { example } from "../../stories/fixtures.tsx"
import { type A11yKind, a11yKindOrder, a11yKinds } from "../collaboration/a11y.tsx"
import { Divider, ReviewBar, type ReviewTool, reviewSpec, SearchActions, Tools, useReviewEscape } from "./options.tsx"

/*
 * An experiment: picking Accessibility in the review menu warps the toolbar into Accessibility's own bar, and Done or
 * Esc warps it back. On the way in:
 *
 * 1. The bar crouches, squashing wide and short, as a ripple in the kind's color spreads from the review button.
 * 2. The tools are pulled into the review button, the farthest first, shrinking and blurring, and the button bursts.
 * 3. The bar hops, its width springing to the new bar's with a little overshoot, and lands with a jelly wobble.
 * 4. The stamps burst out from where the button was, nearest first, each on its own spring.
 *
 * On the way out it runs the other way, from Done, in the selection blue. With reduced motion it's a short cross-fade.
 */

interface Spring {
  stiffness: number
  damping: number
}

interface Simulated {
  /** How long it takes to settle, in milliseconds. */
  duration: number
  /** Where it is at evenly spaced moments, from 0 to 1, overshooting past 1 when it bounces. */
  points: number[]
}

/** A spring of unit mass let go at 0 and pulled toward 1, sampled until it settles. */
function simulate({ stiffness, damping }: Spring): Simulated {
  const natural = Math.sqrt(stiffness)
  const decay = damping / 2
  const ringing = Math.sqrt(Math.max(stiffness - decay ** 2, 0))

  const at = (time: number) =>
    ringing > 0
      ? 1 - Math.exp(-decay * time) * (Math.cos(ringing * time) + (decay / ringing) * Math.sin(ringing * time))
      : 1 - Math.exp(-natural * time) * (1 + natural * time)

  let settled = 0

  for (let time = 0; time <= 2; time += 1 / 240) {
    if (Math.abs(1 - at(time)) > 0.002) {
      settled = time
    }
  }

  const duration = settled + 1 / 60
  const steps = 64
  const points = Array.from({ length: steps + 1 }, (_, step) => (step === steps ? 1 : at((step / steps) * duration)))

  return { duration: duration * 1000, points }
}

/** A spring as a CSS easing, for transitions. */
const asEasing = ({ points }: Simulated) => `linear(${points.map((point) => point.toFixed(4)).join(", ")})`

/** Keyframes along a spring, each made from how far along it is, for animating more than one value on it. */
const along = ({ points }: Simulated, frame: (progress: number) => Keyframe): Keyframe[] =>
  points.map((progress, step) => ({ ...frame(progress), offset: step / (points.length - 1) }))

const springs = {
  /** The bar's width: quick, with a small overshoot. */
  width: simulate({ stiffness: 300, damping: 22 }),
  /** Each button bursting in: bouncier, so it lands with a bounce. */
  pop: simulate({ stiffness: 420, damping: 17 }),
  /** The bar landing: loose, so it wobbles like jelly. */
  jelly: simulate({ stiffness: 520, damping: 13 })
}

/** The moments of the warp, in milliseconds from the click. */
const timing = { width: 60, burst: 90, stagger: 14, pull: 220, pullStagger: 10 }

/** Whether someone asked for less motion, which swaps the warp for a plain cross-fade. */
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** The buttons and dividers on one side of the bar, which move one by one. */
const partsOf = (layer: HTMLElement) => [...layer.querySelectorAll<HTMLElement>("button, [role='separator']")]

const centerOf = (element: Element) => {
  const box = element.getBoundingClientRect()

  return box.left + box.width / 2
}

/** Plays the warp from one side of the bar to the other, starting from the leaving side's anchor. */
function warp({
  bar,
  flash,
  glow,
  leaving,
  entering,
  color
}: {
  bar: HTMLElement
  flash: HTMLElement
  glow: HTMLElement
  leaving: HTMLElement
  entering: HTMLElement
  color: string
}) {
  const leavingParts = partsOf(leaving)
  const enteringParts = partsOf(entering)

  // A warp started mid-warp starts from where things rest, not from where the last one left them.
  for (const element of [bar, flash, glow, ...leavingParts, ...enteringParts]) {
    for (const running of element.getAnimations()) {
      running.cancel()
    }
  }

  const anchor = leaving.querySelector<HTMLElement>("[data-warp-anchor]") ?? leaving
  const anchorX = centerOf(anchor)
  const distance = (part: HTMLElement) => Math.abs(centerOf(part) - anchorX)

  bar.style.setProperty("--warp", color)

  // The crouch, then the hop and the jelly landing: wide and short, tall and thin, settling.
  const { jelly } = springs
  const crouch = 90
  const total = crouch + jelly.duration

  bar.animate(
    [
      { offset: 0, scale: "1 1", translate: "-50% 0", easing: "cubic-bezier(0.4, 0, 0.6, 1)" },
      ...jelly.points.map((progress, step) => {
        const time = (step / (jelly.points.length - 1)) * jelly.duration
        const tall = 0.86 + 0.14 * progress
        const hop = Math.min(time / (jelly.duration * 0.4), 1)

        return {
          offset: (crouch + time) / total,
          scale: `${1 + (1 - tall) * 0.45} ${tall}`,
          translate: `-50% ${-7 * Math.sin(Math.PI * hop)}px`
        }
      })
    ],
    { duration: total }
  )

  // A ring of the kind's color around the bar, and a ripple spreading from the anchor behind the buttons.
  glow.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 800, easing: "ease-out" })
  flash.style.left = `${anchorX - bar.getBoundingClientRect().left}px`
  flash.animate(
    [
      { scale: 0.2, opacity: 0.9 },
      { scale: 16, opacity: 0 }
    ],
    { duration: 700, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }
  )

  // The leaving side is pulled into the anchor, the farthest first, and the anchor bursts.
  for (const [order, part] of leavingParts.toSorted((a, b) => distance(b) - distance(a)).entries()) {
    if (part === anchor) {
      part.animate(
        [
          { scale: 1, opacity: 1, filter: "blur(0px)" },
          { scale: 1.35, opacity: 1, filter: "blur(0px)", offset: 0.5 },
          { scale: 1.7, opacity: 0, filter: "blur(4px)" }
        ],
        { duration: 260, delay: 40, easing: "cubic-bezier(0.3, 0, 0.2, 1)", fill: "forwards" }
      )
      continue
    }

    part.animate(
      [
        { translate: "0 0", scale: 1, opacity: 1, filter: "blur(0px)" },
        { translate: `${(anchorX - centerOf(part)) * 0.7}px 0`, scale: 0.3, opacity: 0, filter: "blur(4px)" }
      ],
      {
        duration: timing.pull,
        delay: order * timing.pullStagger,
        easing: "cubic-bezier(0.55, 0, 0.8, 0.2)",
        fill: "forwards"
      }
    )
  }

  // The entering side bursts out of the anchor, the nearest first, each on its own spring.
  for (const [order, part] of enteringParts.toSorted((a, b) => distance(a) - distance(b)).entries()) {
    const from = anchorX - centerOf(part)

    part.animate(
      along(springs.pop, (progress) => ({
        translate: `${from * (1 - progress) * 0.85}px ${(1 - progress) * 6}px`,
        scale: String(0.4 + 0.6 * progress),
        opacity: Math.min(1, progress * 2.2),
        filter: `blur(${Math.max(0, 1 - progress) * 5}px)`
      })),
      { duration: springs.pop.duration, delay: timing.burst + order * timing.stagger, fill: "backwards" }
    )
  }
}

/** Plays a spring on an element as it's added, if motion's welcome. */
const springIn = (frame: (progress: number) => Keyframe) => (node: HTMLElement | null) => {
  if (node && !reducedMotion()) {
    node.animate(along(springs.pop, frame), { duration: springs.pop.duration })
  }
}

/** A picked stamp's chip boings, and its name slides out of it. */
const chipPop = springIn((progress) => ({ scale: String(0.6 + 0.4 * progress), rotate: `${(1 - progress) * -18}deg` }))

const nameIn = springIn((progress) => ({
  opacity: Math.min(1, progress * 1.6),
  translate: `${(1 - progress) * -6}px 0`,
  filter: `blur(${Math.max(0, 1 - progress) * 3}px)`
}))

/** The warping toolbar on its own, a little above the middle of the story. */
export function WarpStage() {
  return (
    <TooltipProvider>
      <ProjectContext value={example()}>
        <div className="relative h-screen bg-background text-foreground">
          <div className="absolute inset-x-0 top-1/2">
            <WarpToolbar />
          </div>
        </div>
      </ProjectContext>
    </TooltipProvider>
  )
}

/** The proposed toolbar, warping into Accessibility's bar while accessibility annotations are being placed. */
function WarpToolbar() {
  const { selection } = useProject()
  const tool = useTool(selection)
  // The review tool picked, if one is, and how to put it down, which Done and Esc do.
  const [review, setReview] = useState<{ picked: ReviewTool; done: () => void }>()
  const bar = useRef<HTMLDivElement>(null)
  const flash = useRef<HTMLSpanElement>(null)
  const glow = useRef<HTMLSpanElement>(null)
  const toolsLayer = useRef<HTMLDivElement>(null)
  const kindLayer = useRef<HTMLDivElement>(null)
  const [widths, setWidths] = useState({ tools: 0, kind: 0 })

  // Another tool, picked by its key, puts the review tool down, so the bar warps back.
  if (review && tool !== "select") {
    setReview(undefined)
  }

  const warped = review?.picked === "accessibility"

  useReviewEscape(warped ? review.done : undefined)

  // Each side's width, kept current as a stamp's name shows and hides.
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() =>
      setWidths({ tools: toolsLayer.current?.offsetWidth ?? 0, kind: kindLayer.current?.offsetWidth ?? 0 })
    )

    for (const layer of [toolsLayer.current, kindLayer.current]) {
      if (layer) {
        observer.observe(layer)
      }
    }

    return () => observer.disconnect()
  }, [])

  // The warp, before the browser paints the switch, and focus following the side that's showing.
  const previous = useRef(warped)

  useLayoutEffect(() => {
    if (previous.current === warped) {
      return
    }

    previous.current = warped

    const leaving = warped ? toolsLayer.current : kindLayer.current
    const entering = warped ? kindLayer.current : toolsLayer.current

    if (!bar.current || !flash.current || !glow.current || !leaving || !entering) {
      return
    }

    if (!reducedMotion()) {
      warp({
        bar: bar.current,
        flash: flash.current,
        glow: glow.current,
        leaving,
        entering,
        color: warped ? reviewSpec("accessibility").color : "var(--canvas-layer-chip)"
      })
    }

    entering.querySelector<HTMLElement>("[aria-pressed='true']")?.focus({ preventScroll: true })
  }, [warped])

  const width = warped ? widths.kind : widths.tools

  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label={warped ? "Accessibility annotations" : "Toolbar"}
      className="absolute bottom-4 left-1/2 z-[400] origin-bottom -translate-x-1/2 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      <span
        ref={glow}
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[inherit] opacity-0"
        style={{ boxShadow: "0 0 0 1.5px var(--warp), 0 10px 32px -6px var(--warp)" }}
      />
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
        <span
          ref={flash}
          className="absolute top-1/2 -mt-5 -ml-5 size-10 rounded-full opacity-0"
          style={{ background: "radial-gradient(circle, var(--warp) 0%, transparent 70%)" }}
        />
      </span>
      <div
        className="relative grid h-8 grid-cols-[100%] overflow-x-clip overflow-y-visible"
        style={{
          width: width || undefined,
          transition: reducedMotion()
            ? undefined
            : `width ${springs.width.duration}ms ${asEasing(springs.width)} ${timing.width}ms`
        }}
      >
        <Layer ref={toolsLayer} shown={!warped}>
          <Tools onReview={(picked, done) => setReview(picked ? { picked, done } : undefined)} />
          <Divider />
          <SearchActions />
        </Layer>
        <Layer ref={kindLayer} shown={warped}>
          <AccessibilityBar onDone={() => review?.done()} />
        </Layer>
      </div>
      {review && !warped && <ReviewBar tool={review.picked} onDone={review.done} />}
    </div>
  )
}

/**
 * One side of the bar, stacked over the other in the middle. The side that isn't showing goes once its buttons have
 * flown out, and can't be reached by pointer, keyboard or screen reader.
 */
function Layer({ ref, shown, children }: { ref: React.Ref<HTMLDivElement>; shown: boolean; children: ReactNode }) {
  return (
    <div
      ref={ref}
      inert={!shown}
      className={`col-start-1 row-start-1 flex w-max items-stretch gap-0.5 [justify-self:unsafe_center] ${shown ? "opacity-100 motion-reduce:transition-opacity motion-reduce:duration-150" : "pointer-events-none opacity-0 transition-opacity delay-[400ms] duration-0 motion-reduce:delay-0 motion-reduce:duration-150"}`}
    >
      {children}
    </div>
  )
}

/**
 * Accessibility's bar: its options as stamps that show their name when picked, Suggest, which has an agent draft them
 * from the render to confirm, and Done.
 */
function AccessibilityBar({ onDone }: { onDone: () => void }) {
  const [stamp, setStamp] = useState<A11yKind>("focus")

  return (
    <>
      <ToggleGroup
        spacing={1}
        value={[stamp]}
        onValueChange={([value]) => {
          const picked = a11yKindOrder.find((kind) => kind === value)

          if (picked) {
            setStamp(picked)
          }
        }}
        aria-label="Annotation to place"
        className="items-stretch gap-0.5"
      >
        {a11yKindOrder.map((kind) => {
          const { title, hint, icon: Icon, bg, ink } = a11yKinds[kind]
          const picked = kind === stamp

          return (
            <Tooltip key={kind}>
              <TooltipTrigger
                render={
                  <ToggleGroupItem
                    value={kind}
                    aria-label={title}
                    className="h-8 min-w-8 gap-1.5 px-1.5 text-xs transition-[scale,background-color] duration-200 ease-[cubic-bezier(0.3,1.8,0.5,1)] active:scale-90 aria-pressed:bg-muted aria-pressed:pr-2.5"
                  >
                    <span
                      key={picked ? "picked" : "idle"}
                      ref={picked ? chipPop : undefined}
                      className="grid size-5 place-items-center rounded-[5px]"
                      style={{ background: bg, color: ink }}
                    >
                      <Icon className="size-3" />
                    </span>
                    {picked && <span ref={nameIn}>{title}</span>}
                  </ToggleGroupItem>
                }
              />
              <TooltipContent side="top">{hint}</TooltipContent>
            </Tooltip>
          )
        })}
      </ToggleGroup>
      <Divider />
      <Button variant="ghost" className="h-8 gap-1.5 px-2 active:scale-95">
        <Sparkles /> Suggest
      </Button>
      <Button
        data-warp-anchor
        variant="secondary"
        className="ml-0.5 h-8 gap-1.5 px-2.5 active:scale-95"
        onClick={onDone}
      >
        Done <Kbd>{formatKeys("Esc")}</Kbd>
      </Button>
    </>
  )
}
