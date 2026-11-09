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
import { useState } from "react"
import { formatKeys } from "../../chrome/keys.ts"
import { kindOptions } from "./kind-options.ts"
import { Divider, type AnnotationKind } from "./options.tsx"
import { springIn } from "./springs.ts"

/** A picked stamp's chip boings, and its name slides out of it. */
const chipPop = springIn((progress) => ({ scale: String(0.6 + 0.4 * progress), rotate: `${(1 - progress) * -18}deg` }))

const nameIn = springIn((progress) => ({
  opacity: Math.min(1, progress * 1.6),
  translate: `${(1 - progress) * -6}px 0`,
  filter: `blur(${Math.max(0, 1 - progress) * 3}px)`
}))

/**
 * A kind of annotation's bar: its options as stamps that show their name when picked, Suggest, which has an agent draft
 * them from the render to confirm, and Done.
 */
export function KindBar({ kind, onDone }: { kind: AnnotationKind; onDone?: () => void }) {
  const options = kindOptions[kind]
  const ids = Object.keys(options)
  const [stamp, setStamp] = useState(ids[0])

  return (
    <>
      <ToggleGroup
        spacing={1}
        value={[stamp]}
        onValueChange={([value]) => {
          if (value && value in options) {
            setStamp(value)
          }
        }}
        aria-label="Annotation to place"
        className="items-stretch gap-0.5"
      >
        {ids.map((id) => {
          const { title, hint, icon: Icon, bg, ink } = options[id]!
          const picked = id === stamp

          return (
            <Tooltip key={id}>
              <TooltipTrigger
                render={
                  <ToggleGroupItem
                    value={id}
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
      <Button variant="secondary" className="ml-0.5 h-8 gap-1.5 px-2.5 active:scale-95" onClick={onDone}>
        Done <Kbd>{formatKeys("Esc")}</Kbd>
      </Button>
    </>
  )
}
