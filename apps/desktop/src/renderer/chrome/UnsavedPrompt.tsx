import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { useUnsavedQuestion } from "./unsaved.ts"

/** Names projects as a sentence does: "a and b", "a, b, and c". */
const listFormat = new Intl.ListFormat("en", { type: "conjunction" })

/** Asks whether to save before closing a tab or quitting with unsaved changes. Escape or clicking away cancels. */
export function UnsavedPrompt() {
  const question = useUnsavedQuestion()
  const saveRef = useRef<HTMLButtonElement>(null)
  // Keeps the last question's wording while the dialog fades out once it's answered.
  const [shown, setShown] = useState(question)
  if (question && question !== shown) setShown(question)
  const names = shown?.names ?? []
  const subject = names.length === 1 ? names[0] : `${names.length} projects`
  return (
    <Dialog open={!!question} onOpenChange={(open) => !open && question?.answer("cancel")}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        // Save is what's usually meant, so Enter does it.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          saveRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Save changes to {subject}?</DialogTitle>
          <DialogDescription>
            {names.length > 1
              ? `${listFormat.format(names)} have changes that aren't saved.`
              : "Its changes aren't saved."}{" "}
            If you don&apos;t save, they&apos;re lost when{" "}
            {shown?.action === "quit" ? "Parity closes" : "the tab closes"}.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => question?.answer("cancel")}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => question?.answer("discard")}>
            Don&apos;t save
          </Button>
          <Button ref={saveRef} onClick={() => question?.answer("save")}>
            {names.length > 1 ? "Save all" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
