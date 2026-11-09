import { Button, Kbd, ToggleGroup, ToggleGroupItem } from "@buildkitgg/shadcn-baseui-kit"
import { Eye, MessageCircle, NotebookPen } from "lucide-react"
import { useState } from "react"
import { formatKeys } from "../../chrome/keys.ts"
import { commentBlue } from "../collaboration/comments.tsx"
import { accent } from "../parts.tsx"
import { type AnnotationKind, annotationKinds } from "./options.tsx"

const kindOrder = Object.keys(annotationKinds) as AnnotationKind[]

/**
 * A copy of the bar PAR-184's annotations design shows above the toolbar while Annotate or Comment is picked (its
 * explorations/annotations/toolbar.tsx, AuthoringBar). That design isn't approved or on main yet, so this copy is drawn
 * here, set in place, with its own state. Annotating picks the kind it places, showing only the picked kind's name;
 * commenting can show resolved threads.
 */
export function Par184Bar({ mode }: { mode: "annotate" | "comment" }) {
  const [kind, setKind] = useState<AnnotationKind>("behaviour")
  const [showResolved, setShowResolved] = useState(false)
  const Icon = mode === "comment" ? MessageCircle : NotebookPen

  return (
    <div className="flex w-fit items-center gap-1 rounded-xl border bg-popover p-1 pl-3 text-sm whitespace-nowrap text-popover-foreground shadow-xl">
      <Icon
        className="size-4 shrink-0"
        style={{ color: mode === "comment" ? commentBlue : accent(annotationKinds[kind].hue, 0.58, 0.17) }}
      />
      <span className="ml-1 font-medium">{mode === "comment" ? "Commenting" : "Annotating"}</span>
      <span className="mx-2 text-xs text-muted-foreground">
        {mode === "comment" ? "Click anywhere to start a thread" : "Click a layer to annotate it"}
      </span>
      <span className="mx-1 h-5 w-px bg-border" />
      {mode === "annotate" ? (
        <ToggleGroup
          size="sm"
          spacing={0}
          value={[kind]}
          onValueChange={([value]) => {
            const picked = kindOrder.find((option) => option === value)

            if (picked) {
              setKind(picked)
            }
          }}
          aria-label="Kind to place"
          className="gap-0.5"
        >
          {kindOrder.map((option) => {
            const { label, icon: KindIcon, hue } = annotationKinds[option]

            return (
              <ToggleGroupItem key={option} value={option} aria-label={label} className="h-7 gap-1.5 px-2 text-xs">
                <KindIcon style={{ color: accent(hue, 0.58, 0.17) }} />
                {option === kind && label}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      ) : (
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={showResolved}
          className={showResolved ? "bg-muted" : ""}
          onClick={() => setShowResolved(!showResolved)}
        >
          <Eye /> Resolved
        </Button>
      )}
      <Button size="xs" variant="secondary" className="ml-1">
        Done <Kbd className="ml-1">{formatKeys("Esc")}</Kbd>
      </Button>
    </div>
  )
}
