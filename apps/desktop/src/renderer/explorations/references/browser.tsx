import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Spinner,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import type { Allowance, Filter, FilterValue, Found, Problem, SearchAnswer } from "@parity-app/connectors"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  History,
  Lightbulb,
  Maximize2,
  Monitor,
  RectangleHorizontal,
  RectangleVertical,
  ScanSearch,
  Search,
  Smartphone,
  Square,
  X
} from "lucide-react"
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { chipColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import type { Source } from "./data.ts"
import {
  creditOf,
  depthOf,
  fieldLabel,
  labelOf,
  narrowedBy,
  type Library,
  type LibraryId,
  Picture,
  requestFor,
  type Searched,
  shownFilters,
  sizeOf
} from "./library.tsx"

/*
 * The browser for searching a library outside the project: Mobbin's screens to place beside a design, or Unsplash's
 * photos to add to one. It's wide, over the canvas, so pictures are big enough to judge. It asks for a description
 * and whatever the library's connector says it can filter by, and nothing a search can't do. What's picked here,
 * across as many searches as it takes, is placed together.
 */

/** A result picked to place, with the description that found it. */
export interface Picked {
  found: Found
  query: string
}

/** Where a story opens the browser. */
export interface BrowserStart {
  query?: string
  filters?: Record<string, string>
  deep?: boolean
  /** An answer held for a story: still waiting, or one of the problems a connector can answer with. */
  status?: "searching" | "limited" | "failed" | "no-key"
  /** The seconds a held limit asks to wait: 20 unless given, and 0 for a source that doesn't say. */
  wait?: number
  /** Results already picked. */
  picked?: Found[]
  /** The id of the result shown larger. */
  viewing?: string
  /** How many times More results was pressed. */
  more?: number
  /** Runs the search as the browser opens, rather than opening on its results. */
  fresh?: boolean
}

type Status = "idle" | "searching" | "ready" | "problem"

/** The problems a story can hold the browser on, in the words the connectors answer with. */
function held(status: Exclude<BrowserStart["status"], "searching" | undefined>, name: string): Problem {
  if (status === "limited") {
    return { code: "rate-limited", message: "Too many searches for now.", retryAfter: 20 }
  }

  if (status === "failed") {
    return { code: "unavailable", message: `${name} didn't answer.` }
  }

  return {
    code: "no-key",
    message: `This copy of Parity has no ${name} key, so it can't search ${name}. Carry on without ${name}.`
  }
}

interface BrowserProps {
  /** The library to search, while the browser is open. */
  library?: Library
  source: Source
  start?: BrowserStart
  recent: readonly (Searched & { library: LibraryId })[]
  onClose: () => void
  onSearched: (search: Searched) => void
  onPlace: (picked: Picked[]) => void
  onOpenAtSource: (found: Found) => void
}

export function LibraryBrowser({ library, ...props }: BrowserProps) {
  // Mounted while open, so each opening starts from where it was asked to.
  return library ? <Browser key={library.id} library={library} {...props} /> : null
}

function Browser({
  library,
  source,
  start = {},
  recent,
  onClose,
  onSearched,
  onPlace,
  onOpenAtSource
}: BrowserProps & { library: Library }) {
  const { info } = library

  const first: Searched | undefined = start.query
    ? { query: start.query, filters: start.filters ?? {}, deep: start.deep }
    : undefined

  const ready = first && !start.status && !start.fresh ? opened(library, source, first, start.more ?? 0) : undefined

  const [input, setInput] = useState(start.query ?? "")
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>(start.filters ?? {})
  const [search, setSearch] = useState(first)
  const [status, setStatus] = useState<Status>(firstStatus(start, !!first, !!ready))
  const [problem, setProblem] = useState(() => heldProblem(start, info.name))
  const [results, setResults] = useState<Found[]>(ready?.found ?? [])
  const [allowance, setAllowance] = useState(ready?.allowance)
  const [more, setMore] = useState<"can" | "loading" | "none">(ready && !ready.full ? "none" : "can")

  const [picked, setPicked] = useState<Picked[]>(() =>
    (start.picked ?? []).map((found) => ({ found, query: start.query ?? "" }))
  )

  const [viewing, setViewing] = useState(start.viewing)
  const latest = useRef(0)
  const field = useRef<HTMLInputElement>(null)

  /** Asks for a search's first results, or more of them after `after`, and takes the answer if it's still wanted. */
  const ask = (next: Searched, after: Found[]) => {
    latest.current += 1
    const asked = latest.current
    const request = requestFor(library, next, after)

    const take = (answer: SearchAnswer) => {
      if (latest.current !== asked) {
        return
      }

      if ("problem" in answer) {
        setProblem(answer.problem)
        setStatus("problem")

        return
      }

      setResults([...after, ...answer.found])
      setAllowance(answer.allowance)
      setStatus("ready")
      setMore(answer.found.length < (request.limit ?? 0) ? "none" : "can")
    }

    void source.search(info.id, request).then(take)
  }

  const run = (next: Searched) => {
    setSearch(next)
    setInput(next.query)
    setChosen(next.filters)
    setStatus("searching")
    setProblem(undefined)
    setViewing(undefined)
    setMore("can")
    onSearched(next)
    ask(next, [])
  }

  // A browser opened without results to show searches right away, once, and stops listening when it closes.
  useEffect(() => {
    if (first && !ready && !start.status) {
      onSearched(first)
      ask(first, [])
    }

    return () => {
      latest.current = -1
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only as it opens
  }, [])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const query = input.trim()

    if (query) {
      run({ query, filters: chosen })
    }
  }

  const choose = (filter: Filter, value: string | undefined) => {
    const filters = Object.fromEntries(Object.entries(chosen).filter(([id]) => id !== filter.id))

    if (value !== undefined) {
      filters[filter.id] = value
    }

    setChosen(filters)

    if (search) {
      run({ query: search.query, filters })
    }
  }

  const loadMore = () => {
    if (search) {
      setMore("loading")
      ask(search, results)
    }
  }

  const toggle = (found: Found) =>
    setPicked((current) =>
      current.some((each) => each.found.id === found.id)
        ? current.filter((each) => each.found.id !== found.id)
        : [...current, { found, query: search?.query ?? "" }]
    )

  const isPicked = (found: Found) => picked.some((each) => each.found.id === found.id)
  const shown = viewing ? results.find((each) => each.id === viewing) : undefined

  const step = (by: number) => {
    const index = results.findIndex((each) => each.id === viewing)

    setViewing(results[(index + by + results.length) % results.length]?.id)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && picked.length > 0) {
      onPlace(picked)
      event.preventDefault()
    } else if (shown && event.key === "ArrowRight") {
      step(1)
    } else if (shown && event.key === "ArrowLeft") {
      step(-1)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // Esc closes a result shown larger before it closes the browser.
        if (!next && shown) {
          setViewing(undefined)
        } else if (!next) {
          onClose()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={field}
        onKeyDown={onKeyDown}
        className="flex h-[min(820px,calc(100vh-3rem))] w-[min(1120px,calc(100vw-3rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{library.title}</DialogTitle>
        <DialogDescription className="sr-only">
          Search {info.name} for {library.noun.many}, and pick the ones to bring into the project.
        </DialogDescription>
        {shown ? (
          <Larger
            library={library}
            found={shown}
            results={results}
            picked={isPicked(shown)}
            isPicked={isPicked}
            onClose={() => setViewing(undefined)}
            onStep={step}
            onView={setViewing}
            onToggle={() => toggle(shown)}
            onOpenAtSource={() => onOpenAtSource(shown)}
          />
        ) : (
          <>
            <form onSubmit={submit} className="flex shrink-0 items-center gap-2 border-b p-3">
              <InputGroup className="h-9 flex-1">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  ref={field}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={500}
                  aria-label={fieldLabel(library)}
                  placeholder={`${fieldLabel(library)}, like “${info.guide.examples[0]}”`}
                />
                <InputGroupAddon align="inline-end">
                  <SearchTips library={library} />
                </InputGroupAddon>
              </InputGroup>
              {shownFilters(info).map((filter) => (
                <FilterControl
                  key={filter.id}
                  filter={filter}
                  value={chosen[filter.id]}
                  onChange={(value) => choose(filter, value)}
                />
              ))}
              <DialogClose render={<Button variant="ghost" size="icon" aria-label="Close" />}>
                <X />
              </DialogClose>
            </form>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Body
                library={library}
                status={status}
                search={search}
                problem={problem}
                results={results}
                more={more}
                recent={recent.filter((each) => each.library === library.id)}
                isPicked={isPicked}
                onRun={run}
                onToggle={toggle}
                onView={setViewing}
                onMore={loadMore}
              />
            </div>
          </>
        )}
        <footer className="flex shrink-0 items-center gap-2 border-t px-4 py-2.5">
          <SourceCredit library={library} />
          {allowance && allowance.remaining <= 10 && (
            <span className="pl-2 text-xs text-muted-foreground">{searchesLeft(allowance)}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {picked.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setPicked([])}>
                Clear
              </Button>
            )}
            <Button size="sm" disabled={picked.length === 0} onClick={() => onPlace(picked)}>
              {library.place(picked.length)}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

/** The problem a story holds the browser on. */
function heldProblem(start: BrowserStart, name: string): Problem | undefined {
  if (!start.status || start.status === "searching") {
    return undefined
  }

  const problem = held(start.status, name)

  return start.status === "limited" && start.wait !== undefined ? { ...problem, retryAfter: start.wait } : problem
}

function firstStatus(start: BrowserStart, searched: boolean, answered: boolean): Status {
  if (start.status) {
    return start.status === "searching" ? "searching" : "problem"
  }

  if (!searched) {
    return "idle"
  }

  return answered ? "ready" : "searching"
}

/** The results a story opens on, from a source that answers at once: the first pull, and any more it asked for. */
function opened(library: Library, source: Source, search: Searched, more: number) {
  if (!source.instant) {
    return undefined
  }

  const found: Found[] = []
  let allowance: Allowance | undefined
  let full = true

  for (let pull = 0; pull <= more; pull++) {
    const request = requestFor(library, search, found)
    const answer = source.instant(library.info.id, request)

    if ("problem" in answer) {
      break
    }

    found.push(...answer.found)
    allowance = answer.allowance
    full = answer.found.length === request.limit
  }

  return { found, allowance, full }
}

function searchesLeft({ remaining, limit }: Allowance): string {
  const searches = remaining === 1 ? "search" : "searches"

  return limit ? `${remaining} of ${limit} ${searches} left` : `${remaining} ${searches} left`
}

/** Where the results are from: the source's own mark and name, from its connector, as a link to it. */
function SourceCredit({ library }: { library: Library }) {
  const { name, site, mark } = library.info

  return (
    <a
      href={site}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-sm text-sm font-medium text-foreground outline-none hover:text-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <svg viewBox={mark.box} aria-hidden className="h-3.5 w-auto shrink-0 fill-current">
        <path d={mark.path} />
      </svg>
      {name}
    </a>
  )
}

/** A filter with no value chosen, in a select. */
const any = "any"

/**
 * What a filter's value shows beside its name, wherever the value appears: the icon its connector names, or the color
 * its connector gives it. The browser has the pictures; the connector says which goes with what.
 */
function ValueMark({ value }: { value: FilterValue | undefined }) {
  if (value?.swatch) {
    return <span aria-hidden className="size-3 shrink-0 rounded-full border" style={{ background: value.swatch }} />
  }

  switch (value?.icon) {
    case "desktop":
      return <Monitor />
    case "phone":
      return <Smartphone />
    case "landscape":
      return <RectangleHorizontal />
    case "portrait":
      return <RectangleVertical />
    case "square":
      return <Square />
    default:
      return null
  }
}

/**
 * One of the connector's filters as a control, chosen from what the filter says about itself: a filter that always has
 * a value, between a few, is a switch, as Mobbin's platform is; one that can be left open is a select starting on any,
 * as Unsplash's orientation and color are.
 */
function FilterControl({
  filter,
  value,
  onChange
}: {
  filter: Filter
  value: string | undefined
  onChange: (value: string | undefined) => void
}) {
  if (filter.default && filter.values.length <= 3) {
    return (
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[value ?? filter.default]}
        onValueChange={([next]) => {
          if (next) {
            onChange(next)
          }
        }}
        aria-label={filter.name}
      >
        {filter.values.map((each) => (
          <ToggleGroupItem key={each.id} value={each.id} className="gap-1.5 px-2.5">
            <ValueMark value={each} /> {each.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )
  }

  const nameOf = (id: string) =>
    filter.values.find((each) => each.id === id)?.name ?? `Any ${filter.name.toLowerCase()}`

  return (
    <Select<string> value={value ?? any} onValueChange={(next) => onChange(!next || next === any ? undefined : next)}>
      <SelectTrigger aria-label={filter.name} className="h-9 w-40">
        <SelectValue>
          {(id: string) => (
            <span className="flex items-center gap-2">
              <ValueMark value={filter.values.find((each) => each.id === id)} /> {nameOf(id)}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={any}>{nameOf(any)}</SelectItem>
        {filter.values.map((each) => (
          <SelectItem key={each.id} value={each.id}>
            <ValueMark value={each} /> {each.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface BodyProps {
  library: Library
  status: Status
  search?: Searched
  problem?: Problem
  results: Found[]
  more: "can" | "loading" | "none"
  recent: BrowserProps["recent"]
  isPicked: (found: Found) => boolean
  onRun: (search: Searched) => void
  onToggle: (found: Found) => void
  onView: (id: string) => void
  onMore: () => void
}

function Body({
  library,
  status,
  search,
  problem,
  results,
  more,
  recent,
  isPicked,
  onRun,
  onToggle,
  onView,
  onMore
}: BodyProps) {
  if (status === "idle" || !search) {
    return <Start library={library} recent={recent} onRun={onRun} />
  }

  if (status === "searching") {
    return <Searching library={library} search={search} />
  }

  if (status === "problem" && problem) {
    return <ProblemNotice library={library} problem={problem} onRetry={() => onRun(search)} />
  }

  if (results.length === 0) {
    return <NothingFound library={library} search={search} onRun={onRun} />
  }

  const { noun } = library

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {search.deep
            ? `${countOf(results.length, "close match", "close matches")} from a deep search`
            : countOf(results.length, noun.one, noun.many)}
        </p>
        {depthOf(library.info) && <Deepen search={search} onRun={onRun} />}
      </div>
      <ul aria-label="Results" className={layouts[library.layout](search)}>
        {results.map((found) => (
          <li key={found.id} className={library.layout === "columns" ? "mb-4 break-inside-avoid" : undefined}>
            <Card
              found={found}
              picked={isPicked(found)}
              onToggle={() => onToggle(found)}
              onView={() => onView(found.id)}
            />
          </li>
        ))}
      </ul>
      <div className="flex justify-center py-2">
        {more === "none" ? (
          results.length > library.pageSize(search.filters) && (
            <p className="text-xs text-muted-foreground">
              That&apos;s every match. Describe it another way to see others.
            </p>
          )
        ) : (
          <Button variant="outline" size="sm" disabled={more === "loading"} onClick={onMore}>
            {more === "loading" && <Spinner aria-hidden />} More results
          </Button>
        )}
      </div>
    </div>
  )
}

/** How results are laid out: screens of one shape in rows, phones narrower than pages; photos packed into columns. */
const layouts: Record<Library["layout"], (search: Searched) => string> = {
  rows: (search) =>
    `grid gap-x-4 gap-y-5 ${
      search.filters.platform === "ios"
        ? "grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
        : "grid-cols-[repeat(auto-fill,minmax(300px,1fr))]"
    }`,
  columns: () => "columns-[240px] gap-4"
}

function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** A quick search's way to the connector's deep one, and the way back. */
function Deepen({ search, onRun }: { search: Searched; onRun: (search: Searched) => void }) {
  if (search.deep) {
    return (
      <Button size="sm" variant="ghost" onClick={() => onRun({ ...search, deep: false })}>
        Back to quick results
      </Button>
    )
  }

  return (
    <Hint label="Checks each screen against your description and keeps the close matches. It takes a few seconds.">
      <Button size="sm" variant="outline" onClick={() => onRun({ ...search, deep: true })}>
        <ScanSearch /> Search deeper
      </Button>
    </Hint>
  )
}

/**
 * One result: its picture, and the app it's from or who took it. A click picks it or lets it go, and a double-click or
 * its corner button shows it larger.
 */
function Card({
  found,
  picked,
  onToggle,
  onView
}: {
  found: Found
  picked: boolean
  onToggle: () => void
  onView: () => void
}) {
  const name = creditOf(found)

  return (
    <div className="group relative flex flex-col gap-1.5">
      <button
        type="button"
        aria-pressed={picked}
        aria-label={labelOf(found)}
        onClick={onToggle}
        onDoubleClick={onView}
        className={`rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
          picked ? "ring-3 ring-(--canvas-layer) ring-offset-2 ring-offset-popover" : ""
        }`}
      >
        <Picture found={found} className="rounded-lg border" />
      </button>
      {picked && (
        <span
          className="pointer-events-none absolute top-2 left-2 grid size-5 place-items-center rounded-full shadow-sm outline-2 outline-current"
          style={chipColors.layer}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      <div className="absolute top-1.5 right-1.5 rounded-md bg-popover/95 opacity-0 shadow-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <IconButton label={`View ${name} larger`} onClick={onView}>
          <Maximize2 />
        </IconButton>
      </div>
      <span className="truncate px-0.5 text-xs">{name}</span>
    </div>
  )
}

/**
 * A result shown as large as the browser allows, in place of the search and its results. Its own bar names it and
 * closes it, and a strip of every result runs under it, so what's before and after is in view.
 */
function Larger({
  library,
  found,
  results,
  picked,
  isPicked,
  onClose,
  onStep,
  onView,
  onToggle,
  onOpenAtSource
}: {
  library: Library
  found: Found
  results: Found[]
  picked: boolean
  isPicked: (found: Found) => boolean
  onClose: () => void
  onStep: (by: number) => void
  onView: (id: string) => void
  onToggle: () => void
  onOpenAtSource: () => void
}) {
  const name = creditOf(found)
  const { width, height } = sizeOf(found)

  return (
    <section aria-label={name} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b p-3">
        <h3 className="shrink-0 pl-1 text-sm font-medium">{name}</h3>
        {found.platform ? (
          <Badge variant="secondary">
            {found.platform === "ios" ? <Smartphone /> : <Monitor />} {found.platform === "ios" ? "iOS" : "Web"}
          </Badge>
        ) : (
          <span className="truncate text-sm text-muted-foreground">{found.title}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onOpenAtSource}>
            <ExternalLink /> Open in {library.info.name}
          </Button>
          <Button variant={picked ? "secondary" : "outline"} size="sm" aria-pressed={picked} onClick={onToggle}>
            {picked && <Check />} {picked ? "Picked" : "Pick"}
          </Button>
          <IconButton label="Close" shortcut="Esc" size="icon" onClick={onClose}>
            <X />
          </IconButton>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 bg-muted/40 p-4 dark:bg-muted/20">
        <IconButton label="Previous" shortcut="←" size="icon" onClick={() => onStep(-1)}>
          <ChevronLeft />
        </IconButton>
        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          <Picture
            key={found.id}
            found={found}
            className="rounded-lg border shadow-md"
            // Wide pictures fill the width; square and tall ones the height.
            style={width / height > 1.3 ? { width: "100%", maxWidth: 820 } : { height: "100%" }}
          />
        </div>
        <IconButton label="Next" shortcut="→" size="icon" onClick={() => onStep(1)}>
          <ChevronRight />
        </IconButton>
      </div>
      <Filmstrip results={results} current={found.id} isPicked={isPicked} onView={onView} />
    </section>
  )
}

/** Every result in a row under the one shown larger: the current one outlined, the picked ones checked. */
function Filmstrip({
  results,
  current,
  isPicked,
  onView
}: {
  results: Found[]
  current: string
  isPicked: (found: Found) => boolean
  onView: (id: string) => void
}) {
  const strip = useRef<HTMLUListElement>(null)

  // Keeps the current one in the middle of the strip as the arrows move through.
  useEffect(() => {
    strip.current?.querySelector("[aria-current]")?.scrollIntoView({ inline: "center", block: "nearest" })
  }, [current])

  return (
    <ul ref={strip} aria-label="All results" className="flex shrink-0 gap-2 overflow-x-auto border-t p-3">
      {results.map((each) => (
        <li key={each.id} className="relative shrink-0">
          <button
            type="button"
            aria-label={labelOf(each)}
            aria-current={each.id === current ? "true" : undefined}
            onClick={() => onView(each.id)}
            className="block rounded-md opacity-60 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current]:opacity-100 aria-[current]:ring-2 aria-[current]:ring-foreground aria-[current]:ring-offset-2 aria-[current]:ring-offset-popover"
          >
            <Picture found={each} className="rounded-md border" style={{ height: 64 }} />
          </button>
          {isPicked(each) && (
            <span
              className="pointer-events-none absolute top-1 left-1 grid size-3.5 place-items-center rounded-full outline outline-current"
              style={chipColors.layer}
            >
              <Check className="size-2.5" strokeWidth={3.5} />
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Before a search: the last few to run again, each with what it was narrowed by, beside searches the source's
 * connector suggests trying. A click on any runs it.
 */
function Start({
  library,
  recent,
  onRun
}: {
  library: Library
  recent: BrowserProps["recent"]
  onRun: (search: Searched) => void
}) {
  const { guide, name } = library.info
  const latest = recent.slice(0, 5)

  return (
    <div
      className={`mx-auto grid gap-x-8 gap-y-6 px-6 py-8 ${latest.length > 0 ? "max-w-3xl sm:grid-cols-2" : "max-w-md"}`}
    >
      {latest.length > 0 && (
        <SearchList title="Recent" id="recent-searches">
          {latest.map(({ query, filters }) => (
            <SearchRow key={query} query={query} onRun={() => onRun({ query, filters })}>
              <History className="text-muted-foreground" />
              {narrowedBy(library.info, filters).map((value) => (
                <span key={value.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ValueMark value={value} />
                  {value.name}
                </span>
              ))}
            </SearchRow>
          ))}
        </SearchList>
      )}
      <SearchList title={`Try on ${name}`} id="suggested-searches">
        {guide.examples.map((query) => (
          <SearchRow key={query} query={query} onRun={() => onRun({ query, filters: {} })}>
            <Search className="text-muted-foreground" />
          </SearchRow>
        ))}
      </SearchList>
    </div>
  )
}

/**
 * What the source's connector says about searching it, a click away from the search field in every state, since it's
 * most use when a search has come back thin. Each tip leads with a few words in bold, so the list can be skimmed.
 */
function SearchTips({ library }: { library: Library }) {
  const { guide, name } = library.info

  if (guide.tips.length === 0) {
    return null
  }

  return (
    <Popover>
      <PopoverTrigger render={<InputGroupButton size="xs" />}>
        <Lightbulb /> Tips
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>Searching {name}</PopoverTitle>
        </PopoverHeader>
        <ul className="flex flex-col gap-3">
          {guide.tips.map((tip) => (
            <li key={tip.lead} className="flex gap-2.5 text-sm">
              <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{tip.lead}</span>
                {tip.detail && <span className="text-muted-foreground">{tip.detail}</span>}
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function SearchList({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-1">
      <h3 id={id} className="px-2 text-xs font-medium text-muted-foreground">
        {title}
      </h3>
      <ul>{children}</ul>
    </section>
  )
}

/** A search to run with a click: its icon first, then its words, then anything that narrows it. */
function SearchRow({ query, onRun, children }: { query: string; onRun: () => void; children: ReactNode }) {
  const [icon, ...rest] = Array.isArray(children) ? children : [children]

  return (
    <li>
      <Button variant="ghost" className="w-full justify-start gap-2.5 px-2 font-normal" onClick={onRun}>
        {icon}
        <span className="truncate">{query}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">{rest}</span>
      </Button>
    </li>
  )
}

function Searching({ library, search }: { library: Library; search: Searched }) {
  const proportions = search.filters.platform === "ios" ? "aspect-[390/844]" : "aspect-[16/10]"

  return (
    <div className="flex flex-col gap-4 p-4">
      <output className="flex min-h-8 items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        {search.deep ? "Checking each screen against your description" : `Searching ${library.info.name}`}
      </output>
      <div aria-hidden className={layouts.rows(search)}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className={`rounded-lg ${proportions}`} />
        ))}
      </div>
    </div>
  )
}

/** Nothing matched: what to change, and the one change the browser can make for you. */
function NothingFound({
  library,
  search,
  onRun
}: {
  library: Library
  search: Searched
  onRun: (search: Searched) => void
}) {
  if (search.deep) {
    return (
      <Notice
        title="No close matches"
        action={
          <Button size="sm" variant="outline" onClick={() => onRun({ ...search, deep: false })}>
            Back to quick results
          </Button>
        }
      >
        A deep search keeps only what fits everything you described. Leave a detail out, or go back to the quick
        results.
      </Notice>
    )
  }

  const title = `No ${library.noun.many} match “${search.query}”`
  const narrowed = Object.keys(search.filters).length > 0
  const switched = shownFilters(library.info).find((filter) => filter.default && filter.values.length === 2)
  const now = switched && (search.filters[switched.id] ?? switched.default)
  const other = switched?.values.find((value) => value.id !== now)

  if (switched && other) {
    return (
      <Notice
        title={title}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRun({ ...search, filters: { ...search.filters, [switched.id]: other.id } })}
          >
            Search {other.name}
          </Button>
        }
      >
        Describe it another way, or look on {other.name}: an app can be on {library.info.name} for one and not the
        other.
      </Notice>
    )
  }

  return (
    <Notice
      title={title}
      action={
        narrowed && (
          <Button size="sm" variant="outline" onClick={() => onRun({ ...search, filters: {} })}>
            Clear filters
          </Button>
        )
      }
    >
      {narrowed ? "Describe it another way, or search without the filters." : "Describe it another way."}
    </Notice>
  )
}

/** What each problem is called, apart from the two that can be tried again. */
function problemTitle(code: Problem["code"], name: string): string {
  // A key is the app owner's to arrange, so there's nothing for the person to set up.
  if (code === "no-key") {
    return `${name} isn't available`
  }

  if (code === "key-refused") {
    return `${name} turned down its key`
  }

  return code === "no-access" ? `This ${name} plan can't search from Parity` : `${name} couldn't run that search`
}

/** A search the connector couldn't answer: which of its problems it was, and what to do. */
function ProblemNotice({ library, problem, onRetry }: { library: Library; problem: Problem; onRetry: () => void }) {
  const { name } = library.info
  const [waited, setWaited] = useState(0)
  const left = Math.max(0, Math.ceil((problem.retryAfter ?? 0) - waited))

  // Counts down the wait the source asked for.
  useEffect(() => {
    if (left === 0) {
      return undefined
    }

    const tick = setTimeout(() => setWaited((seconds) => seconds + 1), 1000)

    return () => clearTimeout(tick)
  }, [left])

  const retry = (
    <Button size="sm" variant="outline" disabled={left > 0} onClick={onRetry}>
      Try again
    </Button>
  )

  if (problem.code === "rate-limited") {
    return (
      <Notice title="Too many searches right now" action={retry}>
        {name} limits how often Parity can search. {left > 0 ? `Try again in ${left} seconds.` : "Try again shortly."}
      </Notice>
    )
  }

  if (problem.code === "unavailable") {
    return (
      <Notice title={`Couldn't reach ${name}`} action={retry}>
        Check your connection, then try again.
      </Notice>
    )
  }

  return <Notice title={problemTitle(problem.code, name)}>{problem.message}</Notice>
}

function Notice({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{children}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
