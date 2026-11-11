import {
  Button,
  ToggleGroup,
  ToggleGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import type { AnnotationKind } from "@parity-app/editor"
import { Sparkles } from "lucide-react"
import { useState } from "react"
import { BarDivider, pressable, pressableWide, pressMotion, usePickPop } from "../../chrome/toolbar-parts.tsx"
import { springIn } from "../../springs.ts"
import { kindOptions, type KindOption } from "./annotation-options.ts"
import { DoneButton } from "./DoneButton.tsx"

/** A picked stamp's name slides out of its chip, which boings as every picked control on a bar does. */
const nameIn = springIn((progress) => ({
  opacity: Math.min(1, progress * 1.6),
  translate: `${(1 - progress) * -6}px 0`,
  filter: `blur(${Math.max(0, 1 - progress) * 3}px)`
}))

interface KindBarProps {
  kind: AnnotationKind
}

/**
 * A kind of annotation's bar (PAR-795): its options as stamps that show their name when picked, Suggest, which has an
 * agent draft them from the render to confirm, and Done. Placing the picked stamp on a layer is PAR-184's.
 */
export function KindBar({ kind }: KindBarProps) {
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
        {ids.map((id) => (
          <Stamp key={id} id={id} option={options[id]!} picked={id === stamp} />
        ))}
      </ToggleGroup>
      <BarDivider />
      <Button variant="ghost" className={`h-8 gap-1.5 px-2 ${pressableWide}`} style={pressMotion}>
        <Sparkles /> Suggest
      </Button>
      <DoneButton />
    </>
  )
}

interface StampProps {
  id: string
  option: KindOption
  picked: boolean
}

/** One option, as its chip, and with its name beside it once it's picked. Its tooltip says what it's for. */
function Stamp({ id, option: { title, hint, icon: Icon, bg, ink }, picked }: StampProps) {
  const popRef = usePickPop<HTMLSpanElement>(picked)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ToggleGroupItem
            value={id}
            aria-label={title}
            className={`h-8 min-w-8 gap-1.5 px-1.5 text-xs aria-pressed:bg-muted aria-pressed:pr-2.5 ${pressable}`}
            style={pressMotion}
          >
            <span
              ref={popRef}
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
}
