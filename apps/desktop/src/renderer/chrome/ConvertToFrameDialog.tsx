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
import { useSyncExternalStore } from "react"
import { dropLines, type FrameDrops } from "./convert-to-frame.ts"

/** The conversion waiting on an answer: which design, and what it would drop. */
interface Asking {
  name: string
  kind: "screen" | "component"
  drops: FrameDrops
  /** Converts it, as one undo step. */
  convert: () => void
}

let asking: Asking | undefined
const listeners = new Set<() => void>()

function setAsking(next: Asking | undefined): void {
  asking = next
  for (const listener of listeners) listener()
}

/** Asks before a screen or component that would drop something becomes a frame (see `ConvertToFrameDialog`). */
export function askToConvertToFrame(question: Asking): void {
  setAsking(question)
}

function useAsking(): Asking | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => asking
  )
}

/**
 * Asked before a screen or component becomes a frame, when it would drop anything (PAR-545): it keeps its layers as its
 * first state shows them in the primary mode, and the message lists what goes. Undo brings it all back.
 */
export function ConvertToFrameDialog() {
  const question = useAsking()
  const lines = question ? dropLines(question.drops) : []
  return (
    <Dialog open={!!question} onOpenChange={(open) => !open && setAsking(undefined)}>
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
            <Button variant="outline" onClick={() => setAsking(undefined)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                question.convert()
                setAsking(undefined)
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
