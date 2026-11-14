import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Kbd,
  Switch
} from "@buildkitgg/shadcn-baseui-kit"
import { ChevronDown, ChevronRight, FileJson, RotateCcw, Search, X } from "lucide-react"
import { Fragment, type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react"
import { AppSelect } from "../../chrome/AppSelect.tsx"
import { CopyButton } from "../../chrome/Copy.tsx"
import { groups, keymap } from "../../chrome/keymap.ts"
import { formatKeys } from "../../chrome/keys.ts"
import {
  defaults,
  type Extension,
  extensions as builtIn,
  type Option,
  type Page,
  pages,
  project,
  type Setting,
  settings,
  shownIn,
  type Value,
  type View
} from "./data.ts"
import { type Hit, placeOf, search } from "./search.ts"

export interface SettingsModalProps {
  /** Every project's settings, or this project's. */
  initialView?: View
  /** The page it opens on, as Search actions or a menu asks: a page's id, or `ext:` and an extension's. */
  initialPage?: string
  /** What's typed in its search as it opens. */
  initialQuery?: string
  /** A setting to scroll to and mark as it opens, as picking one in Search actions does. */
  initialSetting?: string
  /** The person's values that differ from the defaults. */
  initialValues?: Record<string, Value>
  /** This project's values: its own settings, and the ones it changes for itself. */
  initialProject?: Record<string, Value>
  /** Settings something outside Settings decides, by setting id, naming what decides it. */
  locked?: Record<string, string>
  /** The extensions installed. */
  extensions?: Extension[]
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/** What the view switch offers. */
const views: { value: View; label: string }[] = [
  { value: "app", label: "Every project" },
  { value: "project", label: `${project.name} only` }
]

/**
 * The Settings view: every setting, Parity's own and each extension's, on pages in a sidebar. A switch at the top picks
 * whose settings it shows: the person's, for every project, or this project's, which go in its file and are undo steps
 * in its window. A setting a project can change for itself shows in both; the project's value wins in that project.
 * Main owns the view and it loads no project code, so it's the one place app settings and permission grants change.
 */
export function SettingsModal({
  initialView = "app",
  initialPage = "general",
  initialQuery = "",
  initialSetting,
  initialValues = {},
  initialProject = {},
  locked = {},
  extensions = builtIn,
  open = true,
  onOpenChange
}: SettingsModalProps) {
  const [view, setView] = useState(initialView)
  const [page, setPage] = useState(initialPage)
  const [query, setQuery] = useState(initialQuery)
  const [app, setApp] = useState<Record<string, Value>>(() => ({ ...defaults(), ...initialValues }))
  const [own, setOwn] = useState(initialProject)
  const [grants, setGrants] = useState<Record<string, boolean>>({})
  const [marked, setMarked] = useState(initialSetting)
  const pane = useRef<HTMLDivElement>(null)

  const store: Store = {
    view,
    locked,
    marked,
    extensions,
    /** Where a change to a setting goes: the view's, unless the setting belongs to only the other one. */
    target: (setting) => targetOf(setting, view),
    value(setting, where) {
      if (where === "app") {
        return app[setting.id]!
      }

      return own[setting.id] ?? app[setting.id]!
    },
    change(setting, where, value) {
      if (where === "app") {
        setApp((current) => ({ ...current, [setting.id]: value }))
      } else {
        setOwn((current) => ({ ...current, [setting.id]: value }))
      }
    },
    reset(setting, where) {
      if (where === "app") {
        setApp((current) => ({ ...current, [setting.id]: setting.default }))
      } else {
        setOwn(({ [setting.id]: _, ...rest }) => rest)
      }
    },
    differs: (setting, where) =>
      where === "app" || setting.scope === "project"
        ? !same(store.value(setting, where), setting.default)
        : setting.id in own,
    overridden: (setting) => setting.scope === "either" && setting.id in own,
    go(to, setting, nextView) {
      setQuery("")

      if (nextView) {
        setView(nextView)
      }

      setPage(to)
      setMarked(setting)

      if (!setting) {
        pane.current?.scrollTo({ top: 0 })
      }
    }
  }

  const available = pages.filter((entry) => pageShows(entry, view))
  const shown = page.startsWith("ext:") || available.some((entry) => entry.id === page) ? page : "general"

  useEffect(() => {
    if (!marked) {
      return
    }

    const row = pane.current?.querySelector<HTMLElement>(`[data-setting="${marked}"]`)

    row?.scrollIntoView({ block: "center" })
    row
      ?.querySelector<HTMLElement>("[data-control] button, [data-control] input, [data-control] [role=combobox]")
      ?.focus({ preventScroll: true })
  }, [marked, page, view])

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
        className="flex h-[min(825px,calc(100dvh-2rem))] w-[min(1045px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <div className="flex h-12 shrink-0 items-center gap-3 pr-2 pl-4">
          <DialogTitle className="text-sm font-semibold">Settings</DialogTitle>
          <AppSelect
            variant="dialog"
            size="sm"
            className="w-40"
            aria-label="Whose settings"
            items={views}
            value={view}
            onValueChange={(next) => next && setView(next)}
          />
          {view === "project" && (
            <span className="truncate text-xs text-muted-foreground">
              Saved in {project.file}. Each change is an undo step.
            </span>
          )}
          <span className="flex-1" />
          <DialogClose render={<Button variant="ghost" size="icon-sm" aria-label="Close" />}>
            <X />
          </DialogClose>
        </div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <Sidebar
            pages={available}
            page={query ? undefined : sidebarPage(shown)}
            query={query}
            setQuery={setQuery}
            store={store}
          />
          <div ref={pane} className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 sm:px-8">
            {query ? (
              <Results query={query} store={store} />
            ) : (
              <PageView page={shown} grants={grants} setGrants={setGrants} store={store} />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** What the pages read and change, for the view Settings shows. */
interface Store {
  view: View
  locked: Record<string, string>
  marked?: string
  extensions: Extension[]
  target: (setting: Setting) => View
  value: (setting: Setting, where: View) => Value
  change: (setting: Setting, where: View, value: Value) => void
  reset: (setting: Setting, where: View) => void
  /** Whether it differs from what it falls back to: its default, or every project's value for a project's change. */
  differs: (setting: Setting, where: View) => boolean
  /** Whether this project changes it for itself. */
  overridden: (setting: Setting) => boolean
  go: (page: string, setting?: string, view?: View) => void
}

/** Where a change to a setting goes: the view's, unless the setting belongs to only the other one. */
function targetOf(setting: Setting, view: View): View {
  if (shownIn(setting, view)) {
    return view
  }

  return setting.scope === "project" ? "project" : "app"
}

/** The sidebar's page for a page: Extensions for an extension's. */
function sidebarPage(page: string): string {
  return page.startsWith("ext:") ? "extensions" : page
}

/** Whether a page has anything for a view. Extensions always show, for what each one is and does. */
function pageShows(page: Page, view: View): boolean {
  return page.id === "extensions" || settings.some((setting) => setting.page === page.id && shownIn(setting, view))
}

function Sidebar({
  pages: shown,
  page,
  query,
  setQuery,
  store
}: {
  pages: Page[]
  page?: string
  query: string
  setQuery: (query: string) => void
  store: Store
}) {
  const nav = useRef<HTMLElement>(null)

  const sections = [...new Set(shown.map((entry) => entry.group))].map((group) =>
    shown.filter((entry) => entry.group === group)
  )

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b px-3 pb-3 sm:w-[210px] sm:border-b-0">
      <InputGroup className="h-8">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              const first = document.querySelector<HTMLElement>(query ? "[data-result]" : "[data-page]")

              first?.focus()
            }

            if (event.key === "Enter") {
              document.querySelector<HTMLElement>("[data-result]")?.click()
            }
          }}
          placeholder="Search"
          aria-label="Search settings"
        />
      </InputGroup>
      <nav
        ref={nav}
        aria-label="Settings pages"
        className="flex min-h-0 flex-1 gap-1 overflow-x-auto sm:flex-col sm:overflow-x-visible sm:overflow-y-auto"
      >
        {sections.map((section, index) => (
          <Fragment key={section[0]!.id}>
            {index > 0 && <hr className="my-1 hidden border-border sm:block" />}
            {section.map((entry) => (
              <NavItem
                key={entry.id}
                entry={entry}
                current={entry.id === page}
                onClick={() => store.go(entry.id)}
                onKeyDown={(event) => arrows(event, "[data-page]")}
              />
            ))}
          </Fragment>
        ))}
      </nav>
      <Button variant="ghost" size="sm" className="hidden justify-start gap-2 text-muted-foreground sm:flex">
        <FileJson /> Open {store.view === "app" ? "settings.json" : project.file}
      </Button>
    </div>
  )
}

/** Up and down move between the items a selector finds, as in a list; Tab leaves the list. */
function arrows(event: KeyboardEvent<HTMLElement>, selector: string) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return
  }

  const items = [...document.querySelectorAll<HTMLElement>(selector)]
  const at = items.indexOf(event.currentTarget)

  event.preventDefault()
  items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus()
}

function NavItem({
  entry,
  current,
  onClick,
  onKeyDown
}: {
  entry: Page
  current: boolean
  onClick: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
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
      onKeyDown={onKeyDown}
      className={`flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${
        current ? "bg-accent font-medium text-accent-foreground" : "text-foreground/80 hover:bg-accent/50"
      }`}
    >
      <Icon className="size-4 shrink-0 opacity-80" />
      <span className="truncate">{entry.label}</span>
    </button>
  )
}

function PageView({
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
  if (page === "extensions") {
    return <ExtensionsPage store={store} />
  }

  if (page.startsWith("ext:")) {
    const extension = store.extensions.find((entry) => `ext:${entry.id}` === page) ?? store.extensions[0]!

    return <ExtensionPage extension={extension} grants={grants} setGrants={setGrants} store={store} />
  }

  const entry = pages.find((candidate) => candidate.id === page)!

  return (
    <>
      <PageHeader title={entry.label} />
      <Rows>
        {settings
          .filter((setting) => setting.page === page && shownIn(setting, store.view))
          .map((setting) => (
            <SettingRow key={setting.id} setting={setting} store={store} />
          ))}
        {page === "updates" && (
          <Row label="Version" detail="Parity 0.82.1">
            <Button variant="outline" size="sm">
              Check for updates
            </Button>
          </Row>
        )}
      </Rows>
      {page === "shortcuts" && <Shortcuts />}
    </>
  )
}

/** Every page's heading: its name, after the page it's in for an extension's. */
function PageHeader({ title, parent }: { title: string; parent?: { label: string; onClick: () => void } }) {
  return (
    <header className="sticky top-0 z-10 flex h-12 items-center gap-1.5 bg-popover pb-2">
      {parent && (
        <>
          <button
            type="button"
            onClick={parent.onClick}
            className="-ml-1.5 rounded-md px-1.5 py-0.5 text-lg font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            {parent.label}
          </button>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </>
      )}
      <h2 className="truncate text-lg font-semibold">{title}</h2>
    </header>
  )
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="pt-6 pb-1 text-xs font-medium text-muted-foreground">{children}</h3>
}

function Rows({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label} className="divide-y divide-border/60">
      {children}
    </section>
  )
}

/**
 * A setting's row: what it is on the left; its control, then its reset, on the right. The reset keeps its place when
 * there's nothing to reset, so controls don't move.
 */
function Row({
  id,
  above,
  label,
  detail,
  note,
  marked,
  reset,
  children
}: {
  id?: string
  /** Where it is, over the label, as search results show it. */
  above?: ReactNode
  label: ReactNode
  detail?: ReactNode
  /** Beside the label: that it's changed, or that this project changes it. */
  note?: ReactNode
  marked?: boolean
  reset?: { label: string; onClick: () => void }
  children?: ReactNode
}) {
  return (
    <div
      data-setting={id}
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 py-3 ${marked ? "-mx-3 rounded-md bg-accent/40 px-3" : ""}`}
    >
      <div className="min-w-0 flex-1 basis-56">
        {above}
        <div className="flex items-center gap-2 text-sm font-medium">
          {label}
          {note}
        </div>
        {detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
      </div>
      <div className="flex items-center gap-1">
        <div data-control className="flex min-w-48 justify-end">
          {children}
        </div>
        <span className="flex size-7 items-center justify-center">
          {reset && (
            <Button variant="ghost" size="icon-xs" aria-label={reset.label} title={reset.label} onClick={reset.onClick}>
              <RotateCcw />
            </Button>
          )}
        </span>
      </div>
    </div>
  )
}

function SettingRow({
  setting,
  store,
  hit
}: {
  setting: Setting
  store: Store
  hit?: { query: string; keyword?: string }
}) {
  const where = store.target(setting)
  const lockedBy = store.locked[setting.id]
  const differs = !lockedBy && setting.control.kind !== "fixed" && store.differs(setting, where)
  const projectChange = where === "project" && setting.scope === "either"

  return (
    <Row
      id={setting.id}
      above={hit && <Place setting={setting} where={where} store={store} />}
      label={
        hit ? (
          <button
            type="button"
            data-result
            onClick={() => store.go(setting.page, setting.id, where)}
            onKeyDown={(event) => arrows(event, "[data-result]")}
            className="-mx-1 rounded-sm px-1 text-left outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Highlight text={setting.label} query={hit.query} />
          </button>
        ) : (
          setting.label
        )
      }
      detail={detailOf(setting, lockedBy, hit)}
      note={
        <>
          {differs && (
            <span className="size-1.5 shrink-0 rounded-full bg-primary">
              <span className="sr-only">{projectChange ? `Changed for ${project.name}` : "Changed"}</span>
            </span>
          )}
          {projectChange && !differs && (
            <span className="text-xs font-normal text-muted-foreground">From every project</span>
          )}
          {where === "app" && store.overridden(setting) && (
            <button
              type="button"
              onClick={() => store.go(setting.page, setting.id, "project")}
              className="rounded-sm text-xs font-normal text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Different in {project.name}
            </button>
          )}
        </>
      }
      marked={store.marked === setting.id}
      reset={
        differs
          ? {
              label: projectChange ? `Use every project's ${setting.label.toLowerCase()}` : `Reset ${setting.label}`,
              onClick: () => store.reset(setting, where)
            }
          : undefined
      }
    >
      <Control
        setting={setting}
        value={store.value(setting, where)}
        disabled={!!lockedBy}
        onChange={(next) => store.change(setting, where, next)}
      />
    </Row>
  )
}

/** A result's place: its page, its extension's for an extension's, and whose value it changes. */
function Place({ setting, where, store }: { setting: Setting; where: View; store: Store }) {
  return (
    <div className="mb-0.5 flex items-center gap-1 text-xs text-muted-foreground">
      {placeOf(setting, store.extensions).map((part, index) => (
        <Fragment key={part}>
          {index > 0 && <ChevronRight className="size-3" aria-hidden />}
          <span>{part}</span>
        </Fragment>
      ))}
      <Badge variant="outline" className="ml-1 h-4 px-1.5 text-[10px] font-normal text-muted-foreground">
        {where === "app" ? "Every project" : project.name}
      </Badge>
    </div>
  )
}

/** A setting's line under its label: what decides it, when something outside Settings does, or its description. */
function detailOf(setting: Setting, lockedBy?: string, hit?: { query: string; keyword?: string }): ReactNode {
  if (lockedBy) {
    return (
      <>
        Set by <code className="font-mono">{lockedBy}</code>
      </>
    )
  }

  if (hit?.keyword) {
    return (
      <>
        Matches “<Highlight text={hit.keyword} query={hit.query} />”
      </>
    )
  }

  return hit && setting.detail ? <Highlight text={setting.detail} query={hit.query} /> : setting.detail
}

function Control({
  setting,
  value,
  disabled,
  onChange
}: {
  setting: Setting
  value: Value
  disabled: boolean
  onChange: (value: Value) => void
}) {
  const control = setting.control

  switch (control.kind) {
    case "switch":
      return (
        <Switch checked={value === true} disabled={disabled} onCheckedChange={onChange} aria-label={setting.label} />
      )
    case "select":
      return (
        <AppSelect
          variant="dialog"
          size="sm"
          className="w-48"
          aria-label={setting.label}
          items={control.options.map((option) => ({ value: option.value, label: <OptionLabel option={option} /> }))}
          value={String(value)}
          disabled={disabled}
          onValueChange={(next) => next && onChange(next)}
        />
      )
    case "text":
    case "number":
      return (
        <Input
          type={control.kind}
          value={String(value)}
          disabled={disabled}
          onChange={(event) =>
            onChange(control.kind === "number" ? Number(event.currentTarget.value) : event.currentTarget.value)
          }
          aria-label={setting.label}
          className="h-8 w-48 font-mono text-xs"
        />
      )
    case "multi":
      return (
        <Multi
          setting={setting}
          options={control.options}
          value={Array.isArray(value) ? value : []}
          onChange={onChange}
        />
      )
    case "fixed":
      return (
        <span className="flex items-center gap-1">
          <code className="font-mono text-xs text-muted-foreground select-all">{String(value)}</code>
          <CopyButton text={String(value)} label={`Copy ${setting.label}`} />
        </span>
      )
    case "file":
      return (
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileJson aria-hidden /> Open {control.file}
        </Button>
      )
  }
}

function OptionLabel({ option }: { option: Option }) {
  const Icon = option.icon

  return (
    <span className="flex items-center gap-2">
      {Icon && <Icon className="size-3.5 text-muted-foreground" aria-hidden />}
      {option.label}
    </span>
  )
}

/** Several choices from a list in a dropdown, keeping at least one. */
function Multi({
  setting,
  options,
  value,
  onChange
}: {
  setting: Setting
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
}) {
  const chosen = options.filter((option) => value.includes(option.value))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className="w-48 justify-between font-normal" aria-label={setting.label} />
        }
      >
        <span className="truncate">{chosen.map((option) => option.label).join(", ")}</span>
        <ChevronDown className="text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          {options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={value.includes(option.value)}
              disabled={value.length === 1 && value.includes(option.value)}
              closeOnClick={false}
              onCheckedChange={(on) =>
                onChange(on ? [...value, option.value] : value.filter((entry) => entry !== option.value))
              }
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Shortcuts() {
  return groups.map((group) => (
    <section key={group} aria-labelledby={`keys-${group}`}>
      <Heading>
        <span id={`keys-${group}`}>{group}</span>
      </Heading>
      <Rows>
        {Object.entries(keymap)
          .filter(([, binding]) => binding.group === group)
          .map(([id, binding]) => (
            <div key={id} className="flex items-center justify-between gap-6 py-2 pr-8">
              <span className="text-sm">{binding.label}</span>
              <Kbd>{formatKeys(binding.keys[0]!, false)}</Kbd>
            </div>
          ))}
      </Rows>
    </section>
  ))
}

/** Every extension installed, those running in this project first, with a filter for when there are many. */
function ExtensionsPage({ store }: { store: Store }) {
  const [filter, setFilter] = useState("")

  const listed = store.extensions.filter((extension) =>
    extension.name.toLowerCase().includes(filter.trim().toLowerCase())
  )

  const sections = [
    { title: `Running in ${project.name}`, items: listed.filter((extension) => extension.running) },
    { title: "Not running", items: listed.filter((extension) => !extension.running) }
  ]

  return (
    <>
      <PageHeader title="Extensions" />
      <InputGroup className="h-8 max-w-72">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
          placeholder="Filter"
          aria-label="Filter extensions"
        />
      </InputGroup>
      {listed.length === 0 && <p className="pt-6 text-sm text-muted-foreground">No extensions match “{filter}”.</p>}
      {sections.flatMap((section) =>
        section.items.length === 0
          ? []
          : [
              <section key={section.title} aria-label={section.title}>
                <Heading>{section.title}</Heading>
                <ul className="divide-y divide-border/60">
                  {section.items.map((extension) => (
                    <li key={extension.id}>
                      <button
                        type="button"
                        data-extension
                        onClick={() => store.go(`ext:${extension.id}`)}
                        onKeyDown={(event) => arrows(event, "[data-extension]")}
                        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2.5 text-left outline-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        <Logo extension={extension} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{extension.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{extension.found}</span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ]
      )}
    </>
  )
}

function Logo({ extension }: { extension: Extension }) {
  const Icon = extension.icon

  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground" aria-hidden>
      <Icon className="size-4" />
    </span>
  )
}

function ExtensionPage({
  extension,
  grants,
  setGrants,
  store
}: {
  extension: Extension
  grants: Record<string, boolean>
  setGrants: (grants: Record<string, boolean>) => void
  store: Store
}) {
  const declared = settings.filter((setting) => setting.page === `ext:${extension.id}`)
  const shown = declared.filter((setting) => shownIn(setting, store.view))

  return (
    <>
      <PageHeader title={extension.name} parent={{ label: "Extensions", onClick: () => store.go("extensions") }} />
      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center gap-3 p-3">
          <Logo extension={extension} />
          <span className="min-w-0 flex-1 truncate text-sm">{extension.found}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`size-1.5 rounded-full ${extension.running ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
            />
            {extension.running ? "Running" : "Not running"}
          </span>
        </div>
        {extension.activation && (
          <dl className="grid grid-cols-3 gap-px border-t bg-border text-sm">
            <Stat label="Started">{extension.activation.event}</Stat>
            <Stat label="Activation">{extension.activation.ms} ms</Stat>
            <Stat label="Memory">{extension.memoryMb} MB</Stat>
          </dl>
        )}
      </div>
      {declared.length > 0 && (
        <>
          <Heading>Settings</Heading>
          {shown.length > 0 && (
            <Rows label="Settings">
              {shown.map((setting) => (
                <SettingRow key={setting.id} setting={setting} store={store} />
              ))}
            </Rows>
          )}
          {shown.length < declared.length && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 gap-1 text-muted-foreground"
              onClick={() => store.go(`ext:${extension.id}`, undefined, store.view === "app" ? "project" : "app")}
            >
              {store.view === "app" ? `${project.name}'s settings` : "Every project's settings"}
              <ChevronRight aria-hidden />
            </Button>
          )}
        </>
      )}
      {extension.adds.length > 0 && (
        <>
          <Heading>Adds</Heading>
          <ul className="flex flex-wrap gap-1.5 py-1">
            {extension.adds.map((item) => (
              <li key={item}>
                <Badge variant="secondary">{item}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
      {store.view === "app" && (
        <>
          <Heading>Permissions</Heading>
          <Rows label="Permissions">
            {extension.permissions.map((permission) => {
              const key = `${extension.id}:${permission.label}`

              return (
                <Row
                  key={permission.label}
                  label={permission.label}
                  detail={permission.grant ? permission.detail : <code className="font-mono">{permission.detail}</code>}
                >
                  {permission.grant && (
                    <Switch
                      checked={grants[key] ?? true}
                      disabled={!extension.running}
                      onCheckedChange={(granted) => setGrants({ ...grants, [key]: granted })}
                      aria-label={`${permission.label}, for ${extension.name}`}
                    />
                  )}
                </Row>
              )
            })}
          </Rows>
        </>
      )}
    </>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-popover px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  )
}

/**
 * Search results: pages and extensions by name, then settings, each with where it is and whose value it changes, and
 * its control, so it can be changed here. A result's name goes to it in its page.
 */
function Results({ query, store }: { query: string; store: Store }) {
  const hits = search(query, store.extensions)
  const places = hits.filter((hit) => hit.kind !== "setting")
  const found = hits.filter((hit): hit is Extract<Hit, { kind: "setting" }> => hit.kind === "setting")

  return (
    <>
      <header className="sticky top-0 z-10 flex h-12 items-center bg-popover pb-2" aria-live="polite">
        <h2 className="truncate text-lg font-semibold">
          {hits.length === 0 ? `Nothing matches “${query}”` : `Results for “${query}”`}
        </h2>
      </header>
      {places.length > 0 && (
        <section aria-label="Pages" className="flex flex-wrap gap-1.5 pb-2">
          {places.map((hit) => {
            const [key, label, Icon, to] =
              hit.kind === "page"
                ? [hit.page.id, hit.page.label, hit.page.icon, hit.page.id]
                : [hit.extension.id, hit.extension.name, hit.extension.icon, `ext:${hit.extension.id}`]

            return (
              <button
                key={key}
                type="button"
                data-result
                onClick={() => store.go(to)}
                onKeyDown={(event) => arrows(event, "[data-result]")}
                className="flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Icon className="size-4 text-muted-foreground" />
                <span>
                  <Highlight text={label} query={query} />
                </span>
                <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
              </button>
            )
          })}
        </section>
      )}
      {found.length > 0 && (
        <Rows label="Settings">
          {found.map((hit) => (
            <SettingRow
              key={hit.setting.id}
              setting={hit.setting}
              store={store}
              hit={{ query, keyword: hit.keyword }}
            />
          ))}
        </Rows>
      )}
    </>
  )
}

/** The text with the start of each word that matches what's typed marked. */
function Highlight({ text, query }: { text: string; query: string }) {
  const typed = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const parts = text.split(/(\s+)/)

  return parts.map((part, index) => {
    const match = typed.find((word) => part.toLowerCase().startsWith(word))

    return match ? (
      <Fragment key={index}>
        <mark className="rounded-sm bg-primary/25 text-inherit">{part.slice(0, match.length)}</mark>
        {part.slice(match.length)}
      </Fragment>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    )
  })
}

function same(a: Value, b: Value): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
