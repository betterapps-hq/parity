import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { ProjectContext, useProject } from "../../canvas/context.ts"
import { useTool } from "../../selection.ts"
import { example } from "../../stories/fixtures.tsx"
import { CommentBar, KindBar } from "./kind-bar.tsx"
import {
  annotationKinds,
  Divider,
  type ReviewTool,
  reviewSpec,
  SearchActions,
  ToolbarHosts,
  Tools,
  useReviewEscape
} from "./options.tsx"
import { along, asEasing, reducedMotion, springs } from "./springs.ts"

/*
 * An experiment: picking a kind of annotation in the review menu warps the toolbar into that kind's own bar, its
 * options as stamps, and Done or Esc warps it back. Comment warps the same way, into a bar that says what a click does.
 * On the way in:
 *
 * 1. The bar crouches, squashing wide and short, as a ripple in the kind's color spreads from the review button.
 * 2. The tools are pulled into the review button, the farthest first, shrinking and blurring, and the button bursts.
 * 3. The bar hops, its width springing to the new bar's with a little overshoot, and lands with a jelly wobble.
 * 4. The stamps burst out from where the button was, nearest first, each on its own spring.
 *
 * On the way back, the stamps sink and are pulled down into where the review button sits in the toolbar, inside the
 * smaller bar, so nothing slides off its edges. The bar dips as it lands, and once they're in, the button re-forms and
 * the tools burst back out of it, in the selection blue. With reduced motion it's a short cross-fade.
 */

type Direction = "in" | "out"

/**
 * The moments of the warp, in milliseconds from the click. On the way back the width waits for the stamps to be pulled
 * in, so the bar's edges don't overtake them.
 */
const timing = {
  in: { width: 60, burst: 90 },
  out: { width: 110, burst: 170 },
  stagger: 14,
  pullStagger: 10
}

/** The buttons, dividers and words on one side of the bar, which move one by one. */
const partsOf = (layer: HTMLElement) => [
  ...layer.querySelectorAll<HTMLElement>("button, [role='separator'], [data-warp-part]")
]

const centerOf = (element: Element) => {
  const box = element.getBoundingClientRect()

  return box.left + box.width / 2
}

/**
 * Plays the warp from one side of the bar to the other, around the review button: in, the toolbar folds into it and
 * the kind's bar bursts out; out, the kind's bar is pulled down into it and the toolbar bursts back out.
 */
function warp({
  bar,
  flash,
  glow,
  leaving,
  entering,
  direction,
  color
}: {
  bar: HTMLElement
  flash: HTMLElement
  glow: HTMLElement
  leaving: HTMLElement
  entering: HTMLElement
  direction: Direction
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

  // The review button, which stays put however wide the bar is, since both sides sit in its middle.
  const tools = direction === "in" ? leaving : entering
  const anchor = tools.querySelector<HTMLElement>("[data-warp-anchor]") ?? tools
  const anchorX = centerOf(anchor)
  const distance = (part: HTMLElement) => Math.abs(centerOf(part) - anchorX)

  bar.style.setProperty("--warp", color)

  // The crouch, then the jelly landing: wide and short, tall and thin, settling. In, it hops up first; out, it dips.
  const { jelly } = springs
  const crouch = 90
  const total = crouch + jelly.duration
  const lift = direction === "in" ? -7 : 3

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
          translate: `-50% ${lift * Math.sin(Math.PI * hop)}px`
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

  // The leaving side is pulled into the anchor, the farthest first. In, the anchor then bursts; out, everything sinks
  // as it goes, fast at first so the shrinking bar doesn't catch it.
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

    const pull = anchorX - centerOf(part)

    part.animate(
      [
        { translate: "0 0", scale: 1, opacity: 1, filter: "blur(0px)" },
        direction === "in"
          ? { translate: `${pull * 0.7}px 0`, scale: 0.3, opacity: 0, filter: "blur(4px)" }
          : { translate: `${pull * 0.9}px 10px`, scale: 0.25, opacity: 0, filter: "blur(4px)" }
      ],
      {
        duration: direction === "in" ? 220 : 260,
        delay: order * timing.pullStagger,
        easing: direction === "in" ? "cubic-bezier(0.55, 0, 0.8, 0.2)" : "cubic-bezier(0.3, 0, 0.1, 1)",
        fill: "forwards"
      }
    )
  }

  // The entering side bursts out of the anchor, the nearest first, each on its own spring. Out, the anchor comes back
  // first, shrinking back together from its burst.
  const burst = timing[direction].burst

  for (const [order, part] of enteringParts.toSorted((a, b) => distance(a) - distance(b)).entries()) {
    if (part === anchor) {
      part.animate(
        along(springs.pop, (progress) => ({
          scale: String(1.7 - 0.7 * progress),
          opacity: Math.min(1, progress * 2),
          filter: `blur(${Math.max(0, 1 - progress) * 4}px)`
        })),
        { duration: springs.pop.duration, delay: burst - 40, fill: "backwards" }
      )
      continue
    }

    const from = anchorX - centerOf(part)

    part.animate(
      along(springs.pop, (progress) => ({
        translate: `${from * (1 - progress) * 0.85}px ${(1 - progress) * 6}px`,
        scale: String(0.4 + 0.6 * progress),
        opacity: Math.min(1, progress * 2.2),
        filter: `blur(${Math.max(0, 1 - progress) * 5}px)`
      })),
      { duration: springs.pop.duration, delay: burst + order * timing.stagger, fill: "backwards" }
    )
  }
}

/**
 * The warping toolbar on its own, a little above the middle of the story. The stage is isolated like the app's canvas
 * area, so the toolbar's z-index stays inside it and its menus open over the review bar.
 */
export function WarpStage() {
  return (
    <TooltipProvider>
      <ProjectContext value={example()}>
        <div className="relative isolate h-screen bg-background text-foreground">
          <div className="absolute inset-x-0 top-1/2">
            <WarpToolbar />
          </div>
        </div>
        <ToolbarHosts />
      </ProjectContext>
    </TooltipProvider>
  )
}

/** The proposed toolbar, warping into a review tool's bar while it's picked: a kind's, or Comment's. */
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

  // The review tool whose bar is drawn, kept after Done so its parts can fly back into the toolbar.
  const [shown, setShown] = useState<ReviewTool>("behaviour")
  const picked = review?.picked
  const warped = !!picked

  if (picked && picked !== shown) {
    setShown(picked)
  }

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
        direction: warped ? "in" : "out",
        // Comment has no color of its own, so it warps in the selection blue, as the way back does.
        color: warped && shown !== "comment" ? reviewSpec(shown).color : "var(--canvas-layer-chip)"
      })
    }

    // Focus goes to the picked tool or stamp, or for Comment, which has none, to Done.
    const focus = entering.querySelector<HTMLElement>("[aria-pressed='true']") ?? entering.querySelector("button")
    focus?.focus({ preventScroll: true })
  }, [warped, shown])

  const width = warped ? widths.kind : widths.tools

  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label={toolbarLabel(warped, shown)}
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
      {/*
       * The wider side is clipped to the bar while its width springs, but 4px out, into the bar's padding, so a focused
       * button's 3px ring shows whole at either end. Overflow can't clip with a margin on one axis only, so a clip path
       * does it, with room above and below for the burst and its blur.
       */}
      <div
        className="relative grid h-8 grid-cols-[100%] [clip-path:inset(-3rem_-0.25rem)]"
        style={{
          width: width || undefined,
          transition: reducedMotion()
            ? undefined
            : `width ${springs.width.duration}ms ${asEasing(springs.width)} ${timing[warped ? "in" : "out"].width}ms`
        }}
      >
        <Layer ref={toolsLayer} shown={!warped}>
          <Tools onReview={(picked, done) => setReview(picked ? { picked, done } : undefined)} />
          <Divider />
          <SearchActions />
        </Layer>
        <Layer ref={kindLayer} shown={warped}>
          {shown === "comment" ? (
            <CommentBar onDone={() => review?.done()} />
          ) : (
            <KindBar key={shown} kind={shown} onDone={() => review?.done()} />
          )}
        </Layer>
      </div>
    </div>
  )
}

/** What the bar is to a screen reader: the toolbar, or the review tool's bar it warped into. */
function toolbarLabel(warped: boolean, shown: ReviewTool): string {
  if (!warped) {
    return "Toolbar"
  }

  return shown === "comment" ? "Comments" : `${annotationKinds[shown].label} annotations`
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
