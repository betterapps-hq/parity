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
  InputGroupInput,
  Skeleton,
  Spinner,
  ToggleGroup,
  ToggleGroupItem
} from "@buildkitgg/shadcn-baseui-kit"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  History,
  Maximize2,
  Monitor,
  ScanSearch,
  Search,
  Smartphone,
  X
} from "lucide-react"
import { type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { chipColors } from "../../canvas/kinds.tsx"
import { Hint } from "../../chrome/Hint.tsx"
import { IconButton } from "../../chrome/IconButton.tsx"
import { type Mode, mostPerSearch, type Platform, type Sample, sampleOf, searchScreens } from "./data.ts"
import { ScreenPicture } from "./screens.tsx"

/*
 * Find references: a wide browser over the canvas, where screenshots are big enough to read. It has the two things
 * Mobbin's search takes from a person, a description and a platform, and nothing the search can't do. A search answers
 * quickly in standard mode; Search deeper runs the same description in deep mode. Screens picked here, across as many
 * searches as it takes, are placed on the canvas together.
 */

/** A search as it was run. */
export interface Searched {
  query: string
  platform: Platform
  mode: Mode
}

/** A screen picked to place, with the description that found it. */
export interface Picked {
  sample: Sample
  query: string
}

/** Where a story opens the browser. */
export interface BrowserStart {
  query?: string
  platform?: Platform
  mode?: Mode
  /** A state Mobbin's answer can put a search in, held for a story. */
  status?: "searching" | "limited" | "failed"
  /** The ids of screens already picked. */
  picked?: string[]
  /** The id of the screen shown larger. */
  viewing?: string
  /** How many times More results was pressed. */
  more?: number
  /** Runs the search as the browser opens, rather than opening on its results. */
  fresh?: boolean
}

type Status = "idle" | "searching" | "ready" | "limited" | "failed"

/** How many screens a search asks for: three rows of web pages, or two of phones. */
const pageSize: Record<Platform, number> = { web: 9, ios: 12 }

const platformNames: Record<Platform, string> = { web: "Web", ios: "iOS" }

/** How long the stand-in takes to answer, as Mobbin's modes do. */
const wait: Record<Mode, number> = { standard: 450, deep: 2200 }

interface BrowserProps {
  open: boolean
  start?: BrowserStart
  recent: readonly Pick<Searched, "query" | "platform">[]
  onClose: () => void
  onSearched: (search: Searched) => void
  onPlace: (picked: Picked[]) => void
  onOpenInMobbin: (sample: Sample) => void
}

export function ReferenceBrowser(props: BrowserProps) {
  // Mounted while open, so each opening starts from where it was asked to.
  return props.open ? <Browser {...props} /> : null
}

function Browser({ start = {}, recent, onClose, onSearched, onPlace, onOpenInMobbin }: BrowserProps) {
  const first: Searched | undefined = start.query
    ? { query: start.query, platform: start.platform ?? "web", mode: start.mode ?? "standard" }
    : undefined

  const [input, setInput] = useState(start.query ?? "")
  const [platform, setPlatform] = useState<Platform>(start.platform ?? "web")
  const [search, setSearch] = useState(first)
  const waiting = !!start.status || !!start.fresh
  const opensOn = start.fresh ? "searching" : "ready"
  const [status, setStatus] = useState<Status>(start.status ?? (first ? opensOn : "idle"))

  const [results, setResults] = useState<Sample[]>(() =>
    first && !waiting ? pull(first, [], 1 + (start.more ?? 0)) : []
  )

  const [more, setMore] = useState<"can" | "loading" | "none">("can")

  const [picked, setPicked] = useState<Picked[]>(() =>
    (start.picked ?? []).flatMap((id) => {
      const sample = sampleOf(id)

      return sample ? [{ sample, query: start.query ?? "" }] : []
    })
  )

  const [viewing, setViewing] = useState(start.viewing)
  const [retryIn, setRetryIn] = useState(20)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const field = useRef<HTMLInputElement>(null)

  // A browser opened to search right away does, once.
  useEffect(() => {
    if (first && start.fresh && !start.status) {
      onSearched(first)
      timer.current = setTimeout(() => {
        setResults(pull(first, [], 1))
        setStatus("ready")
      }, wait[first.mode])
    }

    return () => clearTimeout(timer.current)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only as it opens
  }, [])

  // Counts down the wait Mobbin asks for when it turns a search away.
  useEffect(() => {
    if (status !== "limited" || retryIn === 0) {
      return undefined
    }

    const tick = setTimeout(() => setRetryIn((seconds) => seconds - 1), 1000)

    return () => clearTimeout(tick)
  }, [status, retryIn])

  const run = (next: Searched) => {
    clearTimeout(timer.current)
    setSearch(next)
    setInput(next.query)
    setPlatform(next.platform)
    setStatus("searching")
    setViewing(undefined)
    setMore("can")
    onSearched(next)
    timer.current = setTimeout(() => {
      setResults(pull(next, [], 1))
      setStatus("ready")
    }, wait[next.mode])
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const query = input.trim()

    if (query) {
      run({ query, platform, mode: "standard" })
    }
  }

  const changePlatform = (next: Platform) => {
    setPlatform(next)

    if (search) {
      run({ ...search, platform: next, mode: "standard" })
    }
  }

  const loadMore = () => {
    if (!search) {
      return
    }

    setMore("loading")
    timer.current = setTimeout(() => {
      const next = pull(
        search,
        results.map((each) => each.id),
        1
      )

      setResults((current) => [...current, ...next])
      setMore(next.length < pageSize[search.platform] ? "none" : "can")
    }, wait.standard)
  }

  const toggle = (sample: Sample) =>
    setPicked((current) =>
      current.some((each) => each.sample.id === sample.id)
        ? current.filter((each) => each.sample.id !== sample.id)
        : [...current, { sample, query: search?.query ?? "" }]
    )

  const isPicked = (sample: Sample) => picked.some((each) => each.sample.id === sample.id)
  const shown = viewing ? results.find((each) => each.id === viewing) : undefined

  const step = (by: number) => {
    const index = results.findIndex((each) => each.id === viewing)
    const next = results[(index + by + results.length) % results.length]

    setViewing(next?.id)
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
        // Esc steps back from a screen shown larger before it closes the browser.
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
        <DialogTitle className="sr-only">Find references</DialogTitle>
        <DialogDescription className="sr-only">
          Search Mobbin for screens from real apps, and place the ones you pick on the canvas.
        </DialogDescription>
        {shown ? (
          <Larger
            sample={shown}
            results={results}
            picked={isPicked(shown)}
            isPicked={isPicked}
            onClose={() => setViewing(undefined)}
            onStep={step}
            onView={setViewing}
            onToggle={() => toggle(shown)}
            onOpenInMobbin={() => onOpenInMobbin(shown)}
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
                  aria-label="Describe a screen"
                  placeholder="Describe a screen, like “checkout with a promo code field”"
                />
              </InputGroup>
              <ToggleGroup
                variant="outline"
                spacing={0}
                value={[platform]}
                onValueChange={([value]) => {
                  if (value === "web" || value === "ios") {
                    changePlatform(value)
                  }
                }}
                aria-label="Platform"
              >
                <ToggleGroupItem value="web" className="gap-1.5 px-2.5">
                  <Monitor /> Web
                </ToggleGroupItem>
                <ToggleGroupItem value="ios" className="gap-1.5 px-2.5">
                  <Smartphone /> iOS
                </ToggleGroupItem>
              </ToggleGroup>
              <DialogClose render={<Button variant="ghost" size="icon" aria-label="Close" />}>
                <X />
              </DialogClose>
            </form>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Body
                status={status}
                search={search}
                results={results}
                more={more}
                retryIn={retryIn}
                recent={recent}
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
          <MobbinCredit />
          {picked.length === 0 ? (
            <span className="ml-auto text-xs text-muted-foreground">Pick screens to place them</span>
          ) : (
            <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={() => setPicked([])}>
              Clear
            </Button>
          )}
          <Button size="sm" disabled={picked.length === 0} onClick={() => onPlace(picked)}>
            {placeLabel(picked.length)}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Where the screens are from: Mobbin's mark and name, as a link to Mobbin. The mark is the one Mobbin publishes for
 * apps that connect to it (github.com/mobbin/skills).
 */
function MobbinCredit() {
  return (
    <a
      href="https://mobbin.com"
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <svg viewBox="0 0 80 80" aria-hidden className="size-4 rounded-[4px] ring-1 ring-foreground/20">
        <rect width="80" height="80" fill="black" />
        <path
          fill="white"
          d="M44.7009 50.1296H33.2479V44.848L28.3096 50.1293L18 50.1246V39.3516L26.9614 29.8706H39.3491V34.9105L44.1747 29.8706H54.907V38.1601H62V50.1296H49.3749V45.1307L44.7009 50.1296Z"
        />
      </svg>
      Mobbin
    </a>
  )
}

function placeLabel(count: number): string {
  return count === 0 ? "Place on canvas" : `Place ${count} on canvas`
}

/** One pull, or several in a row for a story that starts with more loaded. */
function pull(search: Searched, seen: string[], pulls: number): Sample[] {
  const found: Sample[] = []

  for (let index = 0; index < pulls; index++) {
    const exclude = [...seen, ...found.map((each) => each.id)].slice(0, mostPerSearch)

    found.push(...searchScreens({ ...search, limit: pageSize[search.platform], exclude }))
  }

  return found
}

interface BodyProps {
  status: Status
  search?: Searched
  results: Sample[]
  more: "can" | "loading" | "none"
  retryIn: number
  recent: BrowserProps["recent"]
  isPicked: (sample: Sample) => boolean
  onRun: (search: Searched) => void
  onToggle: (sample: Sample) => void
  onView: (id: string) => void
  onMore: () => void
}

function Body({
  status,
  search,
  results,
  more,
  retryIn,
  recent,
  isPicked,
  onRun,
  onToggle,
  onView,
  onMore
}: BodyProps) {
  if (status === "idle" || !search) {
    return <Start recent={recent} onRun={onRun} />
  }

  if (status === "searching") {
    return <Searching search={search} />
  }

  if (status === "limited") {
    return (
      <Notice
        title="Too many searches right now"
        action={
          <Button size="sm" variant="outline" disabled={retryIn > 0} onClick={() => onRun(search)}>
            Try again
          </Button>
        }
      >
        {retryIn > 0
          ? `Everyone on Parity shares these searches. Try again in ${retryIn} seconds.`
          : "Everyone on Parity shares these searches. You can try again now."}
      </Notice>
    )
  }

  if (status === "failed") {
    return (
      <Notice
        title="Couldn't reach Mobbin"
        action={
          <Button size="sm" variant="outline" onClick={() => onRun(search)}>
            Try again
          </Button>
        }
      >
        Check your connection, then try again.
      </Notice>
    )
  }

  if (results.length === 0 && search.mode === "deep") {
    return (
      <Notice
        title="No close matches"
        action={
          <Button size="sm" variant="outline" onClick={() => onRun({ ...search, mode: "standard" })}>
            Back to quick results
          </Button>
        }
      >
        A deep search keeps only screens that fit everything you described. Leave a detail out, or go back to the quick
        results.
      </Notice>
    )
  }

  if (results.length === 0) {
    const other = search.platform === "web" ? "ios" : "web"

    return (
      <Notice
        title={`No screens match “${search.query}”`}
        action={
          <Button size="sm" variant="outline" onClick={() => onRun({ ...search, platform: other })}>
            Search {platformNames[other]}
          </Button>
        }
      >
        Say what kind of screen it is, then what&apos;s on it. An app can be on Mobbin for {platformNames[other]} only.
      </Notice>
    )
  }

  const full = results.length % pageSize[search.platform] === 0 && results.length < mostPerSearch

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {search.mode === "deep"
            ? `${countOf(results.length, "close match", "close matches")} from a deep search`
            : countOf(results.length, "screen", "screens")}
        </p>
        {search.mode === "standard" ? (
          <Hint label="Checks each screen against your description and keeps the close matches. It takes a few seconds.">
            <Button size="sm" variant="outline" onClick={() => onRun({ ...search, mode: "deep" })}>
              <ScanSearch /> Search deeper
            </Button>
          </Hint>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onRun({ ...search, mode: "standard" })}>
            Back to quick results
          </Button>
        )}
      </div>
      <ul aria-label="Results" className={`grid gap-x-4 gap-y-5 ${columns[search.platform]}`}>
        {results.map((sample) => (
          <li key={sample.id}>
            <Card
              sample={sample}
              picked={isPicked(sample)}
              onToggle={() => onToggle(sample)}
              onView={() => onView(sample.id)}
            />
          </li>
        ))}
      </ul>
      <div className="flex justify-center py-2">
        {more === "none" || !full ? (
          results.length > pageSize[search.platform] && (
            <p className="text-xs text-muted-foreground">
              That&apos;s every match. Describe it another way to see other screens.
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

const columns: Record<Platform, string> = {
  web: "grid-cols-[repeat(auto-fill,minmax(300px,1fr))]",
  ios: "grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
}

function countOf(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * One result: its picture and its app's name. A click picks it or lets it go, and a double-click or its corner button
 * shows it larger.
 */
function Card({
  sample,
  picked,
  onToggle,
  onView
}: {
  sample: Sample
  picked: boolean
  onToggle: () => void
  onView: () => void
}) {
  return (
    <div className="group relative flex flex-col gap-1.5">
      <button
        type="button"
        aria-pressed={picked}
        aria-label={sample.app}
        onClick={onToggle}
        onDoubleClick={onView}
        className={`rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
          picked ? "ring-3 ring-(--canvas-layer) ring-offset-2 ring-offset-popover" : ""
        }`}
      >
        <ScreenPicture screen={sample} className="rounded-lg border" />
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
        <IconButton label={`View ${sample.app} larger`} onClick={onView}>
          <Maximize2 />
        </IconButton>
      </div>
      <span className="truncate px-0.5 text-xs">{sample.app}</span>
    </div>
  )
}

/**
 * A result shown as large as the browser allows, in place of the search and its results. Its own bar names the app
 * and its platform and closes it, and a strip of every result runs under it, so what's before and after is in view.
 */
function Larger({
  sample,
  results,
  picked,
  isPicked,
  onClose,
  onStep,
  onView,
  onToggle,
  onOpenInMobbin
}: {
  sample: Sample
  results: Sample[]
  picked: boolean
  isPicked: (sample: Sample) => boolean
  onClose: () => void
  onStep: (by: number) => void
  onView: (id: string) => void
  onToggle: () => void
  onOpenInMobbin: () => void
}) {
  const PlatformIcon = sample.platform === "ios" ? Smartphone : Monitor

  return (
    <section aria-label={sample.app} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b p-3">
        <h3 className="pl-1 text-sm font-medium">{sample.app}</h3>
        <Badge variant="secondary">
          <PlatformIcon /> {platformNames[sample.platform]}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onOpenInMobbin}>
            <ExternalLink /> Open in Mobbin
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
        <IconButton label="Previous screen" shortcut="←" size="icon" onClick={() => onStep(-1)}>
          <ChevronLeft />
        </IconButton>
        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          <ScreenPicture
            key={sample.id}
            screen={sample}
            className="rounded-lg border shadow-md"
            style={sample.platform === "ios" ? { height: "100%" } : { width: "100%", maxWidth: 820 }}
          />
        </div>
        <IconButton label="Next screen" shortcut="→" size="icon" onClick={() => onStep(1)}>
          <ChevronRight />
        </IconButton>
      </div>
      <Filmstrip results={results} current={sample.id} isPicked={isPicked} onView={onView} />
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
  results: Sample[]
  current: string
  isPicked: (sample: Sample) => boolean
  onView: (id: string) => void
}) {
  const strip = useRef<HTMLUListElement>(null)

  // Keeps the current screen in the middle of the strip as the arrows move through.
  useEffect(() => {
    strip.current?.querySelector("[aria-current]")?.scrollIntoView({ inline: "center", block: "nearest" })
  }, [current])

  return (
    <ul ref={strip} aria-label="All results" className="flex shrink-0 gap-2 overflow-x-auto border-t p-3">
      {results.map((each) => (
        <li key={each.id} className="relative shrink-0">
          <button
            type="button"
            aria-label={each.app}
            aria-current={each.id === current ? "true" : undefined}
            onClick={() => onView(each.id)}
            className="block rounded-md opacity-60 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 aria-[current]:opacity-100 aria-[current]:ring-2 aria-[current]:ring-foreground aria-[current]:ring-offset-2 aria-[current]:ring-offset-popover"
          >
            <ScreenPicture
              screen={each}
              className="rounded-md border"
              style={{ height: each.platform === "ios" ? 72 : 56 }}
            />
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

const tips = [
  "Say what kind of screen it is, then what's on it: “paywall with plan cards and a free trial button”.",
  "Name an app to see only that app: “Ledgerly pricing page”.",
  "Search for one screen at a time. Words like “clean” or “modern” don't help."
]

/** Before a search: the last few to run again, and how Mobbin's search likes a screen described. */
function Start({ recent, onRun }: { recent: BrowserProps["recent"]; onRun: (search: Searched) => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-6 py-10">
      {recent.length > 0 && (
        <section aria-labelledby="recent-searches" className="flex flex-col gap-1">
          <h3 id="recent-searches" className="px-2 text-xs font-medium text-muted-foreground">
            Recent
          </h3>
          <ul>
            {recent.map(({ query, platform }) => (
              <li key={`${platform} ${query}`}>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2.5 px-2 font-normal"
                  onClick={() => onRun({ query, platform, mode: "standard" })}
                >
                  <History className="text-muted-foreground" />
                  <span className="truncate">{query}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{platformNames[platform]}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="describing-a-screen" className="flex flex-col gap-2 px-2">
        <h3 id="describing-a-screen" className="text-xs font-medium text-muted-foreground">
          Describing a screen
        </h3>
        <ul className="flex list-disc flex-col gap-1.5 pl-4 text-sm text-muted-foreground">
          {tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Searching({ search }: { search: Searched }) {
  const proportions = search.platform === "ios" ? "aspect-[390/844]" : "aspect-[16/10]"

  return (
    <div className="flex flex-col gap-4 p-4">
      <output className="flex min-h-8 items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        {search.mode === "deep" ? "Checking each screen against your description" : "Searching Mobbin"}
      </output>
      <div aria-hidden className={`grid gap-x-4 gap-y-5 ${columns[search.platform]}`}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className={`rounded-lg ${proportions}`} />
        ))}
      </div>
    </div>
  )
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
