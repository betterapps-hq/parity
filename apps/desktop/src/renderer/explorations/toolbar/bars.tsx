import { TooltipProvider } from "@buildkitgg/shadcn-baseui-kit"
import type { ReactNode } from "react"
import { ProjectContext } from "../../canvas/context.ts"
import { example } from "../../stories/fixtures.tsx"
import { A11yToolbar } from "../collaboration/a11y.tsx"
import { type AnnotationKind, annotationKinds, ReviewBarLook, ReviewToolbar, ZoomCorner } from "./options.tsx"
import { Par184Bar } from "./par-184-bar.tsx"

/* The bars on their own, set in place rather than floating over a canvas, so zoom shows 100%. */

/** One of our bars, set in place. */
function Live({ children }: { children: ReactNode }) {
  return (
    <ProjectContext value={example()}>
      <div className="w-fit *:static *:translate-x-0">{children}</div>
    </ProjectContext>
  )
}

/** A heading and what it names, side by side. */
function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t py-5 md:grid-cols-[12rem_1fr]">
      <h2 className="text-sm font-medium">{name}</h2>
      <div className="flex min-w-0 flex-wrap items-end gap-3">{children}</div>
    </section>
  )
}

const reviewTools = ["comment", ...Object.keys(annotationKinds)] as ("comment" | AnnotationKind)[]

/** Our bars, and the bars a review tool shows. */
export function ToolbarComparison() {
  return (
    <TooltipProvider>
      <div className="h-screen overflow-y-auto bg-background px-8 py-2 text-foreground">
        <Row name="Toolbar">
          <Live>
            <ReviewToolbar />
          </Live>
        </Row>
        <Row name="Zoom">
          <Live>
            <ZoomCorner />
          </Live>
        </Row>
        <Row name="While reviewing">
          <div className="grid gap-3">
            {reviewTools.map((tool) => (
              <Live key={tool}>
                <ReviewBarLook tool={tool} />
              </Live>
            ))}
          </div>
        </Row>
        <Row name="PAR-184's bar">
          <div className="grid gap-3">
            <Par184Bar mode="annotate" />
            <Par184Bar mode="comment" />
          </div>
        </Row>
        <Row name="Accessibility's options">
          <A11yToolbar active="focus" />
        </Row>
      </div>
    </TooltipProvider>
  )
}
