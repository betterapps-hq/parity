import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@buildkitgg/shadcn-baseui-kit"
import type { LibraryInfo } from "@parity-app/core"
import { Download } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useProject } from "../../canvas/context.ts"
import { GuestIcon, type IconEntry, iconCatalog, iconLibraries, iconStyles, iconsOf } from "../../chrome/icons.tsx"
import { optionNamed } from "../parts.tsx"

/*
 * Exporting an icon set's icons as SVG files, designed for PAR-185 and set aside on 2026-11-05: the project already has
 * its icon library's icons in code, so exporting the set gave nothing new. Kept here in case it comes back.
 */

/** How many icons the preview shows before saying how many more. */
const previewed = 24
const sizes = [16, 20, 24, 32, 48] as const

/** Which icons an export takes: every one, or those matching the search. */
const whichIcons = ["all", "matching"] as const

/** The color exported icons draw in: the text's, or black. */
const iconColors = ["current", "black"] as const

/** An icon's name as a file's, in kebab case, as icon sets name their files: `ArrowRight` is `arrow-right.svg`. */
export function iconFileName(name: string): string {
  const kebab = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])([0-9])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()

  return `${kebab || "icon"}.svg`
}

/**
 * The exploration: the project's icon set with a search, as the Icons panel has it, and an Export button that opens
 * the dialog. Exporting only says what it would have written.
 */
export function IconExport({
  initialQuery = "",
  initiallyOpen = false
}: {
  initialQuery?: string
  initiallyOpen?: boolean
}) {
  const session = useProject()
  const library = iconLibraries(session.info.libraries)[0]
  const style = library ? iconStyles(library).initial : undefined

  const catalog = useMemo(
    () => (library ? iconCatalog(session.loaded, library, style) : undefined),
    [session.loaded, library, style]
  )

  const [query, setQuery] = useState(initialQuery)
  const [open, setOpen] = useState(initiallyOpen)

  if (!library || !catalog) {
    return <p className="p-6 text-sm text-muted-foreground">The project has no icon set.</p>
  }

  const all = catalog.entries
  const matches = catalog.search(query)

  return (
    <div className="flex flex-col gap-3 p-6">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={`Search ${all.length} ${iconsOf(library)}`}
          aria-label="Search the icons"
          className="h-8 w-72 rounded-md border bg-transparent px-2.5 text-sm"
        />
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Download /> Export {iconsOf(library)}
        </Button>
      </div>
      <IconExportDialog
        open={open}
        onOpenChange={setOpen}
        library={library}
        all={all}
        matches={matches}
        query={query}
      />
    </div>
  )
}

/**
 * Exports an icon set's icons as SVG files: every icon, or those the search matches, at a size, in the color of the
 * text around them or in black, each named in kebab case as icon sets name their files, `arrow-right.svg`. The
 * preview shows the first icons with their file names.
 */
function IconExportDialog({
  open,
  onOpenChange,
  library,
  all,
  matches,
  query
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  library: LibraryInfo
  all: readonly IconEntry[]
  matches: readonly IconEntry[]
  query: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export {iconsOf(library)}</DialogTitle>
          <DialogDescription>
            Each icon as an SVG file, named as icon sets name theirs, like{" "}
            <code className="font-mono text-foreground">arrow-right.svg</code>.
          </DialogDescription>
        </DialogHeader>
        <ExportChoices all={all} matches={matches} query={query} close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * What to export and how, chosen afresh each time the dialog opens: the search's matches when there's a search, else
 * every icon, at 24 px in the text's color.
 */
function ExportChoices({
  all,
  matches,
  query,
  close
}: {
  all: readonly IconEntry[]
  matches: readonly IconEntry[]
  query: string
  close: () => void
}) {
  const session = useProject()
  const searching = query.trim() !== "" && matches.length < all.length
  const [which, setWhich] = useState<(typeof whichIcons)[number]>(searching ? "matching" : "all")
  const [size, setSize] = useState<(typeof sizes)[number]>(24)
  const [color, setColor] = useState<(typeof iconColors)[number]>("current")
  const icons = which === "matching" && searching ? matches : all

  return (
    <>
      <FieldGroup className="gap-5">
        <FieldSet>
          <FieldLegend variant="label">Icons</FieldLegend>
          <RadioGroup
            value={which}
            onValueChange={(value: string) => {
              const next = optionNamed(whichIcons, value)

              if (next) {
                setWhich(next)
              }
            }}
          >
            <Field orientation="horizontal">
              <RadioGroupItem value="all" id="icons-all" />
              <FieldLabel htmlFor="icons-all" className="font-normal">
                Every icon <span className="text-muted-foreground tabular-nums">{all.length.toLocaleString()}</span>
              </FieldLabel>
            </Field>
            <Field orientation="horizontal" data-disabled={!searching || undefined}>
              <RadioGroupItem value="matching" id="icons-matching" disabled={!searching} />
              <FieldLabel htmlFor="icons-matching" className="font-normal">
                {searching ? (
                  <>
                    Those matching “{query.trim()}”{" "}
                    <span className="text-muted-foreground tabular-nums">{matches.length.toLocaleString()}</span>
                  </>
                ) : (
                  "Those matching a search"
                )}
              </FieldLabel>
            </Field>
          </RadioGroup>
        </FieldSet>
        <div className="grid grid-cols-2 gap-4">
          <Field>
            <FieldLabel htmlFor="icon-size">Size</FieldLabel>
            <Select<string>
              value={String(size)}
              onValueChange={(value) => {
                const next = sizes.find((option) => String(option) === value)

                if (next) {
                  setSize(next)
                }
              }}
            >
              <SelectTrigger id="icon-size" className="w-full">
                <SelectValue>{(value: string) => `${value} px`}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sizes.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} px
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <FieldSet>
            <FieldLegend variant="label">Color</FieldLegend>
            <RadioGroup
              value={color}
              onValueChange={(value: string) => {
                const next = optionNamed(iconColors, value)

                if (next) {
                  setColor(next)
                }
              }}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="current" id="icon-current" />
                <Label htmlFor="icon-current" className="font-normal">
                  The text&apos;s color
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="black" id="icon-black" />
                <Label htmlFor="icon-black" className="font-normal">
                  Black
                </Label>
              </div>
            </RadioGroup>
          </FieldSet>
        </div>
        <Field>
          <FieldLabel>Preview</FieldLabel>
          <ul
            aria-label="The first icons, with their file names"
            className="grid max-h-52 grid-cols-3 gap-x-3 gap-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-2"
          >
            {icons.slice(0, previewed).map(({ label, item }) => (
              <li key={item.component} className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1">
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded ${
                    color === "black" ? "bg-white text-black" : "text-foreground"
                  }`}
                >
                  <GuestIcon loaded={session.loaded} item={item} size={16} />
                </span>
                <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                  {iconFileName(label)}
                </span>
              </li>
            ))}
          </ul>
          {icons.length > previewed && (
            <FieldDescription>And {(icons.length - previewed).toLocaleString()} more.</FieldDescription>
          )}
        </Field>
      </FieldGroup>
      <div className="mt-4">
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={icons.length === 0}
            onClick={() => {
              close()
              toast.info(`Would export ${icons.length.toLocaleString()} icons at ${size} px`)
            }}
          >
            <Download /> Export {icons.length === 1 ? "1 icon" : `${icons.length.toLocaleString()} icons`}
          </Button>
        </DialogFooter>
      </div>
    </>
  )
}
