import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@buildkitgg/shadcn-baseui-kit"
import {
  choose,
  countOf,
  depthOf,
  fieldLabel,
  type Filter,
  filtersInView,
  type Found,
  nounFor,
  queryLimit,
  type RecentSearch,
  type Searched,
  setPastView,
  shownFilters
} from "@parity-app/connectors"
import { ScanSearch, Search, X } from "lucide-react"
import { type FormEvent, type KeyboardEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react"
import { Hint } from "../chrome/Hint.tsx"
import { BrowserStart, NothingFound, ProblemNotice, Searching, SearchTips } from "./BrowserStates.tsx"
import { FilterControl, MoreFilters } from "./FilterControls.tsx"
import { LargerView } from "./LargerView.tsx"
import { type BrowserOpening, closeLibraryBrowser, useLibraryBrowser } from "./library-browser.ts"
import { ResultsGrid } from "./ResultsGrid.tsx"
import { SourceMark } from "./SourceMark.tsx"
import { useLibrarySearch } from "./use-library-search.ts"

/*
 * The library browser (PAR-839): one wide dialog over the canvas for searching any library outside the project, drawn
 * from what its connector says about itself, so pictures are big enough to judge. It asks for a description and
 * whatever the connector filters by, and nothing a search can't do. What's picked, across as many searches as it takes,
 * goes together, wherever whatever opened it says.
 */

/** The browser, while something has it open. Mounted once in the window. */
export function LibraryBrowserHost() {
  const opening = useLibraryBrowser()

  // Mounted afresh for each opening, so each starts from where it was asked to.
  return opening ? <LibraryBrowser opening={opening} /> : null
}

/** How many recent searches the browser lists before a search. */
const recentShown = 5

/** The person's recent searches on a library, newest first, read again after each search answers. */
function useRecent(library: string): [RecentSearch[], () => void] {
  const [recent, setRecent] = useState<RecentSearch[]>([])

  const read = useCallback(() => {
    void window.canvasHost.connectors.recent().then(
      (all) => setRecent(all.filter((each) => each.connector === library).slice(0, recentShown)),
      () => undefined
    )
  }, [library])

  useEffect(read, [read])

  return [recent, read]
}

function LibraryBrowser({ opening }: { opening: BrowserOpening }) {
  const { library, pick } = opening
  const [recent, readRecent] = useRecent(library.id)
  const results = useLibrarySearch(library, readRecent)
  const { status, search, run } = results
  const [input, setInput] = useState(opening.search?.query ?? "")
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>(opening.search?.filters ?? {})
  const [picked, setPicked] = useState<Found[]>([])
  const [viewing, setViewing] = useState<string>()
  const field = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  /** Runs a search, showing its words and filters in the form. */
  const runShown = (next: Searched) => {
    setInput(next.query)
    setChosen(next.filters)
    setViewing(undefined)
    run(next)
  }

  // A search it opened with runs straight away, once.
  useEffect(() => {
    if (opening.search) {
      run(opening.search)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only as it opens
  }, [])

  const searchTyped = () => {
    const query = input.trim()

    if (query) {
      runShown({ query, filters: chosen })
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    searchTyped()
  }

  /**
   * Enter searches. The form can't be left to do it: a select keeps a hidden text field in the form, and a browser only
   * submits on Enter when the form has one text field.
   */
  const onFieldKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      searchTyped()
    }
  }

  const onChoose = (filter: Filter, value: string | undefined) => {
    const filters = choose(library, chosen, filter.id, value)
    setChosen(filters)

    if (search) {
      runShown({ query: search.query, filters })
    }
  }

  const isPicked = (found: Found) => picked.some((each) => each.id === found.id)

  const toggle = (found: Found) =>
    setPicked((now) =>
      now.some((each) => each.id === found.id) ? now.filter((each) => each.id !== found.id) : [...now, found]
    )

  const take = () => {
    if (picked.length > 0) {
      closeLibraryBrowser()
      pick.take(picked)
    }
  }

  const shown = viewing ? results.results.find((each) => each.id === viewing) : undefined

  const step = (by: number) => {
    const all = results.results
    const index = all.findIndex((each) => each.id === viewing)
    setViewing(all[(index + by + all.length) % all.length]?.id)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      take()
    } else if (shown && event.key === "ArrowRight") {
      step(1)
    } else if (shown && event.key === "ArrowLeft") {
      step(-1)
    }
  }

  const filters = shownFilters(library, chosen)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Escape puts away a result shown larger before it closes the browser.
        if (!open && shown) {
          setViewing(undefined)
        } else if (!open) {
          closeLibraryBrowser()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        initialFocus={field}
        onKeyDown={onKeyDown}
        className="flex h-[min(820px,calc(100vh-3rem))] w-[min(1120px,calc(100vw-3rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">Search {library.name}</DialogTitle>
        <DialogDescription className="sr-only">
          Search {library.name} for {nounFor(library, chosen).many}, and pick the ones to use.
        </DialogDescription>
        {shown ? (
          <LargerView
            library={library}
            found={shown}
            results={results.results}
            picked={isPicked(shown)}
            pickable={pick.accepts(shown)}
            isPicked={isPicked}
            onClose={() => setViewing(undefined)}
            onStep={step}
            onView={setViewing}
            onToggle={() => toggle(shown)}
          />
        ) : (
          <>
            <form onSubmit={submit} className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
              <InputGroup className="h-9 min-w-64 flex-1">
                <InputGroupAddon>
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  ref={field}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={onFieldKeyDown}
                  maxLength={queryLimit}
                  aria-label={fieldLabel(library, chosen)}
                  placeholder={`${fieldLabel(library, chosen)}, like “${library.guide.examples[0]}”`}
                />
                <InputGroupAddon align="inline-end">
                  <SearchTips library={library} />
                </InputGroupAddon>
              </InputGroup>
              {filters.slice(0, filtersInView).map((filter) => (
                <FilterControl
                  key={filter.id}
                  filter={filter}
                  value={chosen[filter.id]}
                  onChange={(value) => onChoose(filter, value)}
                />
              ))}
              <MoreFilters
                filters={filters.slice(filtersInView)}
                chosen={chosen}
                set={setPastView(library, chosen)}
                onChoose={onChoose}
              />
              <DialogClose render={<Button variant="ghost" size="icon" aria-label="Close" />}>
                <X />
              </DialogClose>
            </form>
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
              {status === "idle" || !search ? (
                <BrowserStart library={library} recent={recent} onRun={runShown} />
              ) : (
                <BrowserBody
                  opening={opening}
                  search={search}
                  results={results}
                  scroller={scroller}
                  isPicked={isPicked}
                  onRun={runShown}
                  onToggle={toggle}
                  onView={setViewing}
                />
              )}
            </div>
          </>
        )}
        <footer className="flex shrink-0 items-center gap-2 border-t px-4 py-2.5">
          <a
            href={library.site}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-sm text-sm font-medium text-foreground outline-none hover:text-foreground/70 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <SourceMark mark={library.mark} className="h-3.5 w-auto" />
            {library.name}
          </a>
          <div className="ml-auto flex items-center gap-2">
            {picked.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setPicked([])}>
                Clear
              </Button>
            )}
            <Button size="sm" disabled={picked.length === 0} onClick={take}>
              {pick.label(picked.length)}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

interface BrowserBodyProps {
  opening: BrowserOpening
  search: Searched
  results: ReturnType<typeof useLibrarySearch>
  scroller: RefObject<HTMLDivElement | null>
  isPicked: (found: Found) => boolean
  onRun: (search: Searched) => void
  onToggle: (found: Found) => void
  onView: (id: string) => void
}

/** A search's answer: waiting, a problem, nothing found, or the results with their count. */
function BrowserBody({ opening, search, results, scroller, isPicked, onRun, onToggle, onView }: BrowserBodyProps) {
  const { library, pick } = opening

  if (results.status === "searching") {
    return <Searching library={library} search={search} />
  }

  if (results.status === "problem" && results.problem) {
    return <ProblemNotice library={library} problem={results.problem} onRetry={() => onRun(search)} />
  }

  if (results.results.length === 0) {
    return <NothingFound library={library} search={search} onRun={onRun} />
  }

  const count = results.results.length

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {search.deep
            ? `${countOf(count, { one: "close match", many: "close matches" })} from a deep search`
            : countOf(count, nounFor(library, search.filters))}
        </p>
        {depthOf(library) && <Deepen search={search} onRun={onRun} />}
      </div>
      <ResultsGrid
        scroller={scroller}
        library={library}
        search={search}
        results={results.results}
        more={results.more}
        isPicked={isPicked}
        canPick={pick.accepts}
        onToggle={onToggle}
        onView={onView}
        onMore={results.loadMore}
      />
    </div>
  )
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
