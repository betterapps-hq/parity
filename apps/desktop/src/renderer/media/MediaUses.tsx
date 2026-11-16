import { InputGroup, InputGroupAddon, InputGroupInput } from "@buildkitgg/shadcn-baseui-kit"
import {
  type CodeFileUse,
  codeFilesUsing,
  type DesignUse,
  designsUsing,
  findUses,
  type ProjectImage,
  usesOnCard
} from "@parity-app/editor"
import { ArrowLeft, ChevronRight, Code, Search } from "lucide-react"
import { type ReactNode, useEffect, useId, useRef, useState } from "react"
import { DesignIcon } from "../canvas/kinds.tsx"
import { IconButton } from "../chrome/IconButton.tsx"
import { Name } from "../chrome/Name.tsx"
import { GroupLabel, PanelSectionTitle } from "../chrome/PanelSection.tsx"

/*
 * Where one of the project's media is used (PAR-871): on its card, the designs with the most layers and the files of
 * code that name it, with the rest counted on a row that opens every place in the card's stead; and in full, for the
 * dialog that asks before removing it. A design's row is the button that selects every layer in it that shows it.
 */

/** The layers of one design that show a medium, to select on the canvas together. */
export interface MediaLayers {
  document: string
  design: string
  nodes: string[]
}

type OnShow = (layers: MediaLayers) => void

/** "1 layer", "40 layers": a count with its noun. */
function count(amount: number, one: string, many: string): string {
  return `${amount} ${amount === 1 ? one : many}`
}

/** How many rows of where it's used a card lists before the rest wait in every place. */
const cardRows = 3

interface CardUsesProps {
  image: ProjectImage
  onShow: OnShow
  onAll: () => void
  /** Back from every place, so focus returns to the row that opened it. */
  returned?: boolean
}

/**
 * Where it's used, on its card: up to three rows, designs before files of code, and past them a row counting the rest,
 * which opens every place.
 */
export function CardUses({ image, onShow, onAll, returned = false }: CardUsesProps) {
  const { designs, files, moreDesigns, moreFiles } = usesOnCard(image, cardRows)
  const more = moreDesigns > 0 || moreFiles > 0
  const heading = useId()
  const moreRow = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (returned) {
      moreRow.current?.focus()
    }
  }, [returned])

  return (
    <section aria-labelledby={heading} className="border-t py-2 pr-1.5 pl-3 text-xs">
      <div className="flex h-6 items-center pr-1.5">
        <GroupLabel as="h3" className="flex-1">
          <span id={heading}>Used in</span>
        </GroupLabel>
      </div>
      <ul aria-label="Where it's used" className="flex flex-col">
        {designs.map((design) => (
          <DesignRow key={`${design.document}#${design.design}`} design={design} onShow={onShow} />
        ))}
        {files.map((file) => (
          <FileRow key={file.path} file={file} />
        ))}
      </ul>
      {more && (
        <button
          ref={moreRow}
          type="button"
          onClick={onAll}
          className="-ml-1.5 flex h-7 w-[calc(100%+0.375rem)] items-center gap-2 rounded-md px-1.5 text-left text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <span className="flex-1 truncate">{moreOf(moreDesigns, moreFiles, files.length > 0)}</span>
          <ChevronRight aria-hidden className="size-3.5 shrink-0" />
        </button>
      )}
    </section>
  )
}

/**
 * What waits in every place: "45 more designs and 5 files of code", or "2 more files of code" when the card already
 * lists some.
 */
function moreOf(designs: number, files: number, filesListed: boolean): string {
  const parts: string[] = []

  if (designs > 0) {
    parts.push(count(designs, "more design", "more designs"))
  }

  if (files > 0) {
    parts.push(
      count(
        files,
        filesListed ? "more file of code" : "file of code",
        filesListed ? "more files of code" : "files of code"
      )
    )
  }

  return parts.join(" and ")
}

/** How many places it takes before every place offers a search. */
const searchFrom = 8

/**
 * Every place it's used, in the card's stead: the designs, the most layers first, then the files of code, each a group
 * with its count whose heading stays at the top while its rows scroll, searched by name once there are many. Focus
 * moves into it as it opens, and the card holds it. Escape clears the search, then goes back to the card.
 */
export function EveryUse({ image, onBack, onShow }: { image: ProjectImage; onBack: () => void; onShow: OnShow }) {
  const [typed, setTyped] = useState("")
  const view = useRef<HTMLElement>(null)
  const searchable = designsUsing(image).length + codeFilesUsing(image).length >= searchFrom
  // A search left from when there were more places stops narrowing once the field has gone.
  const query = searchable ? typed : ""
  const { designs, files } = findUses(image, query)

  // The search when there is one, or Back.
  useEffect(() => {
    const here = view.current
    const first = here?.querySelector("input") ?? here?.querySelector("button")
    first?.focus()
  }, [])

  // Escape steps back a level at a time, rather than closing the card with what's been typed. It's heard here, before
  // the card's own Escape, which would close it.
  useEffect(() => {
    const here = view.current

    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (query) {
        setTyped("")
      } else {
        onBack()
      }
    }

    here?.addEventListener("keydown", escape)

    return () => here?.removeEventListener("keydown", escape)
  }, [query, onBack])

  return (
    <section ref={view} aria-label={`Where ${image.name} is used`} className="flex max-h-[26rem] flex-col text-xs">
      <div className="flex shrink-0 items-center gap-1 border-b px-1.5 py-1.5">
        <IconButton label="Back" shortcut="close" className="size-7" onClick={onBack}>
          <ArrowLeft />
        </IconButton>
        <Name className="min-w-0 flex-1 pr-1.5 text-sm font-medium">{image.name}</Name>
      </div>
      {searchable && (
        <div className="shrink-0 px-3 pt-3">
          <InputGroup className="h-7">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search designs and code"
              placeholder="Search designs and code"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="text-xs"
            />
          </InputGroup>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2 [scrollbar-gutter:stable]">
        {designs.length > 0 && (
          <UseGroup title="Designs" amount={designs.length}>
            {designs.map((design) => (
              <DesignRow key={`${design.document}#${design.design}`} design={design} onShow={onShow} />
            ))}
          </UseGroup>
        )}
        {files.length > 0 && (
          <UseGroup title="Code" amount={files.length}>
            {files.map((file) => (
              <FileRow key={file.path} file={file} />
            ))}
          </UseGroup>
        )}
        {designs.length + files.length === 0 && (
          <p className="px-3 pt-6 text-center text-muted-foreground">Nothing matches “{query.trim()}”</p>
        )}
      </div>
    </section>
  )
}

/** A group of every place, its heading staying at the top while its own rows scroll under it. */
function UseGroup({ title, amount, children }: { title: string; amount: number; children: ReactNode }) {
  return (
    <section aria-label={title} className="pb-2">
      <div className="sticky top-0 z-10 flex h-8 items-center bg-popover px-3">
        <PanelSectionTitle title={title} count={amount} tone="quiet" spacing="" />
      </div>
      <ul className="flex flex-col pr-1.5 pl-3">{children}</ul>
    </section>
  )
}

/**
 * Every place it's used in one list, for the dialog that asks before removing it: each design, then each file of
 * code.
 */
export function MediaUses({
  image,
  onShow,
  className = ""
}: {
  image: ProjectImage
  onShow: OnShow
  className?: string
}) {
  return (
    <ul aria-label="Where it's used" className={`flex flex-col ${className}`}>
      {designsUsing(image).map((design) => (
        <DesignRow key={`${design.document}#${design.design}`} design={design} onShow={onShow} />
      ))}
      {codeFilesUsing(image).map((file) => (
        <FileRow key={file.path} file={file} />
      ))}
    </ul>
  )
}

/**
 * A design that uses it: its name and how many of its layers do. The row is the button that selects them all, so a
 * long list isn't a column of Show buttons; Show takes the count's place on the row the pointer or focus is on.
 */
function DesignRow({ design, onShow }: { design: DesignUse; onShow: OnShow }) {
  const layers = count(design.layers.length, "layer", "layers")

  return (
    <li>
      <button
        type="button"
        aria-label={`Show ${layers} in ${design.name}`}
        onClick={() => onShow({ document: design.document, design: design.design, nodes: design.layers })}
        className="group/row -ml-1.5 flex h-7 w-[calc(100%+0.375rem)] items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <DesignIcon kind="screen" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{design.name}</span>
        <span className="shrink-0 text-muted-foreground tabular-nums group-hover/row:hidden group-focus-visible/row:hidden">
          {layers}
        </span>
        <span className="hidden shrink-0 font-medium group-hover/row:inline group-focus-visible/row:inline">Show</span>
      </button>
    </li>
  )
}

/** A file of code that names it: the file's name, and its lines. Its whole path is its tooltip. */
function FileRow({ file }: { file: CodeFileUse }) {
  const lines = file.lines.length === 1 ? `line ${file.lines[0]}` : `lines ${file.lines.join(", ")}`

  return (
    <li className="flex h-7 items-center gap-2 pr-1.5" title={file.path}>
      <Code aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-2xs">{file.name}</span>
      <span className="max-w-[45%] shrink-0 truncate text-muted-foreground tabular-nums">{lines}</span>
    </li>
  )
}
