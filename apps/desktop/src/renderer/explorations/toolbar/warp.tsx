import {
  Button,
  Kbd,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import { Sparkles } from "lucide-react"
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useProject } from "../../canvas/context.ts"
import { formatKeys } from "../../chrome/keys.ts"
import { useTool } from "../../selection.ts"
import { type A11yKind, a11yKindOrder, a11yKinds } from "../collaboration/a11y.tsx"
import { Divider, ReviewBar, type ReviewTool, SearchActions, Tools, useReviewEscape } from "./options.tsx"

/*
 * An experiment: picking Accessibility in the review menu warps the toolbar into Accessibility's own bar, its options
 * as stamps from the Accessibility annotations exploration, and Done warps it back. The bar's width springs from one to
 * the other while it squashes and stretches, and each side blurs out as the other blurs in. The other kinds still show
 * the bar above until they have options of their own.
 */

/** A spring that overshoots a little, for the width. */
const spring = "cubic-bezier(0.34, 1.4, 0.64, 1)"

/** Whether someone asked for less motion, which swaps the warp for a plain cross-fade. */
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** The proposed toolbar, warping into Accessibility's bar while accessibility annotations are being placed. */
export function WarpToolbar() {
  const { selection } = useProject()
  const tool = useTool(selection)
  // The review tool picked, if one is, and how to put it down, which Done and Esc do.
  const [review, setReview] = useState<{ picked: ReviewTool; done: () => void }>()
  const bar = useRef<HTMLDivElement>(null)
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
    const measure = () =>
      setWidths({ tools: toolsLayer.current?.offsetWidth ?? 0, kind: kindLayer.current?.offsetWidth ?? 0 })

    const observer = new ResizeObserver(measure)

    for (const layer of [toolsLayer.current, kindLayer.current]) {
      if (layer) {
        observer.observe(layer)
      }
    }

    return () => observer.disconnect()
  }, [])

  // The squash and stretch, and focus following the side that's showing.
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false

      return
    }

    if (!reducedMotion()) {
      bar.current?.animate(
        [{ scale: "1 1" }, { scale: "0.96 1.14", offset: 0.28 }, { scale: "1.02 0.95", offset: 0.6 }, { scale: "1 1" }],
        { duration: 560, easing: "ease-out" }
      )
    }

    const layer = warped ? kindLayer.current : toolsLayer.current

    layer?.querySelector<HTMLElement>("[aria-pressed='true']")?.focus()
  }, [warped])

  const width = warped ? widths.kind : widths.tools

  return (
    <div
      ref={bar}
      role="toolbar"
      data-proposed
      aria-label={warped ? "Accessibility annotations" : "Toolbar"}
      className="absolute bottom-4 left-1/2 z-[400] origin-bottom -translate-x-1/2 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
    >
      <div
        className="grid h-8 overflow-hidden motion-safe:transition-[width] motion-safe:duration-500"
        style={{ width: width || undefined, transitionTimingFunction: spring }}
      >
        <Layer ref={toolsLayer} shown={!warped} from="right">
          <Tools onReview={(picked, done) => setReview(picked ? { picked, done } : undefined)} />
          <Divider />
          <SearchActions />
        </Layer>
        <Layer ref={kindLayer} shown={warped} from="left">
          <AccessibilityBar onDone={() => review?.done()} />
        </Layer>
      </div>
      {review && !warped && <ReviewBar tool={review.picked} onDone={review.done} />}
    </div>
  )
}

/**
 * One side of the bar, stacked over the other, sitting at the left. The side that isn't showing blurs out, shrinking
 * toward the edge it leaves by, and can't be reached by pointer, keyboard or screen reader.
 */
function Layer({
  ref,
  shown,
  from,
  children
}: {
  ref: React.Ref<HTMLDivElement>
  shown: boolean
  from: "left" | "right"
  children: ReactNode
}) {
  return (
    <div
      ref={ref}
      inert={!shown}
      className={`col-start-1 row-start-1 flex w-max items-stretch gap-0.5 transition-[opacity,filter,scale] duration-300 ${from === "right" ? "origin-right" : "origin-left"} ${shown ? "scale-100 opacity-100 blur-none delay-100" : "pointer-events-none scale-90 opacity-0 blur-sm"}`}
    >
      {children}
    </div>
  )
}

/**
 * Accessibility's bar: its options as stamps that show their name when picked, Suggest, which has
 * an agent draft them from the render to confirm, and Done.
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
                    className="h-8 min-w-8 gap-1.5 px-1.5 text-xs aria-pressed:bg-muted aria-pressed:pr-2.5"
                  >
                    <span
                      className="grid size-5 place-items-center rounded-[5px]"
                      style={{ background: bg, color: ink }}
                    >
                      <Icon className="size-3" />
                    </span>
                    {picked && title}
                  </ToggleGroupItem>
                }
              />
              <TooltipContent side="top">{hint}</TooltipContent>
            </Tooltip>
          )
        })}
      </ToggleGroup>
      <Divider />
      <Button variant="ghost" className="h-8 gap-1.5 px-2">
        <Sparkles /> Suggest
      </Button>
      <Button variant="secondary" className="ml-0.5 h-8 gap-1.5 px-2.5" onClick={onDone}>
        Done <Kbd>{formatKeys("Esc")}</Kbd>
      </Button>
    </>
  )
}
