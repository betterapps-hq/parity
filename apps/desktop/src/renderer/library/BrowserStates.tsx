import {
  Button,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroupButton,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Skeleton,
  Spinner
} from "@buildkitgg/shadcn-baseui-kit"
import {
  type ConnectorInfo,
  layoutFor,
  kindFor,
  narrowedBy,
  nounFor,
  otherSide,
  type Problem,
  type RecentSearch,
  type Searched
} from "@parity-app/connectors"
import { History, Lightbulb, Search } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { accountActions, useAccount } from "../account/account.ts"
import { ValueMark } from "./FilterControls.tsx"

type Run = (search: Searched) => void

/**
 * Before a search: the last few to run again, each with what it was narrowed by, beside searches the connector
 * suggests trying. A click on any runs it.
 */
export function BrowserStart({
  library,
  recent,
  onRun
}: {
  library: ConnectorInfo
  recent: RecentSearch[]
  onRun: Run
}) {
  const { guide, name } = library

  return (
    <div
      className={`mx-auto grid gap-x-8 gap-y-6 px-6 py-8 ${recent.length > 0 ? "max-w-3xl sm:grid-cols-2" : "max-w-md"}`}
    >
      {recent.length > 0 && (
        <SearchList title="Recent" id="recent-searches">
          {recent.map(({ query, filters }) => (
            <SearchRow key={query} query={query} icon={<History />} onRun={() => onRun({ query, filters })}>
              {narrowedBy(library, filters).map((value) => (
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
          <SearchRow key={query} query={query} icon={<Search />} onRun={() => onRun({ query, filters: {} })} />
        ))}
      </SearchList>
    </div>
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

/** A search to run with a click: its icon, its words, then anything that narrows it. */
function SearchRow({
  query,
  icon,
  onRun,
  children
}: {
  query: string
  icon: ReactNode
  onRun: () => void
  children?: ReactNode
}) {
  return (
    <li>
      <Button
        variant="ghost"
        className="w-full justify-start gap-2.5 px-2 font-normal [&>svg:first-child]:text-muted-foreground"
        onClick={onRun}
      >
        {icon}
        <span className="truncate">{query}</span>
        <span className="ml-auto flex shrink-0 items-center gap-3">{children}</span>
      </Button>
    </li>
  )
}

/**
 * What the connector says about searching it, a click away from the search field in every state, since it's most use
 * when a search comes back thin.
 */
export function SearchTips({ library }: { library: ConnectorInfo }) {
  const { guide, name } = library

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

/** A placeholder's proportions while a search runs: a phone's, a photo's, or a web page's. */
function placeholderProportions(phones: boolean, columns: boolean): string {
  if (phones) {
    return "390 / 844"
  }

  return columns ? "4 / 3" : "16 / 10"
}

/** While a search runs: what's happening, over placeholders in the shape results will take. */
export function Searching({ library, search }: { library: ConnectorInfo; search: Searched }) {
  const columns = layoutFor(kindFor(library, search.filters)) === "columns"
  const phones = search.filters.platform === "ios"
  const grid = phones || columns ? "minmax(150px,1fr)" : "minmax(300px,1fr)"

  return (
    <div className="flex flex-col gap-4 p-4">
      <output className="flex min-h-8 items-center gap-2 text-sm text-muted-foreground">
        <Spinner aria-hidden />
        {search.deep ? "Checking each screen against your description" : `Searching ${library.name}`}
      </output>
      <div aria-hidden className="grid gap-x-4 gap-y-5" style={{ gridTemplateColumns: `repeat(auto-fill, ${grid})` }}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton
            key={index}
            className="rounded-lg"
            style={{ aspectRatio: placeholderProportions(phones, columns) }}
          />
        ))}
      </div>
    </div>
  )
}

/** Nothing matched: what to change, and the one change the browser can make for you. */
export function NothingFound({ library, search, onRun }: { library: ConnectorInfo; search: Searched; onRun: Run }) {
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

  const title = `No ${nounFor(library, search.filters).many} match “${search.query}”`
  const other = otherSide(library, search.filters)

  if (other) {
    return (
      <Notice
        title={title}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRun({ ...search, filters: { ...search.filters, [other.filter.id]: other.value.id } })}
          >
            Search {other.value.name}
          </Button>
        }
      >
        Describe it another way, or look on {other.value.name}: an app can be on {library.name} for one and not the
        other.
      </Notice>
    )
  }

  const narrowed = Object.keys(search.filters).length > 0

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
export function ProblemNotice({
  library,
  problem,
  onRetry
}: {
  library: ConnectorInfo
  problem: Problem
  onRetry: () => void
}) {
  const { name } = library
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

  if (problem.code === "signed-out") {
    return <SignedOut name={name} onSignedIn={onRetry} />
  }

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

/**
 * Parity's service runs this library's searches, and only for someone signed in (PAR-948). Sign in opens the sign-in
 * dialog over the browser, and the search runs again as soon as someone is in.
 */
function SignedOut({ name, onSignedIn }: { name: string; onSignedIn: () => void }) {
  const signedIn = useAccount().state.account !== null
  const was = useRef(signedIn)

  // Only on becoming signed in: someone already in whose search was still turned away isn't sent round again.
  useEffect(() => {
    if (signedIn && !was.current) {
      onSignedIn()
    }

    was.current = signedIn
  }, [signedIn, onSignedIn])

  return (
    <Notice
      title={`Sign in to search ${name}`}
      action={
        <Button size="sm" onClick={accountActions.open}>
          Sign in
        </Button>
      }
    />
  )
}

function Notice({ title, action, children }: { title: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {children && <EmptyDescription>{children}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}
