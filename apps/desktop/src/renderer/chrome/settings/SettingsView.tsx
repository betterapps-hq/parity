import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Kbd
} from "@buildkitgg/shadcn-baseui-kit"
import { Check, ChevronRight, Search, X } from "lucide-react"
import { Fragment, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react"
import { shortcutFor, shortcutOf } from "../keymap.ts"
import { type Page, pagesFor, type Setting, type Value } from "./definitions.ts"
import { ProjectBadge } from "./marks.tsx"
import { arrows, Content } from "./pages.tsx"
import type { SettingsData, Store } from "./store.ts"

export interface SettingsViewProps {
  data: SettingsData
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The page it opens on, as Search actions or a menu asks: a page's id, or `ext:` and an extension's. */
  initialPage?: string
  /** What's typed in its search as it opens. */
  initialQuery?: string
  /** A setting to scroll to and mark as it opens, as picking one in Search actions does. */
  initialSetting?: string
}

/** What Settings says when a change couldn't be written. */
const notSaved = "Couldn't save this setting. Try again."

/**
 * Settings: every setting, Parity's own and each extension's, on pages in a sidebar. The person's settings apply and
 * save as they change, with a brief Saved. The project's page holds what's saved in its file: the person's settings it
 * changes for itself and its extensions' settings. Those changes are undo steps in its window, saved with the project,
 * so a bar offers Save while there are any, unless the project saves itself.
 */
export function SettingsView({
  data,
  open,
  onOpenChange,
  initialPage = "general",
  initialQuery = "",
  initialSetting
}: SettingsViewProps) {
  const [page, setPage] = useState(initialPage)
  const [query, setQuery] = useState(initialQuery)
  const [marked, setMarked] = useState(initialSetting)
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [wroteAt, setWroteAt] = useState<number>()
  const [scrolled, setScrolled] = useState(false)
  const pane = useRef<HTMLDivElement>(null)
  const searchBox = useRef<HTMLInputElement>(null)
  const pages = pagesFor(data.project)
  const wrote = () => setWroteAt((count) => (count ?? 0) + 1)
  const forget = (id: string) => setFailed(({ [id]: _, ...rest }) => rest)

  const store: Store = {
    ...data,
    marked,
    failed,
    setMine(setting: Setting, value: Value) {
      forget(setting.id)

      void Promise.resolve(data.setMine(setting, value)).then(wrote, () =>
        setFailed((current) => ({ ...current, [setting.id]: notSaved }))
      )
    },
    bind(command, keys) {
      const id = `key:${command}`

      forget(id)

      return data.bind(command, keys).then(wrote, () => setFailed((current) => ({ ...current, [id]: notSaved })))
    },
    go(to, setting) {
      setQuery("")
      setPage(to)
      setMarked(setting)

      if (!setting) {
        pane.current?.scrollTo({ top: 0 })
      }
    }
  }

  // Saving the project, by its bar, Ctrl S or itself, says Saved as the person's settings do.
  const wasUnsaved = useRef(data.unsaved)

  useEffect(() => {
    if (wasUnsaved.current && !data.unsaved) {
      setWroteAt((count) => (count ?? 0) + 1)
    }

    wasUnsaved.current = data.unsaved
  }, [data.unsaved])

  useEffect(() => {
    if (wroteAt === undefined) {
      return
    }

    const timer = setTimeout(() => setWroteAt(undefined), 1800)

    return () => clearTimeout(timer)
  }, [wroteAt])

  // A setting reached from search or a link scrolls into view, and its control takes the focus once the menu or link
  // that led there has let it go.
  useEffect(() => {
    if (!marked) {
      return
    }

    const row = pane.current?.querySelector<HTMLElement>(`[data-setting="${marked}"]`)

    row?.scrollIntoView({ block: "center" })

    const timer = setTimeout(() => {
      row
        ?.querySelector<HTMLElement>("[data-control] button, [data-control] input, [data-control] [role=combobox]")
        ?.focus({ preventScroll: true })
    }, 50)

    return () => clearTimeout(timer)
  }, [marked, page])

  const known = (id: string) => data.extensions.some((entry) => `ext:${entry.id}` === id)
  const shown = known(page) || pages.some((entry) => entry.id === page) ? page : "general"
  const heading = headingOf(shown, query, data)

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return
    }

    if (shortcutFor(event.nativeEvent, ["save"])) {
      event.preventDefault()

      if (data.unsaved) {
        data.save()
      }
    }

    if (event.key.toLowerCase() === "f") {
      event.preventDefault()
      searchBox.current?.focus()
      searchBox.current?.select()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Escape clears the search first, then closes.
        if (!next && query) {
          return setQuery("")
        }

        onOpenChange(next)
      }}
    >
      <DialogContent
        showCloseButton={false}
        onKeyDown={onKeyDown}
        className="flex h-[min(825px,calc(100dvh-2rem))] w-[min(1045px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none sm:flex-row"
      >
        <Sidebar
          pages={pages}
          page={query ? undefined : sidebarPage(shown)}
          query={query}
          setQuery={setQuery}
          searchBox={searchBox}
          store={store}
        />
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={pane}
            onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <header
              className={`sticky top-0 z-10 border-b bg-popover transition-colors ${scrolled ? "" : "border-transparent"}`}
            >
              <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-1.5 px-8">
                {heading.parent && (
                  <>
                    <button
                      type="button"
                      onClick={() => store.go(heading.parent!.id)}
                      className="-ml-1.5 shrink-0 rounded-md px-1.5 py-0.5 text-lg font-semibold tracking-tight text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                      {heading.parent.label}
                    </button>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </>
                )}
                <h2 className="truncate text-lg font-semibold tracking-tight">{heading.title}</h2>
                <span className="flex-1" />
                <span aria-live="polite" className="flex shrink-0 items-center">
                  {wroteAt !== undefined && (
                    <span
                      key={wroteAt}
                      className="flex animate-in items-center gap-1 text-xs text-muted-foreground duration-300 fade-in"
                    >
                      <Check className="size-3.5" aria-hidden />
                      Saved
                    </span>
                  )}
                </span>
              </div>
            </header>
            <div className="mx-auto w-full max-w-2xl px-8 pt-2 pb-16">
              <Content page={shown} query={query} store={store} onClear={() => setQuery("")} />
            </div>
          </div>
          {data.project && data.unsaved && !data.savesItself && <SaveBar name={data.project.name} onSave={data.save} />}
          <DialogClose
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Close" className="absolute top-3 right-3 z-20" />
            }
          >
            <X />
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The pane's heading: the page's name, after the page it's in for an extension's, or what was searched for. */
interface Heading {
  title: string
  parent?: { id: string; label: string }
}

function headingOf(page: string, query: string, data: SettingsData): Heading {
  if (query) {
    return { title: `Results for “${query.trim()}”` }
  }

  const extension = data.extensions.find((entry) => `ext:${entry.id}` === page)

  if (extension) {
    return { title: extension.name, parent: { id: "extensions", label: "Extensions" } }
  }

  return { title: pagesFor(data.project).find((entry) => entry.id === page)?.label ?? "" }
}

/** The sidebar's page for a page: Extensions for an extension's. */
function sidebarPage(page: string): string {
  return page.startsWith("ext:") ? "extensions" : page
}

/** While the project has changes Settings made that aren't saved: Save, as the editor's Save does, or Ctrl S. */
function SaveBar({ name, onSave }: { name: string; onSave: () => void }) {
  return (
    <div className="shrink-0 animate-in border-t bg-muted/40 duration-200 fade-in slide-in-from-bottom-2">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-8">
        <ProjectBadge name={name} size={16} />
        <span className="min-w-0 flex-1 truncate text-sm">{name} has unsaved changes</span>
        <Kbd>{shortcutOf("save")}</Kbd>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  )
}

function Sidebar({
  pages,
  page,
  query,
  setQuery,
  searchBox,
  store
}: {
  pages: Page[]
  page?: string
  query: string
  setQuery: (query: string) => void
  searchBox: RefObject<HTMLInputElement | null>
  store: Store
}) {
  const sections = [...new Set(pages.map((entry) => entry.group))].map((group) =>
    pages.filter((entry) => entry.group === group)
  )

  return (
    <div className="flex shrink-0 flex-col border-b bg-muted/40 sm:w-[210px] sm:border-r sm:border-b-0">
      <div className="flex h-14 shrink-0 items-center px-5">
        <DialogTitle>Settings</DialogTitle>
      </div>
      <div className="px-3 pb-3">
        <InputGroup className="h-8 bg-background/60">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchBox}
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                document.querySelector<HTMLElement>(query ? "[data-result]" : "[data-page]")?.focus()
              }

              if (event.key === "Enter") {
                document.querySelector<HTMLElement>("[data-result]")?.click()
              }
            }}
            placeholder="Search"
            aria-label="Search settings"
          />
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={() => setQuery("")}>
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
      </div>
      <nav
        aria-label="Settings pages"
        className="flex min-h-0 flex-1 gap-0.5 overflow-x-auto px-3 pb-3 sm:flex-col sm:overflow-x-visible sm:overflow-y-auto"
      >
        {sections.map((section, index) => (
          <Fragment key={section[0]!.id}>
            {index > 0 && <hr className="mx-2 my-2 hidden border-border sm:block" />}
            {section.map((entry) => (
              <NavItem key={entry.id} entry={entry} current={entry.id === page} onClick={() => store.go(entry.id)} />
            ))}
          </Fragment>
        ))}
      </nav>
    </div>
  )
}

function NavItem({ entry, current, onClick }: { entry: Page; current: boolean; onClick: () => void }) {
  const Icon = entry.icon
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (current) {
      ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
    }
  }, [current])

  return (
    <button
      ref={ref}
      type="button"
      data-page={entry.id}
      aria-current={current ? "page" : undefined}
      onClick={onClick}
      onKeyDown={(event) => arrows(event, "[data-page]")}
      className={`flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
        current ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      }`}
    >
      <span className={`flex size-4 shrink-0 items-center justify-center ${current ? "" : "opacity-80"}`}>
        <Icon className="size-4" />
      </span>
      <span className="truncate">{entry.label}</span>
    </button>
  )
}
