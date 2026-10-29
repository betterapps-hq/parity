import { Search } from "lucide-react"
import { Fragment, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { closeDialog, useOpenDialog } from "./app-dialogs.ts"
import { type Binding, gestures, groups, keymap } from "./keymap.ts"
import { formatKeys } from "./keys.ts"

interface Row {
  label: string
  keys: readonly string[]
  /** What the keys are held for, for a gesture. */
  with?: "drag" | "click"
}

/** Every shortcut, by group, from Help > Keyboard shortcuts or Ctrl+Shift+?. Searching matches names and keys. */
export function ShortcutsDialog() {
  const open = useOpenDialog() === "shortcuts"
  const [query, setQuery] = useState("")
  // Each time it opens it starts with every shortcut, even if keys reached the search while it was closing.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setQuery("")
  }
  const rows = (group: string): Row[] => [
    ...Object.values<Binding>(keymap).filter((binding) => binding.group === group),
    ...gestures.filter((gesture) => gesture.group === group).map((gesture) => ({ ...gesture, keys: [gesture.keys] }))
  ]
  const needle = query.trim().toLowerCase()
  const shown = (row: Row) =>
    !needle ||
    row.label.toLowerCase().includes(needle) ||
    row.keys.some((keys) => keys.toLowerCase().includes(needle) || formatKeys(keys).toLowerCase().includes(needle))
  const sections = groups
    .map((group) => ({ group, rows: rows(group).filter(shown) }))
    .filter((section) => section.rows.length > 0)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && closeDialog()}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)] sm:max-w-3xl">
        <DialogHeader className="pr-8">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription className="sr-only">
            Every keyboard shortcut in Parity, by what it acts on.
          </DialogDescription>
          <InputGroup className="mt-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shortcuts"
              aria-label="Search shortcuts"
            />
          </InputGroup>
        </DialogHeader>
        <div className="-mx-4 overflow-y-auto px-4">
          {sections.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No shortcut matches "{query.trim()}".</p>
          ) : (
            <div className="columns-1 gap-8 sm:columns-2">
              {sections.map(({ group, rows }) => (
                <section key={group} className="mb-4 break-inside-avoid">
                  <h3 className="pb-1 text-xs font-medium text-muted-foreground">{group}</h3>
                  <ul>
                    {rows.map((row) => (
                      <li key={row.label} className="flex items-center justify-between gap-4 py-1">
                        <span className="min-w-0 text-sm">{row.label}</span>
                        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                          {row.keys.map((keys, index) => (
                            <Fragment key={keys}>
                              {index > 0 && <span>or</span>}
                              <Kbd>{keys}</Kbd>
                            </Fragment>
                          ))}
                          {row.with && <span>and {row.with}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
