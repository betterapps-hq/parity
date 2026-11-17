import { Button, Label, Switch } from "@buildkitgg/shadcn"
import { MonitorPlay } from "lucide-react"
import { useId } from "react"
import { CardHeader } from "./CardHeader.tsx"
import type { Member } from "./member.ts"

interface YouCardProps {
  you: Member
  /** How many others are here, who'd be asked to follow. */
  others?: number
  onPresent?: () => void
  /** Whether others' pointers show; left out, the switch keeps its own state and starts on. */
  showPointers?: boolean
  onShowPointersChange?: (show: boolean) => void
}

/**
 * Your own card, from your face at the end of the stack: you as everyone else sees you, in your color, a way to ask
 * everyone to follow you, and whether to show their pointers to you.
 */
export function YouCard({ you, others = 0, onPresent, showPointers, onShowPointersChange }: YouCardProps) {
  const pointers = useId()

  return (
    <div className="flex flex-col text-popover-foreground [--face-cutout:var(--popover)]">
      <CardHeader member={you} line="You, as everyone sees you" />
      <div className="flex flex-col gap-3 px-3 pb-3">
        <Button size="sm" className="w-full" disabled={others === 0} onClick={onPresent}>
          <MonitorPlay /> Present to everyone
        </Button>
        <div className="flex items-center justify-between gap-3">
          <Label id={`${pointers}-label`} htmlFor={pointers} className="text-xs font-normal">
            Show others&apos; pointers
          </Label>
          <Switch
            id={pointers}
            aria-labelledby={`${pointers}-label`}
            size="sm"
            checked={showPointers}
            defaultChecked={showPointers === undefined ? true : undefined}
            onCheckedChange={onShowPointersChange && ((checked) => onShowPointersChange(checked))}
          />
        </div>
      </div>
    </div>
  )
}
