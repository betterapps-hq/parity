import {
  Button,
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@buildkitgg/shadcn"
import type { PreviewOffer } from "@parity-app/project"
import { CircleMinus } from "lucide-react"
import { useState } from "react"
import { reportError } from "../report-error.ts"
import { useStore, windowStore } from "../store.ts"
import { notify } from "../toasts.tsx"

/** The offer being reviewed, and what writing it does. */
interface Reviewing {
  offer: PreviewOffer
  /** Writes the file; it throws when it couldn't. */
  write: () => Promise<void>
  /** Turns the offer down, so it isn't made again. */
  dismissed: () => void
}

const reviewing = windowStore<Reviewing | undefined>(() => undefined)

/** Closes the dialog without writing, as Cancel does, turning the offer down. */
function decline(): void {
  reviewing.get()?.dismissed()
  reviewing.set(undefined)
}

/** The toast's id, one per window, so a second project's offer replaces the first's. */
const toastId = "preview-offer"

/** `ThemeProvider`, `ThemeProvider and IntlProvider`, or `A, B and C`. */
function names(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`
}

/** A file's lines with their numbers, which are what tells them apart. */
function numbered(text: string): { number: number; text: string }[] {
  return text
    .trimEnd()
    .split("\n")
    .map((line, index) => ({ number: index + 1, text: line }))
}

/**
 * Offers to write the project's preview file from the providers its entry renders around the app (PAR-104): a toast
 * that stays until it's closed, whose Review opens the file to read before anything is written. Closing it, or
 * cancelling the review, leaves the project as it is; `dismissed` is called then, so the offer isn't made again.
 */
export function offerPreviewFile(offer: PreviewOffer, write: () => Promise<void>, dismissed: () => void): void {
  const files = names([...new Set(offer.providers.map((provider) => provider.file))])
  let reviewed = false

  notify.info("Wrap frames in your providers?", {
    id: toastId,
    description: `${files} wraps the app in ${names(offer.providers.map((provider) => provider.name))}.`,
    timeout: 0,
    action: {
      label: "Review",
      run: () => {
        reviewed = true
        reviewing.set({ offer, write, dismissed })
      }
    },
    onClose: () => {
      // The action closes the toast too, before it runs, so this waits a turn to tell the two apart.
      queueMicrotask(() => {
        if (!reviewed) {
          dismissed()
        }
      })
    }
  })
}

/** Stops reviewing, as Cancel does, for when the dialog failed and was closed (PAR-667). */
export function stopReviewingPreviewFile(): void {
  reviewing.set(undefined)
}

/**
 * The preview file Parity would write, to read before it's written: where it goes, its text, and any provider it
 * leaves out with what that provider needs from the running app. Write file writes it and the frames redraw inside
 * the providers; Cancel writes nothing.
 */
export function PreviewOfferDialog() {
  const shown = useStore(reviewing)
  const [writing, setWriting] = useState(false)

  const write = async (current: Reviewing) => {
    setWriting(true)

    try {
      await current.write()
      reviewing.set(undefined)
      notify.done("Wrote the preview file", { description: current.offer.file })
    } catch (error) {
      reportError(error, { operation: "preview.write", title: "Couldn't write the preview file" })
    } finally {
      setWriting(false)
    }
  }

  return (
    <Dialog open={!!shown} onOpenChange={(open) => !open && decline()}>
      {shown && (
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Write a preview file?</DialogTitle>
            <DialogDescription>
              Every frame renders inside {names(shown.offer.providers.map((provider) => provider.name))}, as your app
              does.
              {shown.offer.providers.some((provider) => provider.themed) && " The theme follows each frame's mode."}
            </DialogDescription>
          </DialogHeader>
          <CodeBlock>
            <CodeBlockHeader>
              <CodeBlockTitle>{shown.offer.file}</CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton value={shown.offer.text} />
              </CodeBlockActions>
            </CodeBlockHeader>
            <CodeBlockContent lineNumbers className="type-code max-h-80 overflow-auto">
              {numbered(shown.offer.text).map(({ number, text }) => (
                <CodeBlockLine key={number}>{text}</CodeBlockLine>
              ))}
            </CodeBlockContent>
          </CodeBlock>
          {shown.offer.leftOut.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm">
              {shown.offer.leftOut.map((provider) => (
                <li key={`${provider.file}:${provider.name}`} className="flex items-start gap-2">
                  <CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    {provider.name} is left out because it needs {provider.needs} from {provider.file}.
                  </span>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={decline}>
              Cancel
            </Button>
            <Button disabled={writing} onClick={() => void write(shown)}>
              Write file
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
