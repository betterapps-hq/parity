import { Badge, Dialog, DialogContent, DialogHeader, DialogTitle } from "@buildkitgg/shadcn"
import { LoaderCircle } from "lucide-react"
import { useState } from "react"
import { LibraryDetail } from "./LibraryDetail.tsx"
import { LibraryMark } from "./LibraryMark.tsx"
import type { LibraryChoice, OfferedLibrary, ShownPreview } from "./offeredLibraries.ts"
import { usePreviews } from "./usePreviews.ts"

/**
 * The project's component libraries, to add, change or remove: each library Parity has a prebuilt file for, drawn from
 * that file. Its look in its own tokens, in each of its themes; its tokens as the Tokens panel draws them; its
 * components by family; and its breakpoints. A library with an icon set of its own offers it alongside. One that asks
 * for settings, as shadcn does, takes them in a second step, and its look follows them.
 */
export function AddLibraryDialog({
  open,
  onOpenChange,
  libraries,
  loadPreview,
  initialLibrary,
  onAdd,
  onRemove
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  libraries: readonly OfferedLibrary[]
  /** What a library's file holds, with its settings when it has any. */
  loadPreview: (library: string, settings?: Record<string, string>) => Promise<ShownPreview | undefined>
  initialLibrary?: string
  onAdd: (choice: LibraryChoice) => void
  onRemove: (library: string) => void
}) {
  const [selected, setSelected] = useState(initialLibrary ?? libraries[0]?.id)
  // The first, until one is chosen, which may be only once the catalog has come.
  const library = libraries.find((candidate) => candidate.id === selected) ?? libraries[0]
  const previews = usePreviews(loadPreview)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="@container/dialog flex h-[min(760px,90vh)] flex-col gap-0 p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Component libraries</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1">
          <nav aria-label="Libraries" className="w-16 shrink-0 overflow-y-auto border-r p-2 @3xl/dialog:w-56">
            <ul className="flex flex-col gap-0.5">
              {libraries.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    aria-label={candidate.name}
                    aria-current={candidate.id === library?.id ? "true" : undefined}
                    onClick={() => setSelected(candidate.id)}
                    className="flex w-full items-center gap-2.5 rounded-md p-2 text-left text-sm hover:bg-accent/60 aria-[current]:bg-accent"
                  >
                    <LibraryMark library={candidate} />
                    <span className="hidden min-w-0 flex-1 truncate @3xl/dialog:inline">{candidate.name}</span>
                    {candidate.installed && (
                      <Badge variant="secondary" className="hidden text-[11px] @3xl/dialog:inline-flex">
                        Added
                      </Badge>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {libraries.length === 0 && (
            <LoaderCircle aria-label="Loading" className="m-auto size-5 animate-spin text-muted-foreground" />
          )}
          {library && (
            <LibraryDetail key={library.id} library={library} previews={previews} onAdd={onAdd} onRemove={onRemove} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
