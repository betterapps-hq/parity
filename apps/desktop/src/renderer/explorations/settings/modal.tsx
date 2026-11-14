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
import { Check, ChevronRight, FileJson, Search, X } from "lucide-react"
import { Fragment, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from "react"
import { keymap } from "../../chrome/keymap.ts"
import { formatKeys } from "../../chrome/keys.ts"
import {
  defaults,
  type Extension,
  extensions as builtIn,
  type Page,
  pages,
  project,
  settings,
  type Value
} from "./data.ts"
import { ProjectBadge } from "./marks.tsx"
import { arrows, ExtensionPage, ExtensionsPage, ProjectPage, Results, SettingsPage } from "./pages.tsx"
import { isCommand, keysIn, ShortcutsPage } from "./shortcuts.tsx"
import { type Bindings, same, type Skipped, type Store } from "./store.ts"

export interface SettingsModalProps {
  /** The page it opens on, as Search actions or a menu asks: a page's id, or `ext:` and an extension's. */
  initialPage?: string
  /** What's typed in its search as it opens. */
  initialQuery?: string
  /** A setting to scroll to and mark as it opens, as picking one in Search actions does. */
  initialSetting?: string
  /** The person's values that differ from the defaults. */
  initialValues?: Record<string, Value>
  /** The project's values: its own settings, and the person's it changes for itself. */
  initialProject?: Record<string, Value>
  /** Settings something outside Settings decides, by setting id, naming what decides it. */
  locked?: Record<string, string>
  /** Values in settings.json that Parity can't use, as the file has them, by setting id. */
  invalid?: Record<string, string>
  /** Settings whose changes can't be saved, to show what Settings says when a save fails. */
  failing?: string[]
  /** Entries in keybindings.json that Parity skipped. */
  skipped?: Skipped[]
  /** The extensions installed. */
  extensions?: Extension[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** What Settings says when a change couldn't be written, as the dialog in the app says it. */
const notSaved = "Couldn't save this setting. Try again."

/**
 * The Settings view: every setting, Parity's own and each extension's, on pages in a sidebar. The person's settings
 * apply and save as they change. The project's page holds what's saved in its file: the person's settings it changes
 * for itself and its extensions' settings. Those changes are undo steps in its window, saved with the project, so a bar
 * offers Save while there are any, unless the project saves itself. Main owns the view and it loads no project code,
 * so it's the one place app settings and permission grants change.
 */
export function SettingsModal({
  initialPage = "general",
  initialQuery = "",
  initialSetting,
  initialValues = {},
  initialProject = {},
  locked = {},
  invalid: initialInvalid = {},
  failing = [],
  skipped = [],
  extensions = builtIn,
  open = true,
  onOpenChange
}: SettingsModalProps) {
  const [page, setPage] = useState(initialPage)
  const [query, setQuery] = useState(initialQuery)
  const [mine, setMine] = useState<Record<string, Value>>(() => ({ ...defaults(), ...initialValues }))
  const [own, setOwn] = useState(initialProject)
  // What the project file holds: its values as last saved, so Save knows whether there's anything to write.
  const [saved, setSaved] = useState(initialProject)
  const [invalid, setInvalid] = useState(initialInvalid)
  const [failed, setFailed] = useState<Record<string, string>>({})
  const [bindings, setBindings] = useState<Bindings>({ changed: {}, lost: {} })
  const [grants, setGrants] = useState<Record<string, boolean>>({})
  const [marked, setMarked] = useState(initialSetting)
  const [wroteAt, setWroteAt] = useState<number>()
  const [scrolled, setScrolled] = useState(false)
  const pane = useRef<HTMLDivElement>(null)
  const searchBox = useRef<HTMLInputElement>(null)

  const unsaved = !same(own, saved)
  const savesItself = (own.autosave ?? mine.autosave) === true
  const wrote = () => setWroteAt(Date.now())

  const save = () => {
    setSaved(own)
    wrote()
  }

  const forget = (id: string) => {
    setFailed(({ [id]: _, ...rest }) => rest)
    setInvalid(({ [id]: _, ...rest }) => rest)
  }

  const store: Store = {
    locked,
    marked,
    extensions,
    failed,
    invalid,
    bindings,
    skipped,
    mine: (setting) => mine[setting.id]!,
    theirs: (setting) => own[setting.id],
    setMine(setting, value) {
      if (failing.includes(setting.id)) {
        setFailed((current) => ({ ...current, [setting.id]: notSaved }))

        return
      }

      forget(setting.id)
      setMine((current) => ({ ...current, [setting.id]: value }))
      wrote()
    },
    setTheirs(setting, value) {
      setOwn((current) => ({ ...current, [setting.id]: value }))
    },
    resetTheirs(setting) {
      setOwn(({ [setting.id]: _, ...rest }) => rest)
    },
    overrides: Object.keys(own).filter((id) =>
      settings.some((setting) => setting.id === id && setting.scope === "either")
    ),
    bind(command, keys) {
      setBindings((current) => {
        const changed = { ...current.changed, [command]: keys }
        const { [command]: _, ...lost } = current.lost
        const label = isCommand(command) ? keymap[command].label : command

        const holder = Object.keys(keymap).find(
          (other) => other !== command && keys !== "" && keysIn(other, current.changed) === keys
        )

        if (holder) {
          changed[holder] = ""
          lost[holder] = label
        }

        return { changed, lost }
      })
      wrote()
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

  // A project that saves itself saves Settings' changes to it a moment after each, as it does every other change.
  useEffect(() => {
    if (!unsaved || !savesItself) {
      return
    }

    const timer = setTimeout(() => {
      setSaved(own)
      setWroteAt(Date.now())
    }, 800)

    return () => clearTimeout(timer)
  }, [own, unsaved, savesItself])

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

  const shown = page.startsWith("ext:") || pages.some((entry) => entry.id === page) ? page : "general"
  const heading = headingOf(shown, query, extensions)

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) {
      return
    }

    if (event.key.toLowerCase() === "s") {
      event.preventDefault()

      if (unsaved) {
        save()
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

        onOpenChange?.(next)
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
              {query ? (
                <Results query={query} store={store} onClear={() => setQuery("")} />
              ) : (
                <Content page={shown} grants={grants} setGrants={setGrants} store={store} />
              )}
            </div>
          </div>
          {unsaved && !savesItself && <SaveBar onSave={save} />}
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

function headingOf(page: string, query: string, installed: readonly Extension[]): Heading {
  if (query) {
    return { title: `Results for “${query.trim()}”` }
  }

  const extension = installed.find((entry) => `ext:${entry.id}` === page)

  if (extension) {
    return { title: extension.name, parent: { id: "extensions", label: "Extensions" } }
  }

  return { title: pages.find((entry) => entry.id === page)?.label ?? "" }
}

/** The sidebar's page for a page: Extensions for an extension's. */
function sidebarPage(page: string): string {
  return page.startsWith("ext:") ? "extensions" : page
}

function Content({
  page,
  grants,
  setGrants,
  store
}: {
  page: string
  grants: Record<string, boolean>
  setGrants: (grants: Record<string, boolean>) => void
  store: Store
}) {
  if (page === "project") {
    return <ProjectPage store={store} />
  }

  if (page === "extensions") {
    return <ExtensionsPage store={store} />
  }

  if (page === "shortcuts") {
    return <ShortcutsPage store={store} />
  }

  const extension = store.extensions.find((entry) => `ext:${entry.id}` === page)

  if (extension) {
    return <ExtensionPage extension={extension} grants={grants} setGrants={setGrants} store={store} />
  }

  return <SettingsPage page={page} store={store} />
}

/** While the project has changes Settings made that aren't saved: Save, as the editor's Save does, or Ctrl S. */
function SaveBar({ onSave }: { onSave: () => void }) {
  return (
    <div className="shrink-0 animate-in border-t bg-muted/40 duration-200 fade-in slide-in-from-bottom-2">
      <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-3 px-8">
        <ProjectBadge name={project.name} size={16} />
        <span className="min-w-0 flex-1 truncate text-sm">{project.name} has unsaved changes</span>
        <Kbd>{formatKeys("Ctrl S", false)}</Kbd>
        <Button size="sm" onClick={onSave}>
          Save
        </Button>
      </div>
    </div>
  )
}

function Sidebar({
  pages: shown,
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
  const sections = [...new Set(shown.map((entry) => entry.group))].map((group) =>
    shown.filter((entry) => entry.group === group)
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
      <div className="hidden border-t p-2 sm:block">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 font-normal text-muted-foreground">
          <FileJson aria-hidden /> Open settings.json
        </Button>
      </div>
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
