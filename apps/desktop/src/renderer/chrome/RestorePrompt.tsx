import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button
} from "@buildkitgg/shadcn-baseui-kit"
import { useRef, useState } from "react"
import { changeTime } from "./report-time.ts"
import { type RestoreQuestion, useRestoreQuestion } from "./restore.ts"

/**
 * Offers back a project's unsaved changes as it opens, when Parity closed before they were saved (PAR-905). It waits
 * for an answer: Escape and clicking away do nothing, since either choice is one the person makes.
 */
export function RestorePrompt() {
  const question = useRestoreQuestion()
  const restoreRef = useRef<HTMLButtonElement>(null)
  // Keeps the last question's wording while the dialog fades out once it's answered.
  const [shown, setShown] = useState(question)

  if (question && question !== shown) {
    setShown(question)
  }

  return (
    <AlertDialog open={!!question}>
      <AlertDialogContent className="sm:max-w-md" initialFocus={restoreRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>{shown ? explanation(shown) : null}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => question?.answer("discard")}>
            Discard
          </Button>
          <Button ref={restoreRef} onClick={() => question?.answer("restore")}>
            Restore
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** What happened, and what restoring does. */
function explanation({ keptAt }: RestoreQuestion): string {
  return `Parity closed before you saved your changes at ${changeTime(keptAt)}. Restoring brings them back to the canvas, ready to save.`
}
