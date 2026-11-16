import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@buildkitgg/shadcn-baseui-kit"
import { kindName } from "@parity-app/editor"
import { CircleMinus } from "lucide-react"
import { useStore, windowStore } from "../store.ts"
import { dropLines, type FrameDrops } from "./convert-to-frame.ts"

/** The conversion waiting on an answer: which design, and what it would drop. */
interface Asking {
  name: string
  kind: "screen" | "component"
  drops: FrameDrops
  /** Converts it, as one undo step. */
  convert: () => void
}

const asking = windowStore<Asking | undefined>(() => undefined)

/** Asks before a screen or component that would drop something becomes a frame (see `ConvertToFrameDialog`). */
export function askToConvertToFrame(question: Asking): void {
  asking.set(question)
}

/** Stops asking, as Cancel does, for when the dialog failed and was closed (PAR-667). */
export function stopAskingToConvert(): void {
  asking.set(undefined)
}

function useAsking(): Asking | undefined {
  return useStore(asking)
}

/**
 * Asked before a screen or component becomes a frame, when it would drop anything (PAR-545): it keeps its layers as its
 * first state shows them in the primary mode, and the message lists what goes. Undo brings it all back.
 */
export function ConvertToFrameDialog() {
  const question = useAsking()
  const lines = question ? dropLines(question.drops) : []

  return (
    <Dialog open={!!question} onOpenChange={(open) => !open && asking.set(undefined)}>
      {question && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Convert {question.name} to a frame?</DialogTitle>
            <DialogDescription>
              {question.name} keeps its layers as {question.drops.kept} shows them in {question.drops.primary}. A frame
              has one size and isn&apos;t written to code, so the {kindName(question.kind)} loses:
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1.5 text-sm">
            {lines.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">Undo brings them back.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => asking.set(undefined)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                question.convert()
                asking.set(undefined)
              }}
            >
              Convert to frame
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
