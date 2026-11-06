import { Button, Kbd } from "@buildkitgg/shadcn-baseui-kit"
import { Check, X } from "lucide-react"
import type { ReactNode } from "react"
import { formatKeys } from "../../chrome/keys.ts"

/** The three things the first run asks someone to try in the example. */
export type FirstStep = "prop" | "wrap" | "accessibility"

export const firstSteps: readonly FirstStep[] = ["prop", "wrap", "accessibility"]

const steps: Record<FirstStep, { title: string; how: ReactNode }> = {
  prop: {
    title: "Change a prop",
    how: "Select a button on a screen, then pick another variant in Design."
  },
  wrap: {
    title: "Wrap in a layout",
    how: (
      <>
        Select two layers and press <Kbd>{formatKeys("Ctrl G")}</Kbd> to put them in a row.
      </>
    )
  },
  accessibility: {
    title: "Check accessibility",
    how: "Select a screen and open the Accessibility tab to see what the checks find."
  }
}

/**
 * Three short things to try on the first run, floating at the bottom left of the example's canvas. Each ticks itself
 * once it's done; a step's row shows where to start. Closing it puts it away for good.
 */
export function FirstSteps({
  done,
  onShow,
  onClose
}: {
  done: ReadonlySet<FirstStep>
  /** Starts a step for you: selects something to change, or opens the tab. */
  onShow: (step: FirstStep) => void
  onClose: () => void
}) {
  const count = firstSteps.filter((step) => done.has(step)).length
  const finished = count === firstSteps.length
  return (
    <section
      aria-labelledby="first-steps"
      className="absolute bottom-4 left-4 z-[400] flex w-[300px] max-w-[calc(100%-32px)] flex-col gap-1 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur"
    >
      <header className="flex items-center gap-2 py-1 pr-0.5 pl-2">
        <h2 id="first-steps" className="flex-1 text-sm font-semibold">
          {finished ? "You've tried the basics" : "Try these"}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {count} of {firstSteps.length}
        </span>
        <Button variant="ghost" size="icon-xs" aria-label="Close Try these" onClick={onClose}>
          <X />
        </Button>
      </header>
      <ol className="flex flex-col">
        {firstSteps.map((step) => {
          const isDone = done.has(step)
          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => onShow(step)}
                aria-label={isDone ? `${steps[step].title}, done` : steps[step].title}
                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  className={`mt-px grid size-4 shrink-0 place-items-center rounded-full border ${
                    isDone ? "border-primary bg-primary text-primary-foreground" : "border-foreground/30"
                  }`}
                >
                  {isDone && <Check className="size-3" strokeWidth={3} />}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={`text-[13px] font-medium ${isDone ? "text-muted-foreground line-through" : ""}`}>
                    {steps[step].title}
                  </span>
                  {!isDone && <span className="text-xs text-pretty text-muted-foreground">{steps[step].how}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      {finished && (
        <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-1">
          <p className="text-xs text-pretty text-muted-foreground">
            Open your own app from Home when you&apos;re ready.
          </p>
          <Button size="xs" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      )}
    </section>
  )
}
